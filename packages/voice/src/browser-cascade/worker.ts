/**
 * Tutor worker — the ONLY module in this repo that imports an ML library.
 *
 * It is deliberately NOT reachable from the Expo/Metro module graph: nothing
 * imports it, `packages/voice/src/index.ts` does not export it, and
 * `apps/client/scripts/build-tutor-worker.mjs` bundles it with esbuild into
 * `apps/client/public/tutor/tutor-worker.js`, which the provider spawns by
 * URL. That is what keeps @huggingface/transformers (and later WebLLM and
 * kokoro-js) out of the app bundle — see planning/BROWSER-TUTOR.md
 * §"Keeping ML out of Metro".
 *
 * Slice 1 implements the STT stage end to end: PCM16 frames in -> energy VAD
 * -> whisper -> a final learner `caption` -> state transitions
 * listening/thinking. The LLM and TTS stages are stubbed behind the same
 * protocol with TODO markers (slices 2 and 3).
 */
import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from '@huggingface/transformers';
import type { VoiceState } from '../events.ts';
import { EnergyVad, SpeechBuffer } from './vad.ts';
import {
  WORKER_SAMPLE_RATE,
  type MainToWorker,
  type ModelProgress,
  type WorkerInitPayload,
  type WorkerToMain,
} from './protocol.ts';

// Weights come from the Hugging Face hub on opt-in; the onnxruntime wasm
// runtime is served from our own origin (copied into public/tutor/ort by the
// build script) so the app has exactly one third-party host to reach, and
// only while downloading.
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

// ---- Model loading ----

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
 * Loads whisper, preferring WebGPU and falling back to wasm. `dtype` is
 * per sub-model (whisper exports an encoder and a merged decoder, and the
 * two want different precisions — see models.ts for the measurements).
 */
async function loadStt(spec: WorkerInitPayload['stt']): Promise<void> {
  if (sttPipeline) return;
  const dtype = spec.dtype;
  const started = Date.now();

  const attempts: Array<'webgpu' | 'wasm'> =
    typeof navigator !== 'undefined' && 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm'];

  let lastError: unknown = null;
  for (const device of attempts) {
    try {
      sttPipeline = (await pipeline('automatic-speech-recognition', spec.id, {
        device,
        dtype: dtype as never,
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

// ---- Session state ----

interface SessionState {
  payload: WorkerInitPayload;
  vad: EnergyVad;
  buffer: SpeechBuffer;
  muted: boolean;
  turnMode: 'auto' | 'push';
}

let session: SessionState | null = null;

function setState(state: VoiceState): void {
  post({ t: 'state', state });
}

function pcm16ToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i]! / 32768;
  return out;
}

async function transcribeSegment(segment: Int16Array): Promise<void> {
  if (!session || !sttPipeline) return;
  setState('thinking');
  const started = Date.now();
  try {
    const audio = pcm16ToFloat32(segment);
    const result = (await sttPipeline(audio, {
      language: iso639(session.payload.learner.learningLocale),
      task: 'transcribe',
    } as never)) as { text?: string } | Array<{ text?: string }>;
    const text = (Array.isArray(result) ? (result[0]?.text ?? '') : (result.text ?? '')).trim();

    post({
      t: 'metric',
      name: 'stt_ms',
      ms: Date.now() - started,
      detail: `${sttDevice ?? '?'} ${(segment.length / WORKER_SAMPLE_RATE).toFixed(1)}s`,
    });

    if (!text) {
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

/**
 * TODO(slice 2): LLM stage. Load `@mlc-ai/web-llm` with the Qwen3 1.7B
 * q4f16_1 build, feed it `buildSystemInstruction(...)` from @sotto/core plus
 * the running history, stream text deltas through the shared
 * `SentenceChunker`/`stripMarkers` logic (port from apps/server/src/voice),
 * emit `reading` markers and `tool_call` messages, and await
 * `{ t: 'tool_result' }` from the main thread before continuing. WebLLM's
 * OpenAI-shaped `tools` parameter is not supported for every Qwen3 build:
 * if the loaded model rejects it, fall back to prompting for a single JSON
 * block and parsing it, mirroring apps/server/src/voice/llm.ts.
 *
 * TODO(slice 3): TTS stage. kokoro-js 1.2.1's exported VOICES map contains
 * ONLY English voices, and its phonemizer call is hard-coded to en-us/en, so
 * `generate()` throws for fr/es. The workaround (verified by reading
 * dist/kokoro.js) is to phonemize with the `phonemizer` package directly at
 * the right eSpeak language code and call `generate_from_ids` with
 * ff_siwis / ef_dora, whose weight files ARE published. Emit
 * `audio_start` / `audio` (PCM16 @ 24 kHz) / `audio_end`.
 *
 * Until then the worker acknowledges the turn and returns to listening, so
 * the STT round trip is observable on its own without pretending a tutor
 * replied.
 */
async function runTutorTurn(_learnerText: string): Promise<void> {
  await Promise.resolve();
  setState('listening');
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
      session.buffer.start();
    } else if (ev.type === 'speech_end') {
      const segment = session.buffer.end();
      if (segment) void transcribeSegment(segment);
    }
  }
  session.buffer.push(frame);
}

// ---- Message loop ----

ctx.onmessage = (ev: MessageEvent<MainToWorker>) => {
  const msg = ev.data;
  void (async () => {
    switch (msg.t) {
      case 'download':
        try {
          await loadStt(msg.payload.stt);
          post({ t: 'ready', stages: { stt: true, llm: false, tts: false } });
        } catch (err) {
          post({
            t: 'error',
            code: 'model_download_failed',
            message: err instanceof Error ? err.message : String(err),
            recoverable: false,
          });
        }
        break;

      case 'init':
        session = {
          payload: msg.payload,
          vad: new EnergyVad(),
          buffer: new SpeechBuffer(WORKER_SAMPLE_RATE),
          muted: false,
          turnMode: 'auto',
        };
        try {
          await loadStt(msg.payload.stt);
          post({ t: 'ready', stages: { stt: true, llm: false, tts: false } });
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
        // TODO(slice 2): one-shot "acknowledge mode change" turn via
        // buildModeChangeInstruction (@sotto/core) + TTS.
        break;

      case 'passage':
        if (session) session.payload.passage = msg.passage;
        break;

      case 'interrupt':
        // TODO(slice 2/3): abort the in-flight LLM stream and TTS.
        setState('listening');
        break;

      case 'replay':
        // TODO(slice 3): re-emit the last utterance's PCM.
        break;

      case 'text':
        post({ t: 'caption', speaker: 'learner', text: msg.text, final: true });
        await runTutorTurn(msg.text);
        break;

      case 'tool_result':
        // TODO(slice 2): resolve the pending tool promise for msg.callId.
        break;

      case 'end':
        session = null;
        setState('ended');
        break;
    }
  })();
};
