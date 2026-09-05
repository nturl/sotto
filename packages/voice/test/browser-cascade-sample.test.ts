/**
 * synthesizeSample — the one-shot pronunciation-sample path used by
 * onboarding's "listen to a sample" row (planning/BROWSER-TUTOR.md, Slice 3
 * checklist #6). No real worker, no real models: a fake `caches` stands in
 * for the model-cache check, and a fake `WorkerLike` stands in for the
 * spawned worker.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { synthesizeSample } from '../src/browser-cascade/sample.ts';
import { TTS_MODEL } from '../src/browser-cascade/models.ts';
import type { MainToWorker, WorkerToMain } from '../src/browser-cascade/protocol.ts';
import type { WorkerLike } from '../src/browser-cascade/provider.ts';

function stubCaches(cachedIds: string[]): void {
  const keys = cachedIds.map((id) => ({
    url: `https://sotto.local/tutor-model/${encodeURIComponent(id)}`,
  }));
  vi.stubGlobal('caches', {
    has: async (name: string) => name === 'sotto-tutor-models' && cachedIds.length > 0,
    open: async () => ({ keys: async () => keys, put: async () => undefined }),
    delete: async () => true,
  });
}

class FakeWorker implements WorkerLike {
  sent: MainToWorker[] = [];
  terminated = 0;
  onmessage: ((ev: { data: WorkerToMain }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  postMessage(message: MainToWorker): void {
    this.sent.push(message);
  }
  terminate(): void {
    this.terminated += 1;
  }
  emit(msg: WorkerToMain): void {
    this.onmessage?.({ data: msg });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('synthesizeSample', () => {
  it('resolves null for a non-English locale without ever spawning a worker', async () => {
    stubCaches([TTS_MODEL.id]);
    let spawned = false;
    const result = await synthesizeSample('Hola', 'es-419', {
      workerFactory: () => {
        spawned = true;
        return new FakeWorker();
      },
    });
    expect(result).toBeNull();
    expect(spawned).toBe(false);
  });

  it('resolves null when the TTS model is not cached, without spawning a worker', async () => {
    stubCaches([]);
    let spawned = false;
    const result = await synthesizeSample('Hello', 'en-US', {
      workerFactory: () => {
        spawned = true;
        return new FakeWorker();
      },
    });
    expect(result).toBeNull();
    expect(spawned).toBe(false);
  });

  it('spawns a worker, posts a sample request, and resolves with the PCM on sample_result', async () => {
    stubCaches([TTS_MODEL.id]);
    let worker: FakeWorker | null = null;
    const promise = synthesizeSample('Hello there', 'en-US', {
      workerFactory: () => {
        worker = new FakeWorker();
        return worker;
      },
    });

    // Let synthesizeSample's cache check resolve and the worker spawn.
    await new Promise((r) => setTimeout(r, 0));
    expect(worker).not.toBeNull();
    expect(worker!.sent).toEqual([{ t: 'sample', text: 'Hello there', locale: 'en-US' }]);

    const pcm = new Float32Array([0.1, -0.2, 0.3]).buffer;
    worker!.emit({ t: 'sample_result', pcm, sampleRate: 24000 });

    const result = await promise;
    expect(result).not.toBeNull();
    expect(Array.from(result!.pcm)).toEqual([
      Math.fround(0.1),
      Math.fround(-0.2),
      Math.fround(0.3),
    ]);
    expect(result!.sampleRate).toBe(24000);
    expect(worker!.terminated).toBe(1);
  });

  it('resolves null on a worker error', async () => {
    stubCaches([TTS_MODEL.id]);
    let worker: FakeWorker | null = null;
    const promise = synthesizeSample('Hello', 'en-US', {
      workerFactory: () => {
        worker = new FakeWorker();
        return worker;
      },
    });
    await new Promise((r) => setTimeout(r, 0));
    worker!.emit({ t: 'error', code: 'sample_failed', message: 'boom', recoverable: true });

    expect(await promise).toBeNull();
    expect(worker!.terminated).toBe(1);
  });
});
