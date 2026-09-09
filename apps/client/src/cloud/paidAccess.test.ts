import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPaidAccess } from './paidAccess';

afterEach(() => vi.useRealTimers());

describe('paid access from the free reader', () => {
  it.each(['standard', 'plus'])(
    'recognises a %s subscriber using the existing paid cookie',
    async (plan) => {
      const fetchMock = vi.fn(async () => Response.json({ entitlement: { plan } }));
      await expect(requestPaidAccess(fetchMock)).resolves.toBe('subscribed');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://app.readsotto.app/me',
        expect.objectContaining({
          credentials: 'include',
          cache: 'no-store',
        }),
      );
    },
  );

  it('offers choices only for a confirmed free account', async () => {
    await expect(
      requestPaidAccess(async () => Response.json({ entitlement: { plan: 'free' } })),
    ).resolves.toBe('available');
  });

  it('asks for sign-in when this browser cannot see the session, without upselling', async () => {
    await expect(requestPaidAccess(async () => new Response(null, { status: 401 }))).resolves.toBe(
      'signed-out',
    );
  });

  it.each([500, 403])('does not interpret HTTP %s as permission to upsell', async (status) => {
    await expect(requestPaidAccess(async () => new Response(null, { status }))).resolves.toBe(
      'unreachable',
    );
  });

  it('does not interpret a malformed response or offline failure as a free account', async () => {
    await expect(requestPaidAccess(async () => Response.json({}))).resolves.toBe('unreachable');
    await expect(
      requestPaidAccess(async () => {
        throw new Error('offline');
      }),
    ).resolves.toBe('unreachable');
  });

  it('times out to a retryable state without showing a trial', async () => {
    vi.useFakeTimers();
    const pending = requestPaidAccess(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await vi.advanceTimersByTimeAsync(4000);
    await expect(pending).resolves.toBe('unreachable');
  });
});
