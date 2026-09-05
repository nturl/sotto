/**
 * Covers fetchHealth's contract (used by the voice screen's availability
 * gate, apps/client/src/voice/availability.ts): it must never throw, and
 * must resolve to null on any failure — network error, non-2xx, or timeout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHealth, serverUrl } from './contentApi';

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

/**
 * F2.2: resolution order for the content server origin. EXPO_PUBLIC_SERVER_URL
 * wins outright (the local dev/native path); failing that, a static export
 * (build-web.mjs stamps window.__SOTTO_STATIC__) always resolves to its own
 * page origin, even on localhost — the bug docs/verification.md row 34 named
 * (serving dist/ on localhost was mistaken for the Expo dev server); the
 * hostname heuristic is only a fallback for a bundle loaded without that flag.
 */
describe('serverUrl', () => {
  const originalEnv = process.env.EXPO_PUBLIC_SERVER_URL;
  const globalAny = globalThis as { location?: unknown; window?: unknown };
  const originalLocation = globalAny.location;
  const originalWindow = globalAny.window;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.EXPO_PUBLIC_SERVER_URL;
    else process.env.EXPO_PUBLIC_SERVER_URL = originalEnv;
    globalAny.location = originalLocation;
    globalAny.window = originalWindow;
  });

  it('prefers EXPO_PUBLIC_SERVER_URL when set', () => {
    process.env.EXPO_PUBLIC_SERVER_URL = 'http://example.test:1234';
    globalAny.location = { hostname: 'localhost', origin: 'http://localhost:8081' };
    globalAny.window = { __SOTTO_STATIC__: true };

    expect(serverUrl()).toBe('http://example.test:1234');
  });

  it('resolves to the page origin on a static export, even on localhost', () => {
    delete process.env.EXPO_PUBLIC_SERVER_URL;
    globalAny.location = { hostname: 'localhost', origin: 'http://localhost:8094' };
    globalAny.window = { __SOTTO_STATIC__: true };

    expect(serverUrl()).toBe('http://localhost:8094');
  });

  it('resolves to the page origin on a static export served from a real host', () => {
    delete process.env.EXPO_PUBLIC_SERVER_URL;
    globalAny.location = {
      hostname: 'sotto-steel.vercel.app',
      origin: 'https://sotto-steel.vercel.app',
    };
    globalAny.window = { __SOTTO_STATIC__: true };

    expect(serverUrl()).toBe('https://sotto-steel.vercel.app');
  });

  it('falls back to the hostname heuristic when the static flag is absent', () => {
    delete process.env.EXPO_PUBLIC_SERVER_URL;
    globalAny.location = {
      hostname: 'sotto-steel.vercel.app',
      origin: 'https://sotto-steel.vercel.app',
    };
    globalAny.window = {};

    expect(serverUrl()).toBe('https://sotto-steel.vercel.app');
  });

  it('falls back to the loopback dev server on plain localhost with no static flag', () => {
    delete process.env.EXPO_PUBLIC_SERVER_URL;
    globalAny.location = { hostname: 'localhost', origin: 'http://localhost:8081' };
    globalAny.window = {};

    expect(serverUrl()).toBe('http://localhost:8790');
  });
});
