/**
 * BrowserCascadeProvider — the same four-mode tutor as
 * `LocalCascadeProvider`, with no server: mic -> energy VAD -> whisper ->
 * (slice 2) Qwen3 via WebLLM -> (slice 3) Kokoro, all inside a Web Worker.
 *
 * It implements `VoiceProvider` (CONTRACTS §5a) and emits exactly the same
 * `VoiceEvent` vocabulary, so the voice screen, SessionBar, captions and the
 * seven client-side tools work unchanged. The only structural difference
 * from the local provider is the transport: a `postMessage` port to
 * `/tutor/tutor-worker.js` instead of a WebSocket to apps/server.
 *
 * Metro-safe: no ML library is imported here. See planning/BROWSER-TUTOR.md.
 */
import type { ToolResult, TutorMode } from '@sotto/core';
import type { VoiceEvent, VoiceState } from '../events.ts';
import type { SessionOptions, VoiceProvider } from '../provider.ts';
import type { AudioAdapter } from '../transports/audio-adapter.ts';
import {
  DEFAULT_WORKER_URL,
  type MainToWorker,
  type ModelProgress,
  type StageReadiness,
  type WorkerInitPayload,
  type WorkerToMain,
} from './protocol.ts';
import {
  DEFAULT_TIER,
  markModelCached,
  modelsForTier,
  TUTOR_TIERS,
  type TutorTier,
} from './models.ts';

/** The slice of the DOM `Worker` surface this provider uses — so unit tests
 * can hand in a shim without a real worker or real models. */
