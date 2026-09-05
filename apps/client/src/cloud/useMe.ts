/**
 * useMe — cached `me()` with a manual `refresh()`. Distinguishes three
 * states screens must render differently (ACCOUNT.md / PAYWALL.md §4):
 *  - 'no-cloud': no CloudAdapter configured (NullCloud) — the caller must
 *    not render any account/paywall/usage UI at all.
 *  - 'signed-out': a real adapter, but no session.
 *  - 'signed-in': a real adapter with a live Me (user + entitlement).
 */
import { useEffect, useState } from 'react';
import type { Me } from './types';
import { useCloud } from './provider';

export type MeState =
  | { status: 'no-cloud' }
  | { status: 'loading' }
  | { status: 'signed-out' }
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
      .catch(() => {
        if (!cancelled) setState({ status: 'signed-out' });
      });
    return () => {
      cancelled = true;
    };
  }, [cloud, nonce]);

  return { ...state, refresh: () => setNonce((n) => n + 1) };
}
