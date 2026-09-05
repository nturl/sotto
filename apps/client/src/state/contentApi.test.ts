/**
 * Covers fetchHealth's contract (used by the voice screen's availability
 * gate, apps/client/src/voice/availability.ts): it must never throw, and
 * must resolve to null on any failure — network error, non-2xx, or timeout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHealth } from './contentApi';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
});

describe('fetchHealth', () => {
  it('returns the parsed body on a 200 response', async () => {
    const body = { ok: true, stt: true, llm: true, tts: false, vad: 'silero' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    }) as unknown as typeof fetch;

    await expect(fetchHealth()).resolves.toEqual(body);
  });

  it('returns null on a non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(fetchHealth()).resolves.toBeNull();
  });

  it('returns null when fetch rejects (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(fetchHealth()).resolves.toBeNull();
  });

  it('returns null on timeout', async () => {
    global.fetch = vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;

    const promise = fetchHealth(5);
    await vi.advanceTimersByTimeAsync(10);

    await expect(promise).resolves.toBeNull();
  });
});
