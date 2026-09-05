/**
 * Per-connection voice pipeline state machine: VAD -> STT -> LLM -> TTS, with
 * barge-in, tool relay, mode/mute/ptt/replay handling, and session limits.
 * See planning/CONTRACTS.md §5b for the wire protocol this drives.
 */
import { randomUUID } from 'node:crypto';
import { SentenceChunker } from './chunker.js';
import { streamChatCompletion, type StreamedToolCall } from './llm.js';
import { stripMarkers } from './markers.js';
import { buildModeChangeInstruction, buildSystemInstruction } from './prompt.js';
import { transcribeWithFallback, type SttConfig } from './stt.js';
import { synthesizeSpeech, type TtsConfig } from './tts.js';
import { isToolName } from './tools.js';
import { concatPcm16 } from './wav.js';
import type { Vad } from './vad.js';
import type {
  ChatMessage,
  ClientMessage,
  LearnerContext,
  PassageContext,
  ServerMessage,
  SessionLimits,
  SessionOptions,
  ToolName,
  ToolResult,
  TutorMode,
  VoiceState,
} from './types.js';
import type { LlmConfig } from './llm.js';

export interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface VoiceSessionConfig {
  stt: SttConfig;
  llm: LlmConfig;
  tts: TtsConfig;
  limits: SessionLimits;
}

export type Sender = (msg: ServerMessage) => void;
export type AudioSender = (chunk: Uint8Array) => void;

const MAX_HISTORY_MESSAGES = 24; // ~12 user+assistant turns
const TOOL_RESULT_TIMEOUT_MS = 30_000;
// Pre-roll kept before speech_start fires, so the very start of an
// utterance isn't lost while the VAD's minSpeechMs onset delay ramps up.
// Duration-based (not a frame count): a real browser AudioWorklet posts one
// frame per ~2.7ms render quantum (WS-6 fix — the old `PRE_BUFFER_FRAMES =
// 20` claimed "regardless of frame size" but was ~53ms of real pre-roll at
// that cadence vs. ~400ms with the 20ms frames voice-smoke.ts sends
// manually, so short real-mic utterances like "Guarda la palabra cigarra."
// were losing their first word or two to STT before speech_start caught up).
const PRE_BUFFER_MS = 1200;
const MAX_TOOL_ITERATIONS = 4;

const AUDIO_SAMPLE_RATE = 16000; // CONTRACTS §5b: PCM16 mono 16kHz in from the client

function frameDurationMs(frame: Uint8Array): number {
  return (frame.byteLength / 2 / AUDIO_SAMPLE_RATE) * 1000;
}

