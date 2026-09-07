/**
 * Typed message protocol between `BrowserCascadeProvider` (main thread) and
 * the tutor worker (`worker.ts`, bundled by esbuild into
 * apps/client/public/tutor/tutor-worker.js).
 *
 * Design note (planning/BROWSER-TUTOR.md §Protocol): the worker mirrors the
 * SERVER's wire protocol (CONTRACTS §5b) rather than inventing a new
 * vocabulary, so `BrowserCascadeProvider` and `LocalCascadeProvider` are the
 * same translation layer over two transports — a WebSocket in one case, a
 * `postMessage` port in the other. Where the shapes differ it is only
 * because a Worker can transfer an ArrayBuffer directly instead of
 * interleaving binary frames with JSON.
 *
 * Metro-safe: types and a couple of constants only, no ML imports.
 */
import type { ToolName, TutorMode } from '@sotto/core';
import type { VoiceState } from '../events.ts';
import type { TutorPassageContext } from '@sotto/core';

/** PCM the provider captures and the worker's VAD/STT consume (CONTRACTS §5b). */
export const WORKER_SAMPLE_RATE = 16000;
/** Kokoro's native output rate, for the tutor audio the worker returns. */
export const TUTOR_SAMPLE_RATE = 24000;

/** Which stages the worker has actually loaded. */
export interface StageReadiness {
  stt: boolean;
  llm: boolean;
  tts: boolean;
}

export interface WorkerInitPayload {
  /** Model ids/dtypes chosen by the main thread (models.ts catalog). Both
   * stages are named here rather than read from the catalog inside the
   * worker, because which ones they are depends on the learner's "Tutor
   * size" tier — a main-thread preference the worker has no access to. */
  stt: { id: string; dtype: Record<string, string> };
  llm: { id: string };
  learner: { level: string; learningLocale: string; explanationLocale: string };
  mode: TutorMode;
  bookTitle: string;
  passage: TutorPassageContext;
  savedWords: string[];
  /** When false the worker must not touch the network: it only reports
   * `ready` if every model is already in the browser cache. */
  allowDownload: boolean;
  /** Diagnostic-only overrides for the STT/LLM-contention experiments in
   * docs/evidence/browser-tutor-stt-regression-2026-09-05.log. Never set by
   * the app's normal session flow — only by the e2e harness, via
   * `window.__SOTTO_TUTOR_DEBUG__` (see sessionManager.ts). */
  debug?: {
    /** Skip loading the LLM entirely, to isolate STT-alone timing. */
    skipLlm?: boolean;
    /** Force whisper onto a specific device instead of the normal
     * webgpu-then-wasm probe order. */
    forceSttDevice?: 'webgpu' | 'wasm';
  };
}

// ---- main -> worker ----

export type MainToWorker =
  | { t: 'init'; payload: WorkerInitPayload }
  /** Pre-fetch weights without starting a session (the download panel). */
  | { t: 'download'; payload: WorkerInitPayload }
  | { t: 'audio'; pcm: ArrayBuffer }
  | { t: 'mode'; mode: TutorMode }
  | { t: 'mute'; muted: boolean }
  | { t: 'ptt'; active: boolean }
  | { t: 'interrupt' }
  | { t: 'replay' }
  | { t: 'text'; text: string }
  | { t: 'tool_result'; callId: string; ok: boolean; result?: unknown; error?: string }
  | { t: 'passage'; passage: TutorPassageContext }
  | { t: 'end' }
  /** One-shot pronunciation sample (onboarding's "listen to a sample" row,
   * the reader's word/translation-panel speaker button): synthesize `text`
   * and reply with `sample_result` or `error`. No session, no VAD, no LLM —
   * a short-lived worker started just for this, same shape as `download`. */
  | { t: 'sample'; text: string; locale: string };

// ---- worker -> main ----

/** Mirrors transformers.js / WebLLM progress callbacks, normalized. */
export interface ModelProgress {
  modelId: string;
  /** 0..1, or null while the total size is still unknown. */
  fraction: number | null;
  loadedBytes: number;
  totalBytes: number | null;
  /** 'downloading' | 'loading' (compiling/initializing) | 'done'. */
  phase: 'downloading' | 'loading' | 'done';
}

export type WorkerToMain =
  | { t: 'progress'; progress: ModelProgress }
  /** Every requested stage is loaded; the session may start. */
  | { t: 'ready'; stages: StageReadiness }
  | { t: 'state'; state: VoiceState }
  | { t: 'caption'; speaker: 'learner' | 'tutor'; text: string; final: boolean }
  | { t: 'tool_call'; callId: string; name: ToolName; args: unknown }
  | { t: 'reading'; tokenIds: string[] }
  | { t: 'audio_start'; utteranceId: string }
  | { t: 'audio'; utteranceId: string; pcm: ArrayBuffer; sampleRate: number }
  | { t: 'audio_end'; utteranceId: string; cancelled?: boolean }
  | { t: 'error'; code: string; message: string; recoverable: boolean }
  /** Timing instrumentation the e2e log prints; never shown in the UI. */
  | { t: 'metric'; name: string; ms: number; detail?: string }
  /** Reply to `sample`: raw Float32 PCM (not Int16 — there is no session
   * audio pipeline to match here, so the extra round-trip conversion buys
   * nothing) at Kokoro's native rate. */
  | { t: 'sample_result'; pcm: ArrayBuffer; sampleRate: number };

/** Where build-tutor-worker.mjs writes the bundle, and what the provider spawns. */
export const DEFAULT_WORKER_URL = '/tutor/tutor-worker.js';
