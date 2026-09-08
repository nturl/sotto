/**
 * useMe — cached `me()` with a manual `refresh()`. Distinguishes three
 * states screens must render differently (ACCOUNT.md / PAYWALL.md §4):
 *  - 'no-cloud': no CloudAdapter configured (NullCloud) — the caller must
 *    not render any account/paywall/usage UI at all.
 *  - 'signed-out': a real adapter, but no session.
 *  - 'signed-in': a real adapter with a live Me (user + entitlement).
 */
import { useEffect, useState } from 'react';
import { CloudError, type Me } from './types';
import { useCloud } from './provider';

export type MeState =
  | { status: 'no-cloud' }
  | { status: 'loading' }
  // `reason: 'unreachable'` — `/me` failed for something other than a 401,
  // so this is a connection problem, not a logout. It still fails the cloud
  // gate (`cloudPathUsable`, availability.ts: an unknown entitlement is not
  // a usable one), but the voice screen reads it to say so instead of
  // offering a paying subscriber "Subscribe" or "Use your own OpenAI key".
  | { status: 'signed-out'; reason?: 'unreachable' }
  | { status: 'signed-in'; me: Me };

export function useMe(): MeState & { refresh: () => void } {
  const cloud = useCloud();
  const [state, setState] = useState<MeState>(
    cloud.enabled ? { status: 'loading' } : { status: 'no-cloud' },
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!cloud.enabled) {
      setState({ status: 'no-cloud' });
      return undefined;
    }
    let cancelled = false;
    setState((prev) => (prev.status === 'signed-in' ? prev : { status: 'loading' }));
    cloud
      .me()
      .then((me) => {
        if (cancelled) return;
        setState(me ? { status: 'signed-in', me } : { status: 'signed-out' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // `HttpCloudAdapter.me()` already answers `null` for a real 401
        // (http.ts), so most of what lands here is a failure to reach the
        // server at all. An adapter that throws its 401 is still a logout,
        // and only that one is.
        const unauthorized = error instanceof CloudError && error.status === 401;
        setState(
          unauthorized ? { status: 'signed-out' } : { status: 'signed-out', reason: 'unreachable' },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [cloud, nonce]);

  useEffect(() => {
    if (!cloud.enabled || typeof window === 'undefined') return;
    const refresh = () => setNonce((n) => n + 1);
    const visible = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [cloud]);

  return { ...state, refresh: () => setNonce((n) => n + 1) };
}
