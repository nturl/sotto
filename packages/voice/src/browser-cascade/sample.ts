/**
 * One-shot pronunciation sample via the tutor worker — onboarding's "listen
 * to a sample" row and the reader's translation-panel speaker button
 * (planning/BROWSER-TUTOR.md, Slice 3 checklist #6). Metro-safe: this file
 * only spawns the worker by URL and plays back a Float32Array; it never
 * imports an ML library itself.
 *
 * English only, and silently so: `synthesizeSample` resolves `null` for any
 * locale other than English or when the TTS model isn't cached yet, so
 * every caller's existing recorded-audio fallback keeps working unchanged.
 * See worker.ts's HONEST LABEL above `loadTts` for why English is the only
 * locale Kokoro covers in this build.
 */
import { cachedModelIds } from './models.ts';
import { DEFAULT_WORKER_URL, type MainToWorker, type WorkerToMain } from './protocol.ts';
import type { WorkerFactory, WorkerLike } from './provider.ts';
import { TTS_MODEL } from './models.ts';

const SAMPLE_TIMEOUT_MS = 15_000;

function defaultWorkerFactory(url: string): WorkerFactory {
  return () => new Worker(url, { type: 'module' }) as unknown as WorkerLike;
}

function iso639(locale: string): string {
  return locale.split(/[-_]/)[0]!.toLowerCase();
}

export interface SynthesizedSample {
  pcm: Float32Array;
  sampleRate: number;
}

/**
 * Synthesizes `text` in `locale` if — and only if — the tutor's TTS model is
 * already cached in this browser and `locale` is English. Returns `null`
 * (never throws) whenever that isn't the case, so callers can always fall
 * back to their recorded-audio slice with a single `??`.
 */
export async function synthesizeSample(
  text: string,
  locale: string,
  opts: { workerFactory?: WorkerFactory; workerUrl?: string } = {},
): Promise<SynthesizedSample | null> {
  if (iso639(locale) !== 'en') return null;

  const cached = await cachedModelIds();
  if (!cached.includes(TTS_MODEL.id)) return null;

  const makeWorker =
    opts.workerFactory ?? defaultWorkerFactory(opts.workerUrl ?? DEFAULT_WORKER_URL);

  let worker: WorkerLike;
  try {
    worker = makeWorker();
  } catch {
    return null;
  }

  return new Promise<SynthesizedSample | null>((resolve) => {
    let settled = false;
    const finish = (result: SynthesizedSample | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), SAMPLE_TIMEOUT_MS);

    worker.onmessage = (ev: { data: WorkerToMain }) => {
      const msg = ev.data;
      if (msg.t === 'sample_result') {
        finish({ pcm: new Float32Array(msg.pcm), sampleRate: msg.sampleRate });
      } else if (msg.t === 'error') {
        finish(null);
      }
    };
    worker.onerror = () => finish(null);

    const request: MainToWorker = { t: 'sample', text, locale };
    worker.postMessage(request);
  });
}

/** Plays a synthesized sample through a throwaway AudioContext. No-op in
 * environments without one (SSR, vitest/jsdom). */
export function playSample(sample: SynthesizedSample): void {
  if (typeof AudioContext === 'undefined') return;
  const ctx = new AudioContext();
  const buffer = ctx.createBuffer(1, sample.pcm.length, sample.sampleRate);
  buffer.copyToChannel(sample.pcm as Float32Array<ArrayBuffer>, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    void ctx.close();
  };
  source.start();
}
