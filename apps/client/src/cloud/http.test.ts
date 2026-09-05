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
});