function toInt16(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(Math.floor(bytes.byteLength / 2));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

/** Finds how much of a streamed text buffer is safe to release now, holding
 * back a trailing `[[...` that might be an incomplete control marker. */
function safeReleaseIndex(buf: string): number {
  const openIdx = buf.lastIndexOf('[[');
  if (openIdx === -1) return buf.length;
  const closeIdx = buf.indexOf(']]', openIdx);
  if (closeIdx !== -1) return buf.length;
  return openIdx;
}

export class VoiceSession {
  private state: VoiceState = 'idle';
  private mode: TutorMode;
  private readonly learner: LearnerContext;
  private passage: PassageContext;
  private readonly bookTitle: string;
  private readonly savedWords: string[];
  private readonly history: ChatMessage[] = [];
  private pace: 'slow' | 'normal' = 'normal';
  private muted = false;
  private turnMode: 'auto' | 'push' = 'auto';

  private capturingSpeech = false;
  private speechFrames: Uint8Array[] = [];
  private preBuffer: Uint8Array[] = [];
  private preBufferMs = 0;

  private currentAbort: AbortController | null = null;
  private currentUtteranceId: string | null = null;
  private currentUtteranceChunks: Uint8Array[] = [];
  private lastUtterance: { id: string; chunks: Uint8Array[] } | null = null;

  private readonly pendingToolResults = new Map<string, { resolve: (r: ToolResult) => void }>();

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private ended = false;

  constructor(
    public readonly id: string,
    opts: SessionOptions,
    private readonly config: VoiceSessionConfig,
    private readonly vad: Vad,
    private readonly send: Sender,
    private readonly sendAudio: AudioSender,
    private readonly logger: Logger,
    private readonly onEnded: (reason: string) => void,
  ) {
    this.mode = opts.mode;
    this.learner = opts.learner;
    this.passage = opts.passage;
    this.bookTitle = opts.bookId;
    this.savedWords = [...opts.savedWords];

    this.armMaxDurationTimer();
    this.resetIdleTimer();
    this.setState('listening');
  }

  getState(): VoiceState {
    return this.state;
  }

  private setState(s: VoiceState): void {
    if (this.state === s) return;
    this.state = s;
    this.send({ t: 'state', state: s });
  }

  private buildMessages(): ChatMessage[] {
    const system: ChatMessage = {
      role: 'system',
      content: buildSystemInstruction({
        mode: this.mode,
        learner: this.learner,
        bookTitle: this.bookTitle,
        passage: this.passage,
        savedWords: this.savedWords,
      }),
    };
    return [system, ...this.history];
  }

  private trimHistory(): void {
    while (this.history.length > MAX_HISTORY_MESSAGES) this.history.shift();
  }

  // ---- Timers / limits ----

  private armMaxDurationTimer(): void {
    this.maxDurationTimer = setTimeout(() => {
      this.send({ t: 'limit', reason: 'max_duration' });
      this.endSession('max_duration');
    }, this.config.limits.maxMs);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.send({ t: 'limit', reason: 'idle' });
      this.endSession('idle');
    }, this.config.limits.idleMs);
  }

  endSession(reason: string): void {
    if (this.ended) return;
    this.ended = true;
    this.currentAbort?.abort();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
    this.setState('ended');
    this.onEnded(reason);
  }

  // ---- Inbound audio ----

  async receiveAudioFrame(frame: Uint8Array): Promise<void> {
    if (this.ended || this.muted) return;

    if (this.turnMode === 'push') {
      if (this.capturingSpeech) this.speechFrames.push(frame);
      return;
    }

    const int16 = toInt16(frame);
    let events;
    try {
      events = await this.vad.process(int16);
    } catch (err) {
      this.logger.warn({ sessionId: this.id, err: (err as Error).message }, 'vad process failed');
      return;
    }
    for (const ev of events) {
      if (ev.type === 'speech_start') this.onSpeechStart();
      else if (ev.type === 'speech_end') this.onSpeechEnd();
    }

    if (this.capturingSpeech) {
      this.speechFrames.push(frame);
    } else {
      this.preBuffer.push(frame);
      this.preBufferMs += frameDurationMs(frame);
      while (this.preBufferMs > PRE_BUFFER_MS && this.preBuffer.length > 0) {
        this.preBufferMs -= frameDurationMs(this.preBuffer.shift()!);
      }
    }
  }

  private onSpeechStart(): void {
    this.resetIdleTimer();
    this.bargeIn();
    this.capturingSpeech = true;
    this.speechFrames = [...this.preBuffer];
  }

  private onSpeechEnd(): void {
    this.capturingSpeech = false;
    if (this.speechFrames.length === 0) return;
    const segment = concatPcm16(this.speechFrames);
    this.speechFrames = [];
    this.preBuffer = [];
    this.preBufferMs = 0;
    this.handleLearnerSegment(segment).catch((err) =>
      this.emitError('unexpected_pipeline_error', err),
    );
  }

  // ---- Inbound JSON messages ----

  async receiveMessage(msg: ClientMessage): Promise<void> {
    switch (msg.t) {
      case 'mode':
        await this.handleModeChange(msg.mode);
        break;
      case 'mute':
        this.muted = msg.muted;
        if (this.muted) {
          this.capturingSpeech = false;
          this.speechFrames = [];
          this.preBuffer = [];
          this.preBufferMs = 0;
          this.setState('muted');
        } else if (this.state === 'muted') {
          this.setState('listening');
        }
        break;
      case 'ptt':
        this.handlePtt(msg.active);
        break;
      case 'interrupt':
        this.bargeIn();
        break;
      case 'replay':
        this.replayLast();
        break;
      case 'text':
        this.resetIdleTimer();
        this.send({ t: 'caption', speaker: 'learner', text: msg.text, final: true });
        await this.handleLearnerText(msg.text);
        break;
      case 'tool_result':
        this.resolveToolResult(msg.callId, { ok: msg.ok, result: msg.result, error: msg.error });
        break;
      case 'passage':
        this.passage = msg.passage;
        break;
      case 'end':
        this.endSession('end');
        break;
    }
  }

  private handlePtt(active: boolean): void {
    this.turnMode = 'push';
    if (active) {
      this.resetIdleTimer();
      this.bargeIn();
      this.capturingSpeech = true;
      this.speechFrames = [];
    } else {
      this.capturingSpeech = false;
      if (this.speechFrames.length > 0) {
        const segment = concatPcm16(this.speechFrames);
        this.speechFrames = [];
        this.handleLearnerSegment(segment).catch((err) =>
          this.emitError('unexpected_pipeline_error', err),
        );
      }
    }
  }

  private replayLast(): void {
    if (!this.lastUtterance) return;
    const { id, chunks } = this.lastUtterance;
    this.send({ t: 'audio_start', utteranceId: id });
    for (const c of chunks) this.sendAudio(c);
    this.send({ t: 'audio_end', utteranceId: id });
  }

  /** Cancels any in-flight LLM/TTS work and, if an utterance was streaming,
   * closes it out as cancelled. No-op when nothing is in flight. */
  private bargeIn(): void {
    const hadAbort = !!this.currentAbort;
    this.currentAbort?.abort();
    this.currentAbort = null;

    if (this.currentUtteranceId) {
      this.lastUtterance = { id: this.currentUtteranceId, chunks: this.currentUtteranceChunks };
      this.send({ t: 'audio_end', utteranceId: this.currentUtteranceId, cancelled: true });
      this.currentUtteranceId = null;
      this.currentUtteranceChunks = [];
    }
    if (hadAbort) this.setState('listening');
  }

  private resolveToolResult(callId: string, result: ToolResult): void {
    const pending = this.pendingToolResults.get(callId);
    if (!pending) return;
    this.pendingToolResults.delete(callId);
    this.logger.info({ sessionId: this.id, callId, ok: result.ok }, 'tool_result received');
    pending.resolve(result);
  }

  private emitError(code: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.warn({ sessionId: this.id, code, err: message }, 'voice pipeline error');
    this.send({ t: 'error', code, message, recoverable: true });
    if (this.state !== 'ended') this.setState('listening');
  }

  // ---- Learner turn handling ----

  private async handleLearnerSegment(segment: Uint8Array): Promise<void> {
    this.setState('thinking');
    const sttStart = Date.now();
    try {
      const { text } = await transcribeWithFallback(
        segment,
        16000,
        this.learner.learningLocale,
        this.learner.explanationLocale,
        this.config.stt,
      );
      this.logger.info(
        { sessionId: this.id, stt_ms: Date.now() - sttStart, captionLength: text.length },
        'stt complete',
      );
      if (!text) {
        if (this.state !== 'ended') this.setState('listening');
        return;
      }
      this.send({ t: 'caption', speaker: 'learner', text, final: true });
      await this.runLlmTurn(text);
    } catch (err) {
      this.emitError('stt_failed', err);
    }
  }

  private async handleLearnerText(text: string): Promise<void> {
    try {
      await this.runLlmTurn(text);
    } catch (err) {
      this.emitError('llm_failed', err);
    }
  }

  private async relayToolCall(
    tc: StreamedToolCall,
    signal: AbortSignal,
  ): Promise<{ callId: string; name: ToolName; result: ToolResult }> {
    let args: unknown = {};
    try {
      args = tc.arguments.trim() ? JSON.parse(tc.arguments) : {};
    } catch {
      args = {};
    }

    if (!isToolName(tc.name)) {
      return {
        callId: tc.id,
        name: tc.name as ToolName,
        result: { ok: false, error: `unknown tool ${tc.name}` },
      };
    }
    const name = tc.name;

    const result = await new Promise<ToolResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingToolResults.delete(tc.id);
        this.logger.warn({ sessionId: this.id, callId: tc.id, name }, 'tool_result timeout');
        resolve({ ok: false, error: 'timeout' });
      }, TOOL_RESULT_TIMEOUT_MS);

      const onAbort = () => {
        clearTimeout(timer);
        this.pendingToolResults.delete(tc.id);
        resolve({ ok: false, error: 'cancelled' });
      };
      signal.addEventListener('abort', onAbort, { once: true });

      this.pendingToolResults.set(tc.id, {
        resolve: (r) => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          resolve(r);
        },
      });

      this.send({ t: 'tool_call', callId: tc.id, name, args });
    });

    return { callId: tc.id, name, result };
  }

  private async flushSentence(sentence: string, abort: AbortController): Promise<void> {
    if (abort.signal.aborted) return;
    this.setState('speaking');
    if (!this.currentUtteranceId) {
      this.currentUtteranceId = randomUUID();
      this.currentUtteranceChunks = [];
      this.send({ t: 'audio_start', utteranceId: this.currentUtteranceId });
    }
    const utteranceId = this.currentUtteranceId;
    const ttsStart = Date.now();
    let first = true;
    await synthesizeSpeech(
      sentence,
      this.learner.learningLocale,
      this.pace === 'slow' ? 0.85 : 1.0,
      this.config.tts,
      (chunk) => {
        if (abort.signal.aborted) return;
        if (first) {
          this.logger.info(
            { sessionId: this.id, tts_first_audio_ms: Date.now() - ttsStart },
            'tts first audio',
          );
          first = false;
        }
        if (this.currentUtteranceId === utteranceId) this.currentUtteranceChunks.push(chunk);
        this.sendAudio(chunk);
      },
      abort.signal,
    );
    if (!abort.signal.aborted) {
      this.send({ t: 'caption', speaker: 'tutor', text: sentence, final: false });
    }
  }

  private async runLlmTurn(userText: string): Promise<void> {
    this.history.push({ role: 'user', content: userText });
    this.trimHistory();

    const abort = new AbortController();
    this.currentAbort = abort;
    this.setState('thinking');

    const llmStart = Date.now();
    let firstTokenAt: number | null = null;
    let finalText = '';
    let messages = this.buildMessages();

    try {
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const chunker = new SentenceChunker();
        let rawBuffer = '';
        let turnText = '';
        this.currentUtteranceId = null;
        this.currentUtteranceChunks = [];

        const { text: rawText, toolCalls } = await streamChatCompletion(
          messages,
          this.config.llm,
          {
            onTextDelta: async (delta) => {
              if (firstTokenAt === null) {
                firstTokenAt = Date.now();
                this.logger.info(
                  { sessionId: this.id, llm_first_token_ms: firstTokenAt - llmStart },
                  'llm first token',
                );
              }
              rawBuffer += delta;
              const safeIdx = safeReleaseIndex(rawBuffer);
              const release = rawBuffer.slice(0, safeIdx);
              rawBuffer = rawBuffer.slice(safeIdx);
              if (!release) return;

              const { text: clean, readingTokenIds, pace } = stripMarkers(release);
              if (readingTokenIds.length > 0)
                this.send({ t: 'reading', tokenIds: readingTokenIds });
              if (pace) this.pace = pace;
              turnText += clean;

              for (const sentence of chunker.push(clean)) {
                await this.flushSentence(sentence, abort);
              }
            },
          },
          abort.signal,
        );

        const { text: cleanRest, readingTokenIds, pace } = stripMarkers(rawBuffer);
        if (readingTokenIds.length > 0) this.send({ t: 'reading', tokenIds: readingTokenIds });
        if (pace) this.pace = pace;
        turnText += cleanRest;

        for (const sentence of [...chunker.push(cleanRest), ...chunker.flush()]) {
          await this.flushSentence(sentence, abort);
        }

        if (this.currentUtteranceId && !abort.signal.aborted) {
          this.send({ t: 'audio_end', utteranceId: this.currentUtteranceId });
          this.lastUtterance = { id: this.currentUtteranceId, chunks: this.currentUtteranceChunks };
        }
        this.currentUtteranceId = null;

        if (turnText.trim() && !abort.signal.aborted) {
          this.send({ t: 'caption', speaker: 'tutor', text: turnText.trim(), final: true });
        }
        finalText += (finalText ? ' ' : '') + turnText.trim();

        if (toolCalls.length === 0 || abort.signal.aborted) break;

        messages = [
          ...messages,
          {
            role: 'assistant',
            content: rawText,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          },
        ];
        this.setState('thinking');
        for (const tc of toolCalls) {
          const { callId, name, result } = await this.relayToolCall(tc, abort.signal);
          messages = [
            ...messages,
            { role: 'tool', tool_call_id: callId, name, content: JSON.stringify(result) },
          ];
        }
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        this.emitError('llm_pipeline_failed', err);
        this.currentAbort = null;
        return;
      }
    }

    this.currentAbort = null;
    if (finalText.trim()) {
      this.history.push({ role: 'assistant', content: finalText.trim() });
      this.trimHistory();
    }
    if (this.state !== 'ended') this.setState('listening');
  }

  private async handleModeChange(mode: TutorMode): Promise<void> {
    this.mode = mode;
    const abort = new AbortController();
    this.currentAbort = abort;
    this.setState('thinking');
    try {
      const instruction = buildModeChangeInstruction(mode, this.learner.explanationLocale);
      const { text } = await streamChatCompletion(
        [{ role: 'system', content: instruction }],
        this.config.llm,
        {},
        abort.signal,
      );
      const { text: clean } = stripMarkers(text);
      const sentence = clean.trim();
      if (sentence && !abort.signal.aborted) {
        const utteranceId = randomUUID();
        this.setState('speaking');
        this.send({ t: 'audio_start', utteranceId });
        const chunks: Uint8Array[] = [];
        await synthesizeSpeech(
          sentence,
          this.learner.learningLocale,
          1.0,
          this.config.tts,
          (chunk) => {
            if (abort.signal.aborted) return;
            chunks.push(chunk);
            this.sendAudio(chunk);
          },
          abort.signal,
        );
        if (!abort.signal.aborted) {
          this.send({ t: 'caption', speaker: 'tutor', text: sentence, final: true });
          this.send({ t: 'audio_end', utteranceId });
          this.lastUtterance = { id: utteranceId, chunks };
        }
      }
    } catch (err) {
      if (!abort.signal.aborted) this.emitError('mode_change_failed', err);
    } finally {
      this.currentAbort = null;
      if (this.state !== 'ended') this.setState('listening');
    }
  }
}