export interface WorkerLike {
  postMessage(message: MainToWorker, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((ev: { data: WorkerToMain }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type WorkerFactory = () => WorkerLike;

export interface BrowserCascadeOptions {
  audio: AudioAdapter;
  /** Defaults to spawning `/tutor/tutor-worker.js` as a module worker. */
  workerFactory?: WorkerFactory;
  workerUrl?: string;
  /** Session limits, mirroring the server's (CONTRACTS §5b). */
  limits?: { maxMs: number; idleMs: number };
  /** Emitted for the download panel while weights are fetched. */
  onProgress?: (p: ModelProgress) => void;
  /** Diagnostic-only overrides forwarded verbatim into `WorkerInitPayload.debug`
   * — see protocol.ts. Only the e2e harness sets this (sessionManager.ts). */
  debug?: WorkerInitPayload['debug'];
  /** Which "Tutor size" the learner picked (models.ts `TUTOR_TIERS`).
   * Defaults to `standard`, which is also what a learner who has never
   * touched the setting gets. */
  tier?: TutorTier;
}

const DEFAULT_LIMITS = { maxMs: 1_200_000, idleMs: 90_000 };

function defaultWorkerFactory(url: string): WorkerFactory {
  return () => new Worker(url, { type: 'module' }) as unknown as WorkerLike;
}

/** Turns SessionOptions into the worker's init payload. */
function initPayload(
  opts: SessionOptions,
  allowDownload: boolean,
  tier: TutorTier,
  debug?: WorkerInitPayload['debug'],
): WorkerInitPayload {
  const models = TUTOR_TIERS[tier];
  return {
    stt: { id: models.stt.id, dtype: models.stt.dtype ?? {} },
    llm: { id: models.llm.id },
    learner: {
      level: opts.learner.level,
      learningLocale: opts.learner.learningLocale,
      explanationLocale: opts.learner.explanationLocale,
    },
    mode: opts.mode,
    // run7/G directive 1(d): the real title, falling back to the id for
    // older SessionOptions/fixtures that don't set it.
    bookTitle: opts.bookTitle ?? opts.bookId,
    passage: opts.passage,
    savedWords: opts.savedWords,
    allowDownload,
    ...(debug ? { debug } : {}),
  };
}

export class BrowserCascadeProvider implements VoiceProvider {
  private readonly audio: AudioAdapter;
  private readonly makeWorker: WorkerFactory;
  private readonly limits: { maxMs: number; idleMs: number };
  private readonly onProgress?: (p: ModelProgress) => void;
  private readonly debug?: WorkerInitPayload['debug'];
  private readonly tier: TutorTier;

  private worker: WorkerLike | null = null;
  private listeners = new Set<(e: VoiceEvent) => void>();
  private state: VoiceState = 'idle';
  private stages: StageReadiness = { stt: false, llm: false, tts: false };
  private capturing = false;
  private ended = false;

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: BrowserCascadeOptions) {
    this.audio = opts.audio;
    this.makeWorker =
      opts.workerFactory ?? defaultWorkerFactory(opts.workerUrl ?? DEFAULT_WORKER_URL);
    this.limits = opts.limits ?? DEFAULT_LIMITS;
    this.onProgress = opts.onProgress;
    this.debug = opts.debug;
    this.tier = opts.tier ?? DEFAULT_TIER;
  }

  // ---- VoiceProvider ----

  on(listener: (e: VoiceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: VoiceEvent): void {
    if (e.type === 'state') this.state = e.state;
    for (const l of this.listeners) l(e);
  }

  /** Loaded stages, for the screen's diagnostics and the e2e log. */
  get readiness(): StageReadiness {
    return { ...this.stages };
  }

  async connect(opts: SessionOptions): Promise<void> {
    this.ended = false;
    this.emit({ type: 'state', state: 'connecting' });

    let worker: WorkerLike;
    try {
      worker = this.makeWorker();
    } catch (err) {
      this.fail('worker_spawn_failed', err);
      return;
    }
    this.worker = worker;
    worker.onmessage = (ev) => this.handleWorkerMessage(ev.data);
    worker.onerror = (ev) => {
      const message =
        ev && typeof ev === 'object' && 'message' in ev ? String((ev as Error).message) : 'unknown';
      this.fail('worker_error', new Error(message));
    };

    // `allowDownload: false` — a session never pulls weights on its own. The
    // download panel does that explicitly, on a tap, with sizes shown.
    worker.postMessage({ t: 'init', payload: initPayload(opts, false, this.tier, this.debug) });

    this.armLimits();

    try {
      await this.audio.startCapture((buf) => {
        if (!this.worker || this.ended) return;
        this.worker.postMessage({ t: 'audio', pcm: buf }, [buf]);
      });
      this.capturing = true;
    } catch (err) {
      this.emit({
        type: 'error',
        code: 'mic_unavailable',
        message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        recoverable: false,
      });
      this.emit({ type: 'state', state: 'error' });
    }
  }

  async disconnect(): Promise<void> {
    // Order matters: `post` is a no-op once `ended` is set (that guard stops
    // late audio frames racing a teardown), so say goodbye first.
    this.post({ t: 'end' });
    this.ended = true;
    this.stopEverything();
    this.emit({ type: 'state', state: 'ended' });
  }

  setMode(mode: TutorMode): void {
    this.post({ t: 'mode', mode });
  }

  setMuted(muted: boolean): void {
    this.post({ t: 'mute', muted });
  }

  pushToTalk(active: boolean): void {
    this.post({ t: 'ptt', active });
  }

  interrupt(): void {
    this.audio.stopPlayback();
    this.post({ t: 'interrupt' });
  }

  replayLast(): void {
    this.post({ t: 'replay' });
  }

  /** run7/G directive 1(a): the speaker/output toggle — the worker still
   * hands PCM to this main-thread `AudioAdapter` (see `msg.t === 'audio'`
   * below), so muting is the same gain-node toggle every other cascade
   * uses. */
  setOutputMuted(muted: boolean): void {
    this.audio.setOutputMuted?.(muted);
  }

  sendText(text: string): void {
    this.post({ t: 'text', text });
  }

  respondTool(callId: string, result: ToolResult): void {
    // Same flattening as LocalCascadeProvider: @sotto/core's ToolResult is a
    // union of success shapes plus ToolFailure, and only an explicit
    // `ok: false` is a failure.
    if ('ok' in result && result.ok === false) {
      this.post({ t: 'tool_result', callId, ok: false, error: result.error });
    } else {
      this.post({ t: 'tool_result', callId, ok: true, result });
    }
  }

  // ---- internals ----

  private post(msg: MainToWorker): void {
    if (!this.worker || this.ended) return;
    this.worker.postMessage(msg);
  }

  private fail(code: string, err: unknown): void {
    this.emit({
      type: 'error',
      code,
      message: err instanceof Error ? err.message : String(err),
      recoverable: false,
    });
    this.emit({ type: 'state', state: 'error' });
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
    if (this.capturing) {
      this.audio.stopCapture();
      this.capturing = false;
    }
    this.audio.stopPlayback();
    this.worker?.terminate();
    this.worker = null;
  }

  private handleWorkerMessage(msg: WorkerToMain): void {
    switch (msg.t) {
      case 'progress':
        this.onProgress?.(msg.progress);
        break;
      case 'ready':
        this.stages = msg.stages;
        break;
      case 'state':
        this.emit({ type: 'state', state: msg.state });
        break;
      case 'caption':
        // Any learner speech resets the idle clock, exactly as the server's
        // VAD-driven resetIdleTimer does.
        if (msg.speaker === 'learner') this.resetIdleTimer();
        this.emit({ type: 'caption', speaker: msg.speaker, text: msg.text, final: msg.final });
        break;
      case 'tool_call':
        this.emit({ type: 'tool_call', callId: msg.callId, name: msg.name, args: msg.args });
        break;
      case 'reading':
        this.emit({ type: 'reading', tokenIds: msg.tokenIds });
        break;
      case 'audio':
        this.audio.playPcm(msg.pcm, msg.sampleRate);
        break;
      case 'audio_end':
        if (msg.cancelled) this.audio.stopPlayback();
        break;
      case 'audio_start':
        break;
      case 'metric':
        // Diagnostics only, and local only: the worker has no way to report
        // where it ran or how long a turn took, and the e2e log needs both.
        // Never leaves the browser (product rule: no telemetry).
        console.info(`[sotto-tutor] ${msg.name}=${msg.ms}ms${msg.detail ? ` ${msg.detail}` : ''}`);
        break;
      case 'error':
        this.emit({
          type: 'error',
          code: msg.code,
          message: msg.message,
          recoverable: msg.recoverable,
        });
        if (!msg.recoverable) this.emit({ type: 'state', state: 'error' });
        break;
    }
  }
}

// ---- Download (the opt-in panel's action) ----

export interface DownloadHandle {
  /** Resolves when every requested model is loaded, rejects on failure. */
  done: Promise<void>;
  cancel(): void;
}

/**
 * Fetches the tutor weights on an explicit user action, reporting progress.
 * Runs in its own short-lived worker so a download can be started from the
 * Settings screen with no session anywhere near it. On success the models
 * are marked in the `sotto-tutor-models` cache (models.ts) so the capability
 * gate can answer "already downloaded?" without touching the network.
 */
export function downloadTutorModels(opts: {
  onProgress?: (p: ModelProgress) => void;
  workerFactory?: WorkerFactory;
  workerUrl?: string;
  /** Which "Tutor size" to fetch; defaults to `standard`. Downloading one
   * tier never removes the other's cached weights — the libraries keep
   * both, and only `removeModels()` clears them. */
  tier?: TutorTier;
}): DownloadHandle {
  const tier = opts.tier ?? DEFAULT_TIER;
  const models = TUTOR_TIERS[tier];
  const makeWorker =
    opts.workerFactory ?? defaultWorkerFactory(opts.workerUrl ?? DEFAULT_WORKER_URL);
  const worker = makeWorker();

  let settle: { resolve: () => void; reject: (e: Error) => void };
  const done = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });

  worker.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.t === 'progress') opts.onProgress?.(msg.progress);
    else if (msg.t === 'ready') {
      void Promise.all(modelsForTier(tier).map((m) => markModelCached(m.id))).then(() => {
        worker.terminate();
        settle.resolve();
      });
    } else if (msg.t === 'error') {
      worker.terminate();
      settle.reject(new Error(`${msg.code}: ${msg.message}`));
    }
  };
  worker.onerror = (ev) => {
    worker.terminate();
    const message =
      ev && typeof ev === 'object' && 'message' in ev ? String((ev as Error).message) : 'unknown';
    settle.reject(new Error(`worker_error: ${message}`));
  };

  worker.postMessage({
    t: 'download',
    payload: {
      stt: { id: models.stt.id, dtype: models.stt.dtype ?? {} },
      llm: { id: models.llm.id },
      learner: { level: 'A1', learningLocale: 'en-US', explanationLocale: 'en' },
      mode: 'discuss',
      bookTitle: '',
      passage: { chapterTitle: '', sentences: [] },
      savedWords: [],
      allowDownload: true,
    },
  });

  return {
    done,
    cancel: () => {
      worker.terminate();
      settle.reject(new Error('cancelled'));
    },
  };
}
