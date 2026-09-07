/**
 * Tutor worker — the ONLY module in this repo that imports an ML library.
 *
 * It is deliberately NOT reachable from the Expo/Metro module graph: nothing
 * imports it, `packages/voice/src/index.ts` does not export it, and
 * `apps/client/scripts/build-tutor-worker.mjs` bundles it with esbuild into
 * `apps/client/public/tutor/tutor-worker.js`, which the provider spawns by
 * URL. That is what keeps @huggingface/transformers, @mlc-ai/web-llm and
 * kokoro-js out of the app bundle — see planning/BROWSER-TUTOR.md
 * §"Keeping ML out of Metro".
 *
 * Slice 1: PCM16 frames in -> energy VAD -> whisper -> learner `caption`.
 * Slice 2: the transcribed (or typed) text drives a `TutorTurnRunner`
 * (llm-turn.ts) against a WebLLM Qwen3 engine — sentence-chunked captions,
 * `reading`/`pace` markers, and a full tool-call round trip relayed through
 * the main thread.
 * Slice 3: each sentence is also handed to Kokoro for speech. See the
 * honesty note above `speakSentence` for what that does and does not cover.
 */
import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from '@huggingface/transformers';
import { CreateMLCEngine, type MLCEngine } from '@mlc-ai/web-llm';
import { KokoroTTS } from 'kokoro-js';
import { buildSystemInstruction, TOOL_DEFINITIONS, type TutorPassageContext } from '@sotto/core';
import type { VoiceState } from '../events.ts';
import { EnergyVad, SpeechBuffer } from './vad.ts';
import { isDegenerateTranscript, SttFallbackTracker } from './stt-fallback.ts';
import {
  TutorTurnRunner,
  type ChatMessage,
  type EngineChatHandlers,
  type EngineToolCall,
  type LlmEngine,
  type ToolCallResult,
} from './llm-turn.ts';
import { TTS_MODEL } from './models.ts';
import {
  WORKER_SAMPLE_RATE,
  TUTOR_SAMPLE_RATE,
  type MainToWorker,
  type ModelProgress,
  type WorkerInitPayload,
  type WorkerToMain,
} from './protocol.ts';

// Weights come from the Hugging Face hub / MLC's CDN on opt-in; the
// onnxruntime wasm runtime is served from our own origin (copied into
// public/tutor/ort by the build script) so the app has exactly one
// third-party host to reach, and only while downloading.
env.allowLocalModels = false;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = '/tutor/ort/';

const ctx = self as unknown as {
  postMessage(msg: WorkerToMain, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<MainToWorker>) => void) | null;
};

function post(msg: WorkerToMain, transfer?: Transferable[]): void {
  ctx.postMessage(msg, transfer);
}

function iso639(locale: string): string {
  return locale.split(/[-_]/)[0]!.toLowerCase();
}

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ---- STT (slice 1) ----

let sttPipeline: AutomaticSpeechRecognitionPipeline | null = null;
let sttDevice: 'webgpu' | 'wasm' | null = null;

function progressReporter(modelId: string): (info: ProgressInfo) => void {
  return (info) => {
    const p = info as ProgressInfo & {
      status: string;
      loaded?: number;
      total?: number;
      progress?: number;
    };
    let phase: ModelProgress['phase'] = 'loading';
    if (p.status === 'progress' || p.status === 'download' || p.status === 'initiate')
      phase = 'downloading';
    else if (p.status === 'ready' || p.status === 'done') phase = 'done';

    const loadedBytes = p.loaded ?? 0;
    const totalBytes = p.total && p.total > 0 ? p.total : null;
    post({
      t: 'progress',
      progress: {
        modelId,
        fraction:
          typeof p.progress === 'number'
            ? Math.max(0, Math.min(1, p.progress / 100))
            : totalBytes
              ? loadedBytes / totalBytes
              : null,
        loadedBytes,
        totalBytes,
        phase,
      },
    });
  };
}

/**
 * models.ts's encoder dtype (fp16) is a WebGPU-only export: the wasm/CPU
 * execution provider cannot even build a session from that graph — verified
 * live (docs/evidence/browser-tutor-stt-regression-2026-09-05.log,
 * experiment (d)) as a hard `Can't create a session` ORT_FAIL, not the
 * silent upcast this repo's own models.ts comment assumed. So the wasm
 * fallback needs the fp32 encoder that models.ts already measured as
 * correct — only the WebGPU path gets the smaller fp16 one.
 */
