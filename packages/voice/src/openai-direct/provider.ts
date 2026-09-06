/**
 * OpenAIDirectProvider — the bring-your-own-key tutor (lane R4-B2).
 *
 * Same four-mode tutor as `LocalCascadeProvider` and
 * `BrowserCascadeProvider`, with no server of ours anywhere in the path:
 * mic -> energy VAD -> `POST /v1/audio/transcriptions` -> the shared
 * `TutorTurnRunner` against streaming `POST /v1/chat/completions` ->
 * `POST /v1/audio/speech` -> `AudioAdapter.playPcm`. The learner's own key
 * goes in the `Authorization` header and nowhere else; api.openai.com is the
 * only host this file talks to (see api.ts's header note).
 *
 * Structurally this is `browser-cascade/worker.ts`'s session loop moved onto
 * the main thread: there are no models to download and no ML library to keep
 * out of Metro, so there is no worker and no `postMessage` hop. Every seam
 * it reuses — `TutorTurnRunner`/`LlmEngine`, `EnergyVad`/`SpeechBuffer`,
 * `SentenceChunker` + the `[[reading]]`/`[[pace]]` markers (inside the turn
 * runner), the `AudioAdapter` — is the same code the other two providers
 * run, so the voice screen, captions, SessionBar and the seven client-side
 * tools work unchanged.
 *
 * Browser-direct calls to these three endpoints with a user key were proven
 * live on iPhone-shaped WebKit and desktop Chromium in R4-B1 phase 2
 * (docs/evidence/byok-cors-2026-09-05.log). Realtime is deliberately NOT
 * used here: the GA WebSocket handshake works browser-direct too (same log),
 * but planning/STRATEGY.md keeps the measured cascade as the shipped path.
 */
import {
  buildSystemInstruction,
  sttLanguageHint,
  type ToolResult,
  type TutorMode,
} from '@sotto/core';
import type { VoiceEvent, VoiceState } from '../events.ts';
import type { SessionOptions, VoiceProvider } from '../provider.ts';
import type { AudioAdapter } from '../transports/audio-adapter.ts';
import { TutorTurnRunner, type ToolCallResult } from '../browser-cascade/llm-turn.ts';
import { EnergyVad, SpeechBuffer } from '../browser-cascade/vad.ts';
import { micErrorCode } from '../mic-error.ts';
import {
  byokError,
  CAPTURE_SAMPLE_RATE,
  OpenAIChatEngine,
  speak,
  transcribe,
  TUTOR_SAMPLE_RATE,
  voiceForLocale,
} from './api.ts';

/** Same defaults as apps/server's session limits (CONTRACTS §5b). */
const DEFAULT_LIMITS = { maxMs: 1_200_000, idleMs: 90_000 };
const TOOL_RESULT_TIMEOUT_MS = 30_000;
const MAX_TOOL_ITERATIONS = 4;
const MAX_HISTORY_MESSAGES = 24;

