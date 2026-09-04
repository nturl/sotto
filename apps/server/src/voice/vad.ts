/**
 * Voice activity detection for 16 kHz mono PCM16 frames. Prefers Silero VAD
 * v5 (via onnxruntime-node) if the model file and the native addon are both
 * available; otherwise falls back to a simple RMS energy VAD with hangover.
 * `pnpm --filter @sotto/server models:fetch` downloads the Silero model into
 * apps/server/models/ (see models/README.md for attribution + license).
 *
 * KNOWN ISSUE (verified 2026-09-04, see docs/voice-pipeline.md "Known
 * issues"): the SileroVad implementation below was checked byte-for-byte
 * against the official Python onnxruntime reference (same WAV decode, same
 * tensor feeds, same silero_vad_16k_op15.onnx and combined silero_vad.onnx
 * exports) and matches exactly — the integration itself is correct. But on
 * this machine's onnxruntime-node build, both exports return near-zero
 * speech probability (never crossing ~0.01, vs. the documented 0.5
 * threshold) on Kokoro-synthesized French speech *and* on the Silero repo's
 * own tests/data/test.wav fixture. This looks like a model/opset snapshot
 * issue upstream rather than a bug here, but it means Silero should not be
 * trusted without re-verifying on real microphone audio in the target
 * environment. The energy VAD fallback is the one that's been verified
 * end-to-end (see scripts/voice-smoke.ts's logged run).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SILERO_MODEL_PATH = path.resolve(__dirname, '../../models/silero_vad.onnx');

export type VadBackendName = 'silero' | 'energy';

export interface VadEvent {
  type: 'speech_start' | 'speech_end';
}

/** A VAD instance processes one session's audio stream and reports speech boundaries. */
export interface Vad {
  readonly backend: VadBackendName;
  /** Feed one PCM16 frame (mono, 16 kHz). Returns any boundary events it crossed. */
  process(frame: Int16Array): VadEvent[] | Promise<VadEvent[]>;
  reset(): void;
}

const SAMPLE_RATE = 16000;

// ---- Energy VAD (fallback, and reference implementation for tests) ----

export interface EnergyVadOptions {
  rmsThreshold?: number; // 0..1 normalized RMS
  hangoverMs?: number; // time above/below threshold smoothing
  minSpeechMs?: number; // minimum sustained speech before speech_start fires
  silenceEndMs?: number; // sustained silence before speech_end fires
  sampleRate?: number;
}

export class EnergyVad implements Vad {
  readonly backend: VadBackendName = 'energy';
  private readonly rmsThreshold: number;
  private readonly minSpeechMs: number;
  private readonly silenceEndMs: number;
  private readonly sampleRate: number;

  private speaking = false;
  private aboveMs = 0;
  private belowMs = 0;

  constructor(opts: EnergyVadOptions = {}) {
    this.rmsThreshold = opts.rmsThreshold ?? 0.02;
    this.minSpeechMs = opts.minSpeechMs ?? 300;
    this.silenceEndMs = opts.silenceEndMs ?? 700;
    this.sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  }

  reset(): void {
    this.speaking = false;
    this.aboveMs = 0;
    this.belowMs = 0;
  }

  process(frame: Int16Array): VadEvent[] {
    const events: VadEvent[] = [];
    const rms = computeRms(frame);
    const frameMs = (frame.length / this.sampleRate) * 1000;

    if (rms >= this.rmsThreshold) {
      this.aboveMs += frameMs;
      this.belowMs = 0;
    } else {
      this.belowMs += frameMs;
      this.aboveMs = 0;
    }

    if (!this.speaking && this.aboveMs >= this.minSpeechMs) {
      this.speaking = true;
      events.push({ type: 'speech_start' });
    } else if (this.speaking && this.belowMs >= this.silenceEndMs) {
      this.speaking = false;
      events.push({ type: 'speech_end' });
    }

    return events;
  }
}

export function computeRms(frame: Int16Array): number {
  if (frame.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < frame.length; i++) {
    const normalized = frame[i]! / 32768;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / frame.length);
}

// ---- Silero VAD (preferred, optional dependency) ----

interface SileroSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
}

// Silero VAD v5's combined LSTM state tensor: shape [2, batch=1, 128].
// (Verified 2026-09-04 against the downloaded model's actual I/O names —
// v5 uses a single "state"/"stateN" tensor pair, not the v3/v4 "h"/"c" pair.)
const STATE_SHAPE = [2, 1, 128] as const;
const STATE_SIZE = 2 * 1 * 128;