/**
 * The catalog dtype (models.ts's `STT_MODEL.dtype`) is fp32 encoder / q8
 * decoder — fp32 fixed the WebGPU decode-collapse regression (see the big
 * comment on `STT_MODEL`). That q8 decoder still fails outright on wasm's
 * CPU execution provider ("Can't create a session" — a hard graph-build
 * failure, not the silent upcast this repo's own comment once assumed;
 * verified live, docs/evidence/browser-tutor-stt-regression-2026-09-05.log
 * experiment (d)), so the wasm path additionally upgrades the decoder to
 * fp32 — the combination models.ts's own accuracy measurement already
 * covers.
 */
function dtypeForDevice(
  dtype: Record<string, string>,
  device: 'webgpu' | 'wasm',
): Record<string, string> {
  if (device !== 'wasm' || !dtype.decoder_model_merged) return dtype;
  return { ...dtype, decoder_model_merged: 'fp32' };
}

/**
 * Loads whisper, preferring WebGPU and falling back to wasm. `dtype` is
 * per sub-model (whisper exports an encoder and a merged decoder, and the
 * two want different precisions — see models.ts for the measurements).
 */
async function loadStt(
  spec: WorkerInitPayload['stt'],
  forceDevice?: 'webgpu' | 'wasm',
): Promise<void> {
  if (sttPipeline) return;
  const dtype = spec.dtype;
  const started = Date.now();

  const attempts: Array<'webgpu' | 'wasm'> = forceDevice
    ? [forceDevice]
    : typeof navigator !== 'undefined' && 'gpu' in navigator
      ? ['webgpu', 'wasm']
      : ['wasm'];

  let lastError: unknown = null;
  for (const device of attempts) {
    try {
      sttPipeline = (await pipeline('automatic-speech-recognition', spec.id, {
        device,
        dtype: dtypeForDevice(dtype, device) as never,
        progress_callback: progressReporter(spec.id),
      })) as AutomaticSpeechRecognitionPipeline;
      sttDevice = device;
      post({ t: 'metric', name: 'stt_load_ms', ms: Date.now() - started, detail: device });
      return;
    } catch (err) {
      lastError = err;
      post({
        t: 'metric',
        name: 'stt_load_failed',
        ms: Date.now() - started,
        detail: `${device}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error('stt load failed');
}

// ---- LLM (slice 2) ----

/** Converts our transport-agnostic ChatMessage into WebLLM's OpenAI-shaped
 * message param. WebLLM's tool message has no `name` field (unlike the
 * server's), so it's dropped rather than sent somewhere it isn't read. */
function toWebLlmMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'tool')
      return { role: 'tool', content: m.content, tool_call_id: m.tool_call_id };
    if (m.role === 'assistant')
      return {
        role: 'assistant',
        content: m.content,
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      };
    return { role: m.role, content: m.content };
  });
}

const TOOL_BLOCK_RE = /```tool\s*([\s\S]*?)```/;

/** Fallback protocol (Slice 2 checklist #4) for a Qwen3 build that rejects
 * the OpenAI `tools` parameter: ask for a single fenced JSON block instead,
 * mirroring apps/server/src/voice/llm.ts's shape once parsed. */
function withJsonToolInstruction(messages: ChatMessage[]): ChatMessage[] {
  const toolsList = TOOL_DEFINITIONS.map(
    (t) => `- ${t.function.name}: ${t.function.description}`,
  ).join('\n');
  // Found live while diagnosing slice 5 (docs/evidence/
  // browser-tutor-slice5-2026-09-05.log): Qwen3-1.7B (the in-browser model —
  // the server's much larger Qwen3.6-35B does not need this fallback path
  // at all) reliably NARRATES an action ("La palabra es... y la guardo")
  // without ever emitting the fenced block, i.e. it says it will call the
  // tool but doesn't. A worked example for the exact tool this session
  // exercises most (saving a word) plus an explicit "do not just describe
  // it in prose" line measurably changes that — a weak model imitates a
  // concrete shown shape far more reliably than a prose description of one.
  const instruction =
    'This model build does not support native tool calling. When the learner ' +
    'asks you to do one of the actions below, you must actually emit the fenced ' +
    'block below — do not just describe the action in your reply text (for ' +
    'example, do not say "I will save it" without the block). You may still ' +
    'write normal reply text before or after the block.\n' +
    'Format:\n```tool\n{"name": "<tool name>", "arguments": {...}}\n```\n' +
    'Example — the learner says "guarda la palabra cigarra" and the current ' +
    'passage has a token with id "t42" and text "cigarra":\n' +
    '```tool\n{"name": "save_vocabulary", "arguments": {"tokenId": "t42", "word": "cigarra"}}\n```\n' +
    `At most one such block per reply. Available tools:\n${toolsList}`;
  if (messages[0]?.role !== 'system') return messages;
  return [
    { ...messages[0], content: `${messages[0].content}\n\n${instruction}` },
    ...messages.slice(1),
  ];
}

function parseJsonToolBlock(text: string): { call: EngineToolCall; strippedText: string } | null {
  const match = TOOL_BLOCK_RE.exec(text);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]!.trim()) as { name?: string; arguments?: unknown };
    if (typeof parsed.name !== 'string') return null;
    return {
      call: { id: 'call_0', name: parsed.name, arguments: JSON.stringify(parsed.arguments ?? {}) },
      strippedText: (text.slice(0, match.index) + text.slice(match.index + match[0].length)).trim(),
    };
  } catch {
    return null;
  }
}

/** Adapts a loaded `@mlc-ai/web-llm` engine to the transport-agnostic
 * `LlmEngine` interface `TutorTurnRunner` drives. Tries native OpenAI-shaped
 * `tools` first; if the loaded build rejects that request shape, falls back
 * to the JSON-block protocol above for the rest of the session. */
class WebLlmEngine implements LlmEngine {
  private supportsTools = true;

  constructor(private readonly engine: MLCEngine) {}

  async chat(
    messages: ChatMessage[],
    handlers: EngineChatHandlers,
    signal: AbortSignal,
  ): Promise<{ text: string; toolCalls: EngineToolCall[] }> {
    const request = {
      messages: toWebLlmMessages(messages),
      stream: true,
      temperature: 0.4,
      max_tokens: 400,
      // Qwen3 is a reasoning model: left to its default, it prepends a full
      // <think>...</think> block of internal reasoning before the actual
      // reply. The server's llm.ts disables this on llama-server via
      // `chat_template_kwargs.enable_thinking: false`; WebLLM's equivalent
      // is this `extra_body` field (confirmed present for this exact model
      // family in @mlc-ai/web-llm's own type declarations). Without it, the
      // reasoning text streams straight through as tutor captions — caught
      // live in this lane's own e2e run before this fix landed.
      extra_body: { enable_thinking: false },
      ...(this.supportsTools ? { tools: TOOL_DEFINITIONS } : {}),
    };

    let stream: AsyncIterable<{
      choices: Array<{
        delta?: {
          content?: string | null;
          tool_calls?: Array<{
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    }>;
    try {
      stream = (await this.engine.chat.completions.create(request as never)) as never;
    } catch (err) {
      if (this.supportsTools) {
        post({
          t: 'metric',
          name: 'llm_tools_unsupported',
          ms: 0,
          detail: err instanceof Error ? err.message : String(err),
        });
        this.supportsTools = false;
        return this.chat(withJsonToolInstruction(messages), handlers, signal);
      }
      throw err;
    }

    const toolCallsByIndex = new Map<number, { id: string; name: string; arguments: string }>();
    let text = '';

    const onAbort = () => {
      void this.engine.interruptGenerate();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      for await (const chunk of stream) {
        if (signal.aborted) break;
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (typeof delta.content === 'string' && delta.content.length > 0) {
          text += delta.content;
          await handlers.onTextDelta?.(delta.content);
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const existing = toolCallsByIndex.get(tc.index) ?? { id: '', name: '', arguments: '' };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
            toolCallsByIndex.set(tc.index, existing);
          }
        }
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
    }

    let toolCalls: EngineToolCall[] = [...toolCallsByIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, tc]) => ({
        id: tc.id || `call_${index}`,
        name: tc.name,
        arguments: tc.arguments,
      }));

    if (!this.supportsTools) {
      const parsed = parseJsonToolBlock(text);
      if (parsed) {
        toolCalls = [parsed.call];
        text = parsed.strippedText;
      }
    }

    return { text, toolCalls };
  }
}

let mlcEngine: MLCEngine | null = null;
let llmEngine: WebLlmEngine | null = null;
/**
 * Root cause of "turn 1 sometimes produces no visible reply"
 * (docs/evidence/browser-tutor-slice2-3-2026-09-05.log,
 * browser-tutor-slice4-2026-09-05.log, and confirmed live while diagnosing
 * slice 5, docs/evidence/browser-tutor-slice5-2026-09-05.log): `session` is
 * assigned synchronously at the top of the `init` handler, before `loadStt`/
 * `loadLlm` are awaited, so audio capture and VAD start immediately — a
 * learner who speaks quickly enough can have STT finish (sttPipeline ready)
 * while `loadLlm()` is still in flight. `runTutorTurn` used to see
 * `llmEngine === null` at that instant and silently drop the turn
 * (`setState('listening'); return;`) — no caption, no error, no retry, and
 * the session then never re-tries because that's a legitimate degrade path
 * for "the LLM failed to load at all". This promise lets `runTutorTurn`
 * distinguish "still loading, wait for it" from "genuinely unavailable".
 */
let llmLoadPromise: Promise<void> | null = null;

/** `llmId` comes from the init/download payload, not from the catalog: it
 * is whichever tier the learner chose (models.ts `TUTOR_TIERS`), and only
 * the main thread can read that preference. */
async function loadLlm(llmId: string): Promise<void> {
  if (mlcEngine) return;
  const started = Date.now();
  mlcEngine = await CreateMLCEngine(llmId, {
    initProgressCallback: (report) => {
      post({
        t: 'progress',
        progress: {
          modelId: llmId,
          fraction: Math.max(0, Math.min(1, report.progress)),
          loadedBytes: 0,
          totalBytes: null,
          phase: report.progress >= 1 ? 'done' : 'downloading',
        },
      });
    },
  });
  llmEngine = new WebLlmEngine(mlcEngine);
  post({ t: 'metric', name: 'llm_load_ms', ms: Date.now() - started });
}

// ---- TTS (slice 3) ----
//
// HONEST LABEL (planning/BROWSER-TUTOR.md, Slice 3 checklist #1-2): the
// documented workaround — phonemize fr/es with the `phonemizer` package's
// eSpeak-NG build, then `generate_from_ids` — was tried and DISPROVEN, not
// merely unattempted. `phonemizer` 1.2.1's bundled eSpeak-NG wasm exposes
// only English identifiers (`list_voices()` and `phonemize(text, lang)`
// both hard-reject "fr-fr"/"es"/every non-English code with "Invalid
// language identifier"), independent of the voice passed to Kokoro itself.
// That was confirmed twice (fr-FR and es) via a standalone Node script
// before this file was touched — see the Lane B report for the exact
// errors. So: TTS here covers English books only. fr/es/other tutor turns
// still get captions (and tool calls) with no audio; the panel and prompt
// docs say so explicitly rather than silently going quiet.
let kokoro: KokoroTTS | null = null;

async function loadTts(): Promise<void> {
  if (kokoro) return;
  const started = Date.now();
  const attempts: Array<'webgpu' | 'wasm'> =
    typeof navigator !== 'undefined' && 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm'];
  let lastError: unknown = null;
  for (const device of attempts) {
    try {
      kokoro = await KokoroTTS.from_pretrained(TTS_MODEL.id, {
        dtype: 'q8',
        device,
        progress_callback: progressReporter(TTS_MODEL.id) as never,
      });
      post({ t: 'metric', name: 'tts_load_ms', ms: Date.now() - started, detail: device });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('tts load failed');
}

function floatToPcm16(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// ---- Session state ----

interface SessionState {
  payload: WorkerInitPayload;
  vad: EnergyVad;
  buffer: SpeechBuffer;
  muted: boolean;
  turnMode: 'auto' | 'push';
  pace: 'slow' | 'normal';
  turnRunner: TutorTurnRunner;
  currentAbort: AbortController | null;
  currentUtteranceId: string | null;
  currentUtteranceChunks: ArrayBuffer[];
  lastUtterance: { id: string; chunks: ArrayBuffer[] } | null;
  pendingToolResults: Map<
    string,
    { resolve: (r: ToolCallResult) => void; timer: ReturnType<typeof setTimeout> }
  >;
  /**
   * The in-flight (or just-settled) `s.turnRunner.run()` call, if any. A
   * barge-in (`interruptSession`, called on speech_start) only flips the
   * abort signal — it does not wait for the interrupted call to actually
   * unwind inside WebLLM. Found live (docs/evidence/
   * browser-tutor-slice5-2026-09-05.log): starting a SECOND
   * `engine.chat.completions.create()` on the same shared MLCEngine before
   * the first one had finished reacting to its abort hung indefinitely (no
   * error, no further worker output — the session sat in `thinking` until
   * the 90s idle timeout), presumably a lock WebLLM holds per in-flight
   * generation that a merely-signalled-but-not-yet-unwound call hasn't
   * released yet. `runTutorTurn` awaits this before issuing a new call so
   * the two never race the engine.
   */
  currentTurnPromise: Promise<void> | null;
}

let session: SessionState | null = null;

/** One tracker per worker (one worker per session) — see stt-fallback.ts
 * for the regression this defends against. */
const sttFallback = new SttFallbackTracker();

const TOOL_RESULT_TIMEOUT_MS = 30_000;
const MAX_TOOL_ITERATIONS = 4;
const MAX_HISTORY_MESSAGES = 24;

function setState(state: VoiceState): void {
  post({ t: 'state', state });
}

function pcm16ToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i]! / 32768;
  return out;
}

function requestTool(
  s: SessionState,
  callId: string,
  name: string,
  args: unknown,
): Promise<ToolCallResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      s.pendingToolResults.delete(callId);
      resolve({ ok: false, error: 'timeout' });
    }, TOOL_RESULT_TIMEOUT_MS);
    s.pendingToolResults.set(callId, { resolve, timer });
    post({ t: 'tool_call', callId, name: name as never, args });
  });
}

/** One sentence, ready for TTS — mirrors `session.ts`'s `flushSentence`:
 * speak it (English only — see the honest label above `loadTts`), then post
 * the interim (non-final) tutor caption. */
async function speakSentence(
  s: SessionState,
  sentence: string,
  abort: AbortController,
): Promise<void> {
  if (abort.signal.aborted) return;
  const base = iso639(s.payload.learner.learningLocale);

  // Only enter `speaking` / open an utterance when audio is actually about
  // to play. For every other locale this turn stays caption-only — no
  // audio_start/audio_end pair is ever sent, so the provider never fakes a
  // "spoke but produced nothing" utterance (the honest label above
  // `loadTts` explains why).
  if (base === 'en') {
    setState('speaking');
    if (!s.currentUtteranceId) {
      s.currentUtteranceId = randomId();
      s.currentUtteranceChunks = [];
      post({ t: 'audio_start', utteranceId: s.currentUtteranceId });
    }
    const utteranceId = s.currentUtteranceId;
    try {
      if (!kokoro) await loadTts();
      const speed = s.pace === 'slow' ? 0.85 : 1.0;
      const audio = await kokoro!.generate(sentence, { voice: 'af_heart', speed });
      if (abort.signal.aborted || s.currentUtteranceId !== utteranceId) return;
      const pcm16 = floatToPcm16(audio.audio);
      const buf = pcm16.buffer.slice(
        pcm16.byteOffset,
        pcm16.byteOffset + pcm16.byteLength,
      ) as ArrayBuffer;
      s.currentUtteranceChunks.push(buf);
      post({ t: 'audio', utteranceId, pcm: buf, sampleRate: TUTOR_SAMPLE_RATE }, [buf]);
    } catch (err) {
      post({
        t: 'metric',
        name: 'tts_failed',
        ms: 0,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!abort.signal.aborted) {
    post({ t: 'caption', speaker: 'tutor', text: sentence, final: false });
  }
}

function makeTurnRunner(s: SessionState): TutorTurnRunner {
  return new TutorTurnRunner({
    engine: llmEngine!,
    maxHistory: MAX_HISTORY_MESSAGES,
    maxToolIterations: MAX_TOOL_ITERATIONS,
    buildSystemInstruction: () =>
      buildSystemInstruction({
        mode: s.payload.mode,
        // `level` is a free string on the wire (WorkerInitPayload) but a
        // BookLevel enum in the prompt builder's types; the value always
        // originates from `SessionOptions.learner.level` (a real BookLevel)
        // on the main thread, so this is a safe widen-then-narrow.
        learner: s.payload.learner as never,
        bookTitle: s.payload.bookTitle,
        passage: s.payload.passage as TutorPassageContext,
        savedWords: s.payload.savedWords,
      }),
    requestTool: (callId, name, args) => requestTool(s, callId, name, args),
    onState: setState,
    onReading: (tokenIds) => post({ t: 'reading', tokenIds }),
    onPace: (pace) => {
      s.pace = pace;
    },
    // `currentAbort` is always set by `runTutorTurn` before `turnRunner.run()`
    // is invoked, so it is non-null for the whole lifetime of a turn.
    onSentence: (sentence) => speakSentence(s, sentence, s.currentAbort!),
    onTutorCaption: (text, final) => post({ t: 'caption', speaker: 'tutor', text, final }),
  });
}

async function runTutorTurn(learnerText: string): Promise<void> {
  if (!session) return;
  const s = session;
  // See the comment on SessionState.currentTurnPromise: a barge-in only
  // flips the abort flag, it doesn't wait for WebLLM to actually unwind the
  // interrupted call. Waiting here (briefly — the aborted call settles fast
  // once its stream loop next checks the signal) keeps this turn's own
  // engine.chat() call from racing that cleanup.
  if (s.currentTurnPromise) await s.currentTurnPromise.catch(() => undefined);
  if (session !== s) return; // session was torn down/replaced while we waited
  const runPromise = runTutorTurnBody(s, learnerText);
  s.currentTurnPromise = runPromise;
  try {
    await runPromise;
  } finally {
    if (s.currentTurnPromise === runPromise) s.currentTurnPromise = null;
  }
}

async function runTutorTurnBody(s: SessionState, learnerText: string): Promise<void> {
  if (!llmEngine && llmLoadPromise) {
    // The race documented on `llmLoadPromise`'s declaration: STT finished
    // (this function was reached at all) but the LLM is still loading.
    // Wait for it rather than silently dropping the turn — bounded so a
    // genuinely stuck load still degrades to caption-only instead of
    // hanging the session forever.
    post({ t: 'metric', name: 'llm_wait_for_load', ms: 0, detail: learnerText.slice(0, 40) });
    await Promise.race([
      llmLoadPromise,
      new Promise((resolve) => setTimeout(resolve, 15_000)),
    ]).catch(() => undefined);
  }
  if (!llmEngine) {
    // Still not loaded after waiting (failed, or a download-only session):
    // acknowledge the turn as a caption-only round trip rather than
    // hanging silently.
    setState('listening');
    return;
  }
  const abort = new AbortController();
  s.currentAbort = abort;
  s.currentUtteranceId = null;
  s.currentUtteranceChunks = [];
  try {
    await s.turnRunner.run(learnerText, abort.signal);
  } catch (err) {
    if (!abort.signal.aborted) {
      post({
        t: 'error',
        code: 'llm_pipeline_failed',
        message: err instanceof Error ? err.message : String(err),
        recoverable: true,
      });
      setState('listening');
    }
  }
  if (s.currentUtteranceId && !abort.signal.aborted) {
    post({ t: 'audio_end', utteranceId: s.currentUtteranceId });
    s.lastUtterance = { id: s.currentUtteranceId, chunks: s.currentUtteranceChunks };
  }
  s.currentUtteranceId = null;
  if (s.currentAbort === abort) s.currentAbort = null;
}

async function transcribeSegment(segment: Int16Array): Promise<void> {
  if (!session || !sttPipeline) return;
  setState('thinking');
  const started = Date.now();
  try {
    const audio = pcm16ToFloat32(segment);
    const result = (await sttPipeline(audio, {
      // No `language`: forcing it to the learning locale made Whisper
      // decode whatever it heard into that locale instead of transcribing
      // it (BUGS-TUTOR-RUN5.md #1 — English speech during a Spanish book
      // came back as a Spanish paraphrase). Leaving it unset auto-detects.
      task: 'transcribe',
      // Bounds the "de de de de..." decoder-collapse failure mode
      // (docs/evidence/browser-tutor-stt-regression-2026-09-05.log): with no
      // generation kwargs at all, whisper-base on WebGPU here was observed
      // to fall into a token-repetition loop and run to whatever
      // max_new_tokens its (unpinned, `main`-branch) generation_config.json
      // happens to default to — which is also why the failure was ~20x
      // slower, not just wrong: it decoded far more tokens than a real
      // short answer ever needs, not "the same work done slowly". Both
      // knobs make that failure short and cheap instead of silently
      // expensive: no_repeat_ngram_size stops the loop from re-forming,
      // and max_new_tokens caps worst-case latency regardless.
      no_repeat_ngram_size: 3,
      max_new_tokens: 128,
    } as never)) as { text?: string } | Array<{ text?: string }>;
    const text = (Array.isArray(result) ? (result[0]?.text ?? '') : (result.text ?? '')).trim();
    const elapsedMs = Date.now() - started;
    const deviceAtAttempt = sttDevice ?? 'webgpu';

    post({
      t: 'metric',
      name: 'stt_ms',
      ms: elapsedMs,
      detail: `${sttDevice ?? '?'} ${(segment.length / WORKER_SAMPLE_RATE).toFixed(1)}s`,
    });

    // Safety net for the WebGPU STT/LLM-contention regression (see
    // stt-fallback.ts): a slow or degenerate WebGPU result switches this
    // session to wasm for every subsequent utterance.
    const tripped = sttFallback.shouldFallback(deviceAtAttempt, { ms: elapsedMs, text });
    if (tripped) {
      post({
        t: 'metric',
        name: 'stt_fallback_wasm',
        ms: elapsedMs,
        detail: text.slice(0, 60),
      });
      sttPipeline = null;
      sttDevice = null;
      try {
        await loadStt(session.payload.stt, 'wasm');
      } catch (err) {
        post({
          t: 'metric',
          name: 'stt_fallback_reload_failed',
          ms: 0,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      const note = sttFallback.consumeNote();
      if (note) post({ t: 'caption', speaker: 'tutor', text: note, final: true });
    }

    // A fallback-triggering degenerate transcript is discarded rather than
    // sent to the LLM as if it were a real question — the learner just
    // needs to repeat themselves, now on the more reliable device.
    if (!text || (tripped && isDegenerateTranscript(text))) {
      setState('listening');
      return;
    }
    post({ t: 'caption', speaker: 'learner', text, final: true });
    await runTutorTurn(text);
  } catch (err) {
    post({
      t: 'error',
      code: 'stt_failed',
      message: err instanceof Error ? err.message : String(err),
      recoverable: true,
    });
    setState('listening');
  }
}

function handleFrame(pcm: ArrayBuffer): void {
  if (!session || session.muted) return;
  const frame = new Int16Array(pcm);

  if (session.turnMode === 'push') {
    session.buffer.push(frame);
    return;
  }

  for (const ev of session.vad.process(frame)) {
    if (ev.type === 'speech_start') {
      // Mirrors the server's onSpeechStart() calling bargeIn() (session.ts):
      // new speech interrupts whatever turn is in flight rather than racing
      // it. Missing here until slice 5 (docs/evidence/
      // browser-tutor-slice5-2026-09-05.log) — while the VAD itself was
      // barely firing at all (a separate bug, fixed in vad.ts), the gap was
      // invisible; once VAD correctly re-fires on every loop iteration, a
      // second speech segment arriving mid-turn triggered a SECOND
      // concurrent runTutorTurn() on the same WebLLM engine while the first
      // was still streaming, truncating it mid-reply. A no-op when nothing
      // is in flight.
      interruptSession(session);
      session.buffer.start();
    } else if (ev.type === 'speech_end') {
      const segment = session.buffer.end();
      if (segment) void transcribeSegment(segment);
    }
  }
  session.buffer.push(frame);
}

/** Cancels any in-flight LLM/TTS work for the current turn — mirrors the
 * server's `bargeIn()`. No-op when nothing is in flight. */
function interruptSession(s: SessionState): void {
  const hadAbort = !!s.currentAbort;
  s.currentAbort?.abort();
  s.currentAbort = null;

  if (s.currentUtteranceId) {
    s.lastUtterance = { id: s.currentUtteranceId, chunks: s.currentUtteranceChunks };
    post({ t: 'audio_end', utteranceId: s.currentUtteranceId, cancelled: true });
    s.currentUtteranceId = null;
    s.currentUtteranceChunks = [];
  }
  if (hadAbort) setState('listening');
}

function replayLast(s: SessionState): void {
  if (!s.lastUtterance) return;
  const { id, chunks } = s.lastUtterance;
  post({ t: 'audio_start', utteranceId: id });
  for (const chunk of chunks) {
    // Copy: the original ArrayBuffer may already have been transferred once.
    const copy = chunk.slice(0) as ArrayBuffer;
    post({ t: 'audio', utteranceId: id, pcm: copy, sampleRate: TUTOR_SAMPLE_RATE }, [copy]);
  }
  post({ t: 'audio_end', utteranceId: id });
}

// ---- Message loop ----

ctx.onmessage = (ev: MessageEvent<MainToWorker>) => {
  const msg = ev.data;
  void (async () => {
    switch (msg.t) {
      case 'download':
        try {
          await loadStt(msg.payload.stt, msg.payload.debug?.forceSttDevice);
          await loadLlm(msg.payload.llm.id);
          await loadTts();
          post({ t: 'ready', stages: { stt: true, llm: true, tts: true } });
        } catch (err) {
          post({
            t: 'error',
            code: 'model_download_failed',
            message: err instanceof Error ? err.message : String(err),
            recoverable: false,
          });
        }
        break;

      case 'init': {
        const s: SessionState = {
          payload: msg.payload,
          vad: new EnergyVad(),
          buffer: new SpeechBuffer(WORKER_SAMPLE_RATE),
          muted: false,
          turnMode: 'auto',
          pace: 'normal',
          turnRunner: null as unknown as TutorTurnRunner, // set below, needs `s` for the closure
          currentAbort: null,
          currentUtteranceId: null,
          currentUtteranceChunks: [],
          lastUtterance: null,
          pendingToolResults: new Map(),
          currentTurnPromise: null,
        };
        session = s;
        try {
          // Started before STT is awaited (rather than after, as this used
          // to do) so the two loads run concurrently — this used to await
          // loadStt() first and only then start loadLlm(), which needlessly
          // widened the race described on `llmLoadPromise`'s declaration:
          // every extra millisecond STT finishes before LLM starts loading
          // is a millisecond a fast learner's first utterance can slip
          // through with the LLM still not even started.
          if (msg.payload.debug?.skipLlm) {
            // Diagnostic-only: isolate STT timing from LLM/WebGPU
            // contention (docs/evidence/browser-tutor-stt-regression-
            // 2026-09-05.log, experiment (a)). Never set by a real session.
            post({ t: 'metric', name: 'llm_load_skipped', ms: 0, detail: 'debug.skipLlm' });
            llmLoadPromise = null;
          } else {
            llmLoadPromise = loadLlm(msg.payload.llm.id).catch((err) => {
              // LLM failing to load is not fatal to the session: STT still
              // works, and runTutorTurn() degrades to caption-only when
              // `llmEngine` is still null once this promise has settled.
              post({
                t: 'metric',
                name: 'llm_load_failed',
                ms: 0,
                detail: err instanceof Error ? err.message : String(err),
              });
            });
          }
          await loadStt(msg.payload.stt, msg.payload.debug?.forceSttDevice);
          if (llmLoadPromise) await llmLoadPromise;
          s.turnRunner = makeTurnRunner(s);
          post({ t: 'ready', stages: { stt: true, llm: !!llmEngine, tts: false } });
          setState('listening');
        } catch (err) {
          post({
            t: 'error',
            code: 'model_load_failed',
            message: err instanceof Error ? err.message : String(err),
            recoverable: false,
          });
        }
        break;
      }

      case 'audio':
        handleFrame(msg.pcm);
        break;

      case 'mute':
        if (session) {
          session.muted = msg.muted;
          if (msg.muted) {
            session.buffer.clear();
            session.vad.reset();
            setState('muted');
          } else {
            setState('listening');
          }
        }
        break;

      case 'ptt':
        if (session) {
          session.turnMode = 'push';
          if (msg.active) {
            session.buffer.clear();
            session.buffer.start();
          } else {
            const segment = session.buffer.end();
            if (segment) void transcribeSegment(segment);
          }
        }
        break;

      case 'mode':
        if (session) session.payload.mode = msg.mode;
        break;

      case 'passage':
        if (session) session.payload.passage = msg.passage;
        break;

      case 'interrupt':
        if (session) interruptSession(session);
        break;

      case 'replay':
        if (session) replayLast(session);
        break;

      case 'text':
        post({ t: 'caption', speaker: 'learner', text: msg.text, final: true });
        await runTutorTurn(msg.text);
        break;

      case 'tool_result': {
        const pending = session?.pendingToolResults.get(msg.callId);
        if (pending) {
          clearTimeout(pending.timer);
          session!.pendingToolResults.delete(msg.callId);
          pending.resolve({ ok: msg.ok, result: msg.result, error: msg.error });
        }
        break;
      }

      case 'end':
        if (session) interruptSession(session);
        session = null;
        setState('ended');
        break;

      case 'sample':
        // English only — see the HONEST LABEL above loadTts. Callers
        // (sample.ts) are expected to check the locale and the model cache
        // themselves and fall back to a recorded audio slice otherwise;
        // this still guards the worker side so a stray call for an
        // unsupported locale fails cleanly instead of mis-synthesizing.
        if (iso639(msg.locale) !== 'en') {
          post({
            t: 'error',
            code: 'sample_locale_unsupported',
            message: `no synthesized voice for locale "${msg.locale}"`,
            recoverable: true,
          });
          break;
        }
        try {
          if (!kokoro) await loadTts();
          const audio = await kokoro!.generate(msg.text, { voice: 'af_heart', speed: 1.0 });
          const buf = audio.audio.buffer.slice(
            audio.audio.byteOffset,
            audio.audio.byteOffset + audio.audio.byteLength,
          ) as ArrayBuffer;
          post({ t: 'sample_result', pcm: buf, sampleRate: TUTOR_SAMPLE_RATE }, [buf]);
        } catch (err) {
          post({
            t: 'error',
            code: 'sample_failed',
            message: err instanceof Error ? err.message : String(err),
            recoverable: true,
          });
        }
        break;
    }
  })();
};