export interface OpenAIDirectOptions {
  /** The learner's own key. Read from device storage by the caller
   * (apps/client/src/voice/byokKey.ts); never persisted by this class. */
  apiKey: string;
  audio: AudioAdapter;
  fetch?: typeof fetch;
  baseUrl?: string;
  limits?: { maxMs: number; idleMs: number };
  models?: { stt?: string; llm?: string; tts?: string };
}

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export class OpenAIDirectProvider implements VoiceProvider {
  private readonly apiKey: string;
  private readonly audio: AudioAdapter;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl?: string;
  private readonly limits: { maxMs: number; idleMs: number };
  private readonly models: { stt?: string; llm?: string; tts?: string };

  private listeners = new Set<(e: VoiceEvent) => void>();
  private state: VoiceState = 'idle';

  private opts: SessionOptions | null = null;
  private engine: OpenAIChatEngine | null = null;
  private turnRunner: TutorTurnRunner | null = null;
  private vad = new EnergyVad();
  private buffer = new SpeechBuffer(CAPTURE_SAMPLE_RATE);

  private ended = true;
  private capturing = false;
  private muted = false;
  private turnMode: 'auto' | 'push' = 'auto';
  private pace: 'slow' | 'normal' = 'normal';

  private currentAbort: AbortController | null = null;
  private currentTurnPromise: Promise<void> | null = null;
  private currentUtteranceId: string | null = null;
  private currentUtteranceChunks: ArrayBuffer[] = [];
  private lastUtterance: { id: string; chunks: ArrayBuffer[] } | null = null;
  private pendingToolResults = new Map<
    string,
    { resolve: (r: ToolCallResult) => void; timer: ReturnType<typeof setTimeout> }
  >();

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: OpenAIDirectOptions) {
    this.apiKey = options.apiKey;
    this.audio = options.audio;
    // Same receiver hazard LocalCascadeProvider documents.
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
    this.baseUrl = options.baseUrl;
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.models = options.models ?? {};
  }

  // ---- VoiceProvider ----

  on(listener: (e: VoiceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(opts: SessionOptions): Promise<void> {
    this.opts = opts;
    this.ended = false;
    this.muted = false;
    this.turnMode = 'auto';
    this.pace = 'normal';
    this.vad = new EnergyVad();
    this.buffer = new SpeechBuffer(CAPTURE_SAMPLE_RATE);
    this.emit({ type: 'state', state: 'connecting' });

    this.engine = new OpenAIChatEngine({
      apiKey: this.apiKey,
      fetch: this.fetchImpl,
      ...(this.baseUrl ? { baseUrl: this.baseUrl } : {}),
      ...(this.models.llm ? { model: this.models.llm } : {}),
    });
    this.turnRunner = this.makeTurnRunner();

    this.armLimits();
    // run7/F1 directive 2: a suspended/blocked playback AudioContext used to
    // have no code path that would ever surface it. One listener per
    // session; the adapter itself de-dupes repeated reports.
    this.audio.onPlaybackBlocked?.(() => {
      this.emit({
        type: 'error',
        code: 'playback_blocked',
        message: 'Playback is blocked; tap to resume.',
        recoverable: true,
      });
    });

    try {
      await this.audio.startCapture((buf) => this.handleFrame(buf));
      this.capturing = true;
    } catch (err) {
      this.emit({
        type: 'error',
        code: micErrorCode(err),
        message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        recoverable: false,
      });
      this.emit({ type: 'state', state: 'error' });
      return;
    }
    // Nothing to load: unlike the browser tutor there are no weights, so the
    // session is listening as soon as the microphone is open.
    this.emit({ type: 'state', state: 'listening' });
  }

  async disconnect(): Promise<void> {
    this.ended = true;
    this.interruptInternal();
    this.stopEverything();
    this.emit({ type: 'state', state: 'ended' });
  }

  setMode(mode: TutorMode): void {
    // The system instruction is rebuilt from `this.opts` on every turn, so
    // this is all a mode switch needs.
    if (this.opts) this.opts = { ...this.opts, mode };
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.buffer.clear();
      this.vad.reset();
      this.emit({ type: 'state', state: 'muted' });
    } else {
      this.emit({ type: 'state', state: 'listening' });
    }
  }

  pushToTalk(active: boolean): void {
    this.turnMode = 'push';
    if (active) {
      this.buffer.clear();
      this.buffer.start();
      return;
    }
    const segment = this.buffer.end();
    if (segment) void this.transcribeSegment(segment);
  }

  interrupt(): void {
    this.audio.stopPlayback();
    this.interruptInternal();
  }

  replayLast(): void {
    if (!this.lastUtterance) return;
    for (const chunk of this.lastUtterance.chunks) {
      this.audio.playPcm(chunk.slice(0) as ArrayBuffer, TUTOR_SAMPLE_RATE);
    }
    this.diagnostic('audio_end', `replay ${this.lastUtterance.id}`);
  }

  /** run7/F1: the tap action for a `playback_blocked` error event. */
  resumePlayback(): void {
    void this.audio.resumePlayback?.();
  }

  sendText(text: string): void {
    if (this.ended) return;
    this.emit({ type: 'caption', speaker: 'learner', text, final: true });
    this.resetIdleTimer();
    void this.runTurn(text);
  }

  respondTool(callId: string, result: ToolResult): void {
    const pending = this.pendingToolResults.get(callId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingToolResults.delete(callId);
    // Same flattening the other two providers use: @sotto/core's ToolResult
    // is a union of success shapes plus ToolFailure, and only an explicit
    // `ok: false` is a failure.
    if ('ok' in result && result.ok === false) {
      pending.resolve({ ok: false, error: result.error });
    } else {
      pending.resolve({ ok: true, result });
    }
  }

  // ---- internals ----

  private emit(e: VoiceEvent): void {
    if (e.type === 'state') this.state = e.state;
    for (const l of this.listeners) l(e);
  }

  /** Loaded state, for the voice screen's diagnostics and the e2e log. */
  get currentState(): VoiceState {
    return this.state;
  }

  /**
   * Local-only diagnostics, mirroring BrowserCascadeProvider's `metric`
   * console line. Never leaves the browser (product rule: no telemetry) and
   * never carries key material — the e2e harness reads these off the console
   * to prove a turn completed.
   */
  private diagnostic(name: string, detail?: string): void {
    console.info(`[sotto-byok] ${name}${detail ? ` ${detail}` : ''}`);
  }

  private armLimits(): void {
    this.maxDurationTimer = setTimeout(() => {
      this.emit({ type: 'limit', reason: 'max_duration' });
      void this.disconnect();
    }, this.limits.maxMs);
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.emit({ type: 'limit', reason: 'idle' });
      void this.disconnect();
    }, this.limits.idleMs);
  }

  private stopEverything(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
    this.idleTimer = null;
    this.maxDurationTimer = null;
    for (const pending of this.pendingToolResults.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, error: 'session ended' });
    }
    this.pendingToolResults.clear();
    if (this.capturing) {
      this.audio.stopCapture();
      this.capturing = false;
    }
    this.audio.stopPlayback();
  }

  /** Cancels any in-flight LLM/TTS work for the current turn — the same
   * `bargeIn()` semantics as the server and the browser worker. No-op when
   * nothing is in flight. */
  private interruptInternal(): void {
    const hadAbort = !!this.currentAbort;
    this.currentAbort?.abort();
    this.currentAbort = null;
    if (this.currentUtteranceId) {
      this.lastUtterance = {
        id: this.currentUtteranceId,
        chunks: this.currentUtteranceChunks,
      };
      this.diagnostic('audio_end', `${this.currentUtteranceId} cancelled`);
      this.currentUtteranceId = null;
      this.currentUtteranceChunks = [];
    }
    if (hadAbort && !this.ended) this.emit({ type: 'state', state: 'listening' });
  }

  private handleFrame(pcm: ArrayBuffer): void {
    if (this.ended || this.muted) return;
    const frame = new Int16Array(pcm);

    if (this.turnMode === 'push') {
      this.buffer.push(frame);
      return;
    }

    for (const ev of this.vad.process(frame)) {
      if (ev.type === 'speech_start') {
        // New speech interrupts whatever turn is in flight rather than
        // racing it — same as the server's onSpeechStart -> bargeIn().
        this.audio.stopPlayback();
        this.interruptInternal();
        this.buffer.start();
        this.resetIdleTimer();
      } else if (ev.type === 'speech_end') {
        const segment = this.buffer.end();
        if (segment) void this.transcribeSegment(segment);
      }
    }
    this.buffer.push(frame);
  }

  private async transcribeSegment(segment: Int16Array): Promise<void> {
    if (this.ended || !this.opts) return;
    this.emit({ type: 'state', state: 'thinking' });
    const started = Date.now();
    try {
      const text = await transcribe({
        apiKey: this.apiKey,
        pcm: segment,
        prompt: sttLanguageHint(this.opts.learner),
        fetch: this.fetchImpl,
        ...(this.baseUrl ? { baseUrl: this.baseUrl } : {}),
        ...(this.models.stt ? { model: this.models.stt } : {}),
      });
      this.diagnostic('stt_ms', String(Date.now() - started));
      if (!text) {
        if (!this.ended) this.emit({ type: 'state', state: 'listening' });
        return;
      }
      this.emit({ type: 'caption', speaker: 'learner', text, final: true });
      this.resetIdleTimer();
      await this.runTurn(text);
    } catch (err) {
      this.failTurn(err);
    }
  }

  private makeTurnRunner(): TutorTurnRunner {
    return new TutorTurnRunner({
      engine: this.engine!,
      maxHistory: MAX_HISTORY_MESSAGES,
      maxToolIterations: MAX_TOOL_ITERATIONS,
      buildSystemInstruction: () =>
        buildSystemInstruction({
          mode: this.opts!.mode,
          learner: this.opts!.learner,
          bookTitle: this.opts!.bookId,
          passage: this.opts!.passage,
          savedWords: this.opts!.savedWords,
        }),
      requestTool: (callId, name, args) => this.requestTool(callId, name, args),
      onState: (state) => {
        if (!this.ended) this.emit({ type: 'state', state });
      },
      onReading: (tokenIds) => this.emit({ type: 'reading', tokenIds }),
      onPace: (pace) => {
        this.pace = pace;
      },
      onSentence: (sentence) => this.speakSentence(sentence),
      onTutorCaption: (text, final) =>
        this.emit({ type: 'caption', speaker: 'tutor', text, final }),
    });
  }

  private requestTool(callId: string, name: string, args: unknown): Promise<ToolCallResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingToolResults.delete(callId);
        resolve({ ok: false, error: 'timeout' });
      }, TOOL_RESULT_TIMEOUT_MS);
      this.pendingToolResults.set(callId, { resolve, timer });
      this.emit({ type: 'tool_call', callId, name: name as never, args });
    });
  }

  /** One complete sentence, spoken then captioned — the same order as the
   * server's `flushSentence` and the worker's `speakSentence`. Unlike the
   * in-browser tutor this speaks every language, not English only. */
  private async speakSentence(sentence: string): Promise<void> {
    const abort = this.currentAbort;
    if (!abort || abort.signal.aborted || !this.opts) return;

    this.emit({ type: 'state', state: 'speaking' });
    if (!this.currentUtteranceId) {
      this.currentUtteranceId = randomId();
      this.currentUtteranceChunks = [];
      this.diagnostic('audio_start', this.currentUtteranceId);
    }
    const utteranceId = this.currentUtteranceId;
    let notSpoken = false;
    try {
      const pcm = await speak({
        apiKey: this.apiKey,
        text: sentence,
        voice: voiceForLocale(this.opts.learner.learningLocale),
        speed: this.pace === 'slow' ? 0.85 : 1.0,
        fetch: this.fetchImpl,
        signal: abort.signal,
        ...(this.baseUrl ? { baseUrl: this.baseUrl } : {}),
        ...(this.models.tts ? { model: this.models.tts } : {}),
      });
      if (abort.signal.aborted || this.currentUtteranceId !== utteranceId) return;
      this.currentUtteranceChunks.push(pcm);
      this.audio.playPcm(pcm, TUTOR_SAMPLE_RATE);
    } catch (err) {
      if (abort.signal.aborted) return;
      // run7/F1 directive 1: a failed sentence degrades to caption-only
      // rather than killing the turn — the learner still gets the reply in
      // text — but every speech failure now emits an `error` VoiceEvent
      // (previously only the non-recoverable 401/403 case did; a 429 or any
      // transient/network failure was swallowed to a console-only
      // diagnostic while the caption fired as if the sentence had been
      // spoken normally, the exact "reply appears as text, never spoken"
      // defect from BUGS-TUTOR-RUN5.md and this lane's recon). The caption
      // below carries `notSpoken: true` so the UI can tell this sentence
      // apart from one that actually played.
      const mapped = byokError(err, { stage: 'speech' });
      this.diagnostic('tts_failed', mapped.code);
      this.emit({ type: 'error', ...mapped });
      notSpoken = true;
    }

    if (!abort.signal.aborted) {
      this.emit({
        type: 'caption',
        speaker: 'tutor',
        text: sentence,
        final: false,
        ...(notSpoken ? { notSpoken: true } : {}),
      });
    }
  }

  private async runTurn(learnerText: string): Promise<void> {
    // Serialize turns: a barge-in only flips the abort flag, so wait for the
    // previous run to unwind before starting another (the hazard
    // browser-cascade/worker.ts documents on `currentTurnPromise`).
    if (this.currentTurnPromise) await this.currentTurnPromise.catch(() => undefined);
    if (this.ended || !this.turnRunner) return;
    const runPromise = this.runTurnBody(learnerText);
    this.currentTurnPromise = runPromise;
    try {
      await runPromise;
    } finally {
      if (this.currentTurnPromise === runPromise) this.currentTurnPromise = null;
    }
  }

  private async runTurnBody(learnerText: string): Promise<void> {
    const abort = new AbortController();
    this.currentAbort = abort;
    this.currentUtteranceId = null;
    this.currentUtteranceChunks = [];
    try {
      await this.turnRunner!.run(learnerText, abort.signal);
    } catch (err) {
      if (!abort.signal.aborted) this.failTurn(err);
    }
    if (this.currentUtteranceId && !abort.signal.aborted) {
      this.lastUtterance = { id: this.currentUtteranceId, chunks: this.currentUtteranceChunks };
      this.diagnostic('audio_end', this.currentUtteranceId);
    }
    this.currentUtteranceId = null;
    if (this.currentAbort === abort) this.currentAbort = null;
  }

  private failTurn(err: unknown): void {
    if (err instanceof Error && err.name === 'AbortError') return;
    const mapped = byokError(err);
    this.emit({ type: 'error', ...mapped });
    if (this.ended) return;
    this.emit({ type: 'state', state: mapped.recoverable ? 'listening' : 'error' });
  }
}
