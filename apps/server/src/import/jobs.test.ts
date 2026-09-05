import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Control importBook's timing/resolution from each test without touching
// the real pipeline (mirrors routes.test.ts's mock of the same module).
let resolveImport: ((result: unknown) => void) | undefined;
let lastSignal: AbortSignal | undefined;

vi.mock('@sotto/content/import', async () => {
  const actual =
    await vi.importActual<typeof import('@sotto/content/import')>('@sotto/content/import');
  return {
    ...actual,
    importBook: vi.fn((_source: unknown, opts: { signal?: AbortSignal }) => {
      lastSignal = opts.signal;
      return new Promise((resolve, reject) => {
        resolveImport = resolve;
        opts.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    }),
  };
});

const { ImportJobRegistry, AUDIO_RETENTION_MS } = await import('./jobs.ts');

function fakeResult(): { book: unknown; chapters: unknown[]; audio: Map<string, Uint8Array> } {
  return {
    book: { bookId: 'private-test' },
    chapters: [],
    audio: new Map([['01.mp3', new Uint8Array([1, 2, 3])]]),
  };
}

describe('ImportJobRegistry (finding 9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resolveImport = undefined;
    lastSignal = undefined;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('fails a running job that outlives its wall-clock ceiling and clears runningJobId', async () => {
    const registry = new ImportJobRegistry({ jobMaxMs: 1000, autoSweep: false });
    const job = registry.start(
      { bytes: new Uint8Array(), filename: 'book.txt' },
      { contentLocale: 'fr-FR', llm: { baseUrl: 'http://x', model: 'm' }, narrate: 'none' },
    );

    expect(registry.isBusy()).toBe(true);
    expect(lastSignal?.aborted).toBe(false);

    vi.advanceTimersByTime(1001);
    // sweep() is called synchronously inside isBusy()/get() — no timers
    // to flush for the sweep itself, just for the ceiling to have passed.
    expect(registry.isBusy()).toBe(false);

    const swept = registry.get(job.id);
    expect(swept?.status).toBe('error');
    expect(swept?.error).toBe('import timed out');
    expect(lastSignal?.aborted).toBe(true);
  });

  it('does not fail a job that finishes before its ceiling', async () => {
    const registry = new ImportJobRegistry({ jobMaxMs: 10_000, autoSweep: false });
    const job = registry.start(
      { bytes: new Uint8Array(), filename: 'book.txt' },
      { contentLocale: 'fr-FR', llm: { baseUrl: 'http://x', model: 'm' }, narrate: 'none' },
    );

    resolveImport?.(fakeResult());
    await vi.advanceTimersByTimeAsync(0);

    const done = registry.get(job.id);
    expect(done?.status).toBe('done');
    expect(registry.isBusy()).toBe(false);
  });

  it("frees a finished job's audio buffers after AUDIO_RETENTION_MS, keeping the job record", async () => {
    const registry = new ImportJobRegistry({ autoSweep: false });
    const job = registry.start(
      { bytes: new Uint8Array(), filename: 'book.txt' },
      { contentLocale: 'fr-FR', llm: { baseUrl: 'http://x', model: 'm' }, narrate: 'none' },
    );

    resolveImport?.(fakeResult());
    await vi.advanceTimersByTimeAsync(0);
    expect(registry.get(job.id)?.result?.audio.size).toBe(1);

    vi.advanceTimersByTime(AUDIO_RETENTION_MS + 1);
    const swept = registry.get(job.id);
    expect(swept?.status).toBe('done');
    expect(swept?.result?.audio.size).toBe(0);
  });
});