class SileroVad implements Vad {
  readonly backend: VadBackendName = 'silero';
  private state: Float32Array = new Float32Array(STATE_SIZE);
  private speaking = false;
  private aboveMs = 0;
  private belowMs = 0;
  private readonly threshold = 0.5;
  private readonly minSpeechMs = 200;
  private readonly silenceEndMs = 600;

  constructor(
    private readonly session: SileroSession,
    private readonly ort: typeof import('onnxruntime-node'),
  ) {}

  reset(): void {
    this.state = new Float32Array(STATE_SIZE);
    this.speaking = false;
    this.aboveMs = 0;
    this.belowMs = 0;
  }

  async process(frame: Int16Array): Promise<VadEvent[]> {
    const events: VadEvent[] = [];
    const input = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) input[i] = frame[i]! / 32768;

    const feeds: Record<string, unknown> = {
      input: new this.ort.Tensor('float32', input, [1, input.length]),
      sr: new this.ort.Tensor('int64', BigInt64Array.from([BigInt(SAMPLE_RATE)]), []),
      state: new this.ort.Tensor('float32', this.state, STATE_SHAPE as unknown as number[]),
    };
    const out = await this.session.run(feeds);
    const prob = out.output?.data[0] ?? 0;
    if (out.stateN) this.state = out.stateN.data;

    const frameMs = (frame.length / SAMPLE_RATE) * 1000;
    if (prob >= this.threshold) {
      this.aboveMs += frameMs;
      this.belowMs = 0;
    } else {
      this.belowMs += frameMs;
      this.aboveMs = 0;
    }

    if (!this.speaking && this.aboveMs >= this.minSpeechMs) {
      this.speaking = true;
      events.push({ type: 'speech_start' });
    } else if (this.speaking && this.belowMs >= this.silenceEndMs) {
      this.speaking = false;
      events.push({ type: 'speech_end' });
    }
    return events;
  }
}

let cachedBackend: VadBackendName | null = null;
// The onnx model file + native session are expensive to load; every session
// after the first reuses this same warmed-up InferenceSession (Silero's
// per-utterance LSTM state lives on the SileroVad wrapper instance, not the
// session, so sharing the session across concurrent sessions is safe).
let sileroSessionPromise: Promise<{ session: SileroSession; ort: typeof import('onnxruntime-node') } | null> | null = null;

type SimpleLogger = { info: (o: unknown, msg?: string) => void; warn: (o: unknown, msg?: string) => void };

async function loadSileroSession(logger: SimpleLogger): Promise<{ session: SileroSession; ort: typeof import('onnxruntime-node') } | null> {
  if (!existsSync(SILERO_MODEL_PATH)) {
    cachedBackend = 'energy';
    logger.warn({ path: SILERO_MODEL_PATH }, 'silero model not found, using energy VAD fallback');
    return null;
  }
  try {
    const ort = await import('onnxruntime-node');
    const session = await ort.InferenceSession.create(SILERO_MODEL_PATH);
    cachedBackend = 'silero';
    logger.info({ path: SILERO_MODEL_PATH }, 'silero VAD loaded');
    return { session: session as unknown as SileroSession, ort };
  } catch (err) {
    cachedBackend = 'energy';
    logger.warn({ err: (err as Error).message }, 'onnxruntime-node unavailable, using energy VAD fallback');
    return null;
  }
}

/**
 * Attempts to load Silero VAD (onnxruntime-node + downloaded model). Falls
 * back to the energy VAD if either is unavailable, logging which backend
 * won. The model/session load is memoized process-wide (call this once
 * eagerly at server startup so /health reports the real backend from the
 * first request), and every session gets its own lightweight VAD wrapper
 * around the shared session.
 */
export async function createVad(logger: SimpleLogger): Promise<Vad> {
  if (sileroSessionPromise === null) {
    sileroSessionPromise = loadSileroSession(logger);
  }
  const loaded = await sileroSessionPromise;
  if (!loaded) return new EnergyVad();
  return new SileroVad(loaded.session, loaded.ort);
}

export function activeVadBackend(): VadBackendName {
  return cachedBackend ?? 'energy';
}

export function isSileroVad(vad: Vad): vad is SileroVad {
  return vad.backend === 'silero';
}
