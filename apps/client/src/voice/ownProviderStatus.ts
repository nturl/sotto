/**
 * Own-provider mode's status — the single source of truth (run 7, lane E).
 *
 * Before this, "is the setting connected?" was answered independently by
 * three places: Profile's own `useState` (re-read once, on mount, from
 * `hasByokKey()`), the openai-key screen's own `stored` state, and
 * `availability.ts`'s `byokPathUsable()` (also just `hasByokKey()`). Profile
 * never re-ran its check on navigating back from Settings, so the row could
 * read "Off" for a key that was, in fact, saved — the "it seems like it
 * saved it okay, but then this should be turned to on right now, it's off"
 * defect. Every one of those call sites now reads this one Zustand field
 * instead: it changes once, and anything subscribed to it (the hub row,
 * `TutorModelsPanel`, the voice screen) re-renders in the same tick, whether
 * or not that screen happens to be freshly mounted.
 *
 * States (planning/KICKOFF-7-FABLE.md "Truthful states"; the run-7 E card):
 *   disconnected  no key stored on this device.
 *   connecting    the guided flow is validating a just-pasted key.
 *   connected     a key is stored and was accepted by validation.
 *   active        a key is stored AND it is the path actually driving the
 *                 current or most recent tutor session (set by the tutor
 *                 pipeline/voice screen, not by this module).
 *   invalid       a key is stored but was rejected — by Save's own
 *                 validation, or by a 401/403 mid-session.
 *   unavailable   this device cannot store a key at all (e.g. `localStorage`
 *                 blocked) — distinct from "disconnected", which means no
 *                 key was ever entered.
 *
 * Only the guided flow (`app/settings/openai-key.tsx`) writes this field.
 * `byokKey.ts` itself is untouched — storage/validation stay exactly as
 * they were, per the run-7 card's cordon around that code.
 */
import { useSottoStore } from '../state/store';

export type OwnProviderStatus =
  'disconnected' | 'connecting' | 'connected' | 'active' | 'invalid' | 'unavailable';

/** Read the current status. Re-renders the caller whenever the flow (or the
 * tutor pipeline, for `active`) changes it — no focus/mount tricks needed. */
export function useOwnProviderStatus(): OwnProviderStatus {
  return useSottoStore((s) => s.ownProviderStatus);
}

/** Write the status. The flow calls this directly; nothing else should. */
export function setOwnProviderStatus(status: OwnProviderStatus): void {
  useSottoStore.getState().setOwnProviderStatus(status);
}

/** Read it outside a component (e.g. a one-time hydration check). */
export function getOwnProviderStatus(): OwnProviderStatus {
  return useSottoStore.getState().ownProviderStatus;
}
