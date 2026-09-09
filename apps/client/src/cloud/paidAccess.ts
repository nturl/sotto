import { useEffect, useState } from 'react';
import { PAID_ORIGIN } from './paidOrigin';

export type PaidAccess = 'checking' | 'subscribed' | 'available' | 'signed-out' | 'unreachable';

/** The free reader and paid app are separate origins. Ask the paid service
 * with its existing cookie before offering a trial; never cache account data
 * or treat a failed check as evidence that this reader needs to buy again. */
export async function requestPaidAccess(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<Exclude<PaidAccess, 'checking'>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetchImpl(`${PAID_ORIGIN}/me`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    // An installed iPhone app may not share Safari's session. A missing
    // cookie is a sign-in step, never evidence that another trial is needed.
    if (response.status === 401) return 'signed-out';
    if (!response.ok) return 'unreachable';
    const body = (await response.json()) as { entitlement?: { plan?: unknown } } | null;
    const plan = body?.entitlement?.plan;
    if (plan === 'standard' || plan === 'plus') return 'subscribed';
    return plan === 'free' ? 'available' : 'unreachable';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

export function usePaidAccess(enabled: boolean): { status: PaidAccess; refresh: () => void } {
  const [status, setStatus] = useState<PaidAccess>(enabled ? 'checking' : 'available');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus('checking');
    void requestPaidAccess().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const refresh = () => {
      setStatus('checking');
      setNonce((n) => n + 1);
    };
    const visible = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled]);

  return { status: enabled ? status : 'available', refresh: () => setNonce((n) => n + 1) };
}
