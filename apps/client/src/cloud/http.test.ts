import { describe, expect, it, vi } from 'vitest';
import { HttpCloudAdapter } from './http';
import { CloudError } from './types';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpCloudAdapter', () => {
  it('me() returns null on 401 (signed out), not a rejection', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, { error: 'unauthenticated', message: 'Sign in first.' }),
    );
    const cloud = new HttpCloudAdapter('https://cloud.sotto.dev', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(cloud.me()).resolves.toBeNull();
  });

  it('me() returns the user+entitlement on 200', async () => {
    const me = { user: { id: 'u1', email: 'a@b.com' }, entitlement: { plan: 'free' } };
    const fetchMock = vi.fn(async () => jsonResponse(200, me));
    const cloud = new HttpCloudAdapter('https://cloud.sotto.dev', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(cloud.me()).resolves.toEqual(me);
  });

  it('voiceSession() throws a CloudError with the server code on 402', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(402, { error: 'cap_exhausted', message: "You've used all your minutes." }),
    );
    const cloud = new HttpCloudAdapter('https://cloud.sotto.dev', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      cloud.voiceSession({
        bookId: 'b',
        chapterId: 'c',
        mode: 'discuss',
        learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
        passage: { chapterTitle: '', sentences: [], positionTokenId: '' },
        savedWords: [],
      }),
    ).rejects.toMatchObject({
      code: 'cap_exhausted',
      message: "You've used all your minutes.",
      status: 402,
    });
  });

  it('every non-2xx response rejects with CloudError, not a generic Error', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, { error: 'server_error' }));
    const cloud = new HttpCloudAdapter('https://cloud.sotto.dev', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(cloud.plans()).rejects.toBeInstanceOf(CloudError);
  });

  it('204 responses (e.g. sign-out) resolve without a body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const cloud = new HttpCloudAdapter('https://cloud.sotto.dev', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(cloud.signOut()).resolves.toBeUndefined();
  });

  it('sends credentials: include on every request (web cookie auth)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { plans: [], billing: 'stub' }));
    const cloud = new HttpCloudAdapter('https://cloud.sotto.dev', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await cloud.plans();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe('include');
  });

  it('does not call the default fetch unbound (regression: "Illegal invocation")', async () => {
    // A real browser's `fetch` is a method that requires `this` to be the
    // Window (or another Fetch-spec global) it was retrieved from — Chrome
    // throws "TypeError: Illegal invocation" if it's called with any other
    // receiver. `HttpCloudAdapter` used to do `this.fetchImpl = opts.fetch
    // ?? fetch` and then call it as `this.fetchImpl(...)`, which is exactly
    // that failure mode. Simulate it with a fetch that only works when
    // called with `this === globalThis`, and construct the adapter with NO
    // injected `fetch` (the real production path) so it falls back to
    // whatever this getter/binding does.
    const realFetch = globalThis.fetch;
    const strictFetch = function (this: unknown, ..._args: unknown[]) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve(jsonResponse(200, { plans: [], billing: 'stub' }));
    };
    (globalThis as { fetch: unknown }).fetch = strictFetch;
    try {
      const cloud = new HttpCloudAdapter('https://cloud.sotto.dev');
      await expect(cloud.plans()).resolves.toEqual({ plans: [], billing: 'stub' });
    } finally {
      (globalThis as { fetch: unknown }).fetch = realFetch;
    }
  });
});

/**
 * Run 7 lane C. Two additions to the contract the account screen leans on:
 * the sign-in link remembers where the learner was, and the screen asks the
 * server which providers exist rather than drawing a button and hoping.
 */
describe('HttpCloudAdapter — sign-in surface', () => {
  it('sends returnTo with the magic-link request when there is one', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {}));
    const cloud = new HttpCloudAdapter('https://cloud.sotto.dev', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await cloud.requestMagicLink('reader@example.com', 'web', '/onboarding');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cloud.sotto.dev/auth/magic-link');
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'reader@example.com',
      kind: 'web',
      returnTo: '/onboarding',
    });
  });

  it('omits returnTo entirely rather than sending an empty one', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {}));
    const cloud = new HttpCloudAdapter('https://cloud.sotto.dev', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await cloud.requestMagicLink('reader@example.com', 'web');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'reader@example.com',
      kind: 'web',
    });
  });

  it('reads the advertised sign-in methods from /auth/config', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { magicLink: true, apple: false, google: false }),
    );
    const cloud = new HttpCloudAdapter('https://cloud.sotto.dev', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(cloud.authConfig()).resolves.toEqual({
      magicLink: true,
      apple: false,
      google: false,
    });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain('/auth/config');
  });

  /**
   * An older deployment has no /auth/config. Falling back to "magic link
   * only" keeps the screen usable and, crucially, still hides the providers
   * — an unknown answer must never become a button.
   */
  it('falls back to magic-link-only when the server does not answer', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(404, { error: 'not_found' }));
    const cloud = new HttpCloudAdapter('https://cloud.sotto.dev', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(cloud.authConfig()).resolves.toEqual({
      magicLink: true,
      apple: false,
      google: false,
    });
  });
});
