import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * sw.js is a bare service-worker script (no imports/exports — registered
 * as-is from app/_layout.tsx, TASK R6-C2 commit 3's own doc comment at the
 * top of the file), so it can't be `import`ed like a module. This loads
 * its source into a `vm` context with fake `self`/`caches`/`fetch` and
 * pulls `rangeFromCache` off the context as a global — the same function
 * the real fetch handler calls, unmodified.
 */

type FakeResponse = {
  status: number;
  statusText?: string;
  headers: Map<string, string>;
  body: ArrayBuffer;
  ok: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
};

function fakeResponse(status: number, body: string, headers: Record<string, string> = {}): FakeResponse {
  const buf = new TextEncoder().encode(body).buffer;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Map(Object.entries(headers)),
    body: buf,
    arrayBuffer: () => Promise.resolve(buf),
  };
}

function createSandbox() {
  const store = new Map<string, FakeResponse>();
  const fetchCalls: Array<{ url: string; range: string | null }> = [];

  const cache = {
    match: async (url: string) => store.get(url),
    put: async (url: string, response: FakeResponse) => {
      store.set(url, response);
    },
  };

  const caches = {
    open: async () => cache,
  };

  // The real network: the full file is 26 bytes ("abcdefghijklmnopqrstuvwxyz"),
  // and it answers a Range request with a fresh 200 (as a real origin server
  // would for a plain `fetch(url)` with no Range header) so the "fill" fetch
  // and the original Range fetch are distinguishable by whether `range` was
  // set on the request passed to `fetch`.
  const FULL_BODY = 'abcdefghijklmnopqrstuvwxyz';
  // `fillCacheFromNetwork` calls `fetch(url)` with a bare string (Fetch's
  // own `new Request(url)` behaviour omits any Range header), while the
  // original pass-through calls `fetch(request)` with the Range-bearing
  // Request-like object — real fetch() accepts both forms.
  const fakeFetch = async (input: string | { url: string; headers: { get: (k: string) => string | null } }) => {
    const url = typeof input === 'string' ? input : input.url;
    const range = typeof input === 'string' ? null : input.headers.get('range');
    fetchCalls.push({ url, range });
    return fakeResponse(200, FULL_BODY, { 'content-type': 'audio/mpeg' });
  };

  class FakeHeaders {
    private map = new Map<string, string>();
    constructor(init?: Map<string, string> | Record<string, string>) {
      if (init instanceof Map) {
        for (const [k, v] of init) this.map.set(k, v);
      } else if (init) {
        for (const [k, v] of Object.entries(init)) this.map.set(k, v);
      }
    }
    get(key: string) {
      return this.map.get(key) ?? null;
    }
    set(key: string, value: string) {
      this.map.set(key, value);
    }
  }

  class FakeResponseCtor {
    status: number;
    statusText?: string;
    headers: FakeHeaders;
    ok: boolean;
    private body: ArrayBuffer | null;
    constructor(body: ArrayBuffer | null, init: { status: number; statusText?: string; headers?: FakeHeaders }) {
      this.body = body;
      this.status = init.status;
      this.statusText = init.statusText;
      this.headers = init.headers ?? new FakeHeaders();
      this.ok = init.status >= 200 && init.status < 300;
    }
    arrayBuffer() {
      return Promise.resolve(this.body ?? new ArrayBuffer(0));
    }
  }

  const sandbox: Record<string, unknown> = {
    self: {
      addEventListener: () => {},
      location: { origin: 'https://sotto.test' },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
    caches,
    fetch: fakeFetch,
    URL,
    Response: FakeResponseCtor,
    Headers: FakeHeaders,
    console,
  };
  vm.createContext(sandbox);
  const source = readFileSync(join(__dirname, 'sw.js'), 'utf8');
  vm.runInContext(source, sandbox, { filename: 'sw.js' });
  return { sandbox, store, fetchCalls, FULL_BODY, FakeHeaders };
}

describe('rangeFromCache pass-through fill (R6-C2 commit 3)', () => {
  let ctx: ReturnType<typeof createSandbox>;

  beforeEach(() => {
    ctx = createSandbox();
  });

  it('serves the pass-through fetch immediately and background-fills the cache', async () => {
    const { sandbox, store, fetchCalls, FakeHeaders } = ctx;
    const rangeFromCache = sandbox.rangeFromCache as (
      request: unknown,
      cacheName: string,
      event: { waitUntil: (p: Promise<unknown>) => void },
    ) => Promise<{ status: number }>;

    const url = 'https://sotto.test/content/packs/fr/book/audio/words.mp3';
    const request = { url, headers: new FakeHeaders({ range: 'bytes=0-4' }) };
    const waited: Promise<unknown>[] = [];
    const event = { waitUntil: (p: Promise<unknown>) => waited.push(p) };

    const response = await rangeFromCache(request, 'sotto-content-v1', event);

    // Immediate response is the pass-through fetch, not a synthesized 206.
    expect(response.status).toBe(200);
    // A `waitUntil` was scheduled for the background fill — the caller (the
    // real `fetch` event) is what keeps the worker alive until it settles.
    expect(waited.length).toBe(1);

    await Promise.all(waited);

    // Both the original Range fetch and the background fill (SAME url,
    // WITHOUT a Range header) happened, in either order.
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls.every((c) => c.url === url)).toBe(true);
    expect(fetchCalls.some((c) => c.range === 'bytes=0-4')).toBe(true);
    expect(fetchCalls.some((c) => c.range === null)).toBe(true);
    // The fill has landed in the cache for next time / offline.
    expect(store.has(url)).toBe(true);
    expect(store.get(url)?.status).toBe(200);
  });

  it('serves the next Range request as a 206 from the now-filled cache', async () => {
    const { sandbox, fetchCalls, FakeHeaders, FULL_BODY } = ctx;
    const rangeFromCache = sandbox.rangeFromCache as (
      request: unknown,
      cacheName: string,
      event: { waitUntil: (p: Promise<unknown>) => void },
    ) => Promise<{ status: number; headers: { get: (k: string) => string | null } }>;

    const url = 'https://sotto.test/content/packs/fr/book/audio/words.mp3';
    const firstRequest = { url, headers: new FakeHeaders({ range: 'bytes=0-4' }) };
    const waited: Promise<unknown>[] = [];
    await rangeFromCache(firstRequest, 'sotto-content-v1', { waitUntil: (p) => waited.push(p) });
    await Promise.all(waited);

    fetchCalls.length = 0; // reset call log — the second tap must not hit the network at all
    const secondRequest = { url, headers: new FakeHeaders({ range: 'bytes=0-4' }) };
    const response = await rangeFromCache(secondRequest, 'sotto-content-v1', { waitUntil: () => {} });

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe(`bytes 0-4/${FULL_BODY.length}`);
    expect(fetchCalls).toEqual([]); // served entirely from cache — this is the offline case too
  });
});
