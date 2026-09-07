/**
 * Run 8 PLAN decision 10: the plan nag left Home for Settings > Account.
 *
 * That move retires `claimNagSlot()` (the once-per-process claim this file
 * replaced): a settings row is not a nag that interrupts reading, it is a
 * row in a list, so it must render every time the learner opens Settings
 * rather than exactly once per app launch. PAYWALL.md §4/§6 still holds —
 * no CloudAdapter means no paywall UI at all.
 *
 * RN-free so `planRow.test.ts` can import it under this repo's plain
 * `vitest run`.
 */
export type PlanRowInput = {
  /** `useCloud().enabled` — false in the OSS/NullCloud build. */
  cloudEnabled: boolean;
  /** `useMe().status`. */
  status: 'no-cloud' | 'loading' | 'signed-out' | 'signed-in';
  /** `useMe().me.entitlement.plan`, when signed in. */
  plan?: 'free' | 'standard' | 'plus';
};

/** True whenever the learner has no plan: signed out, or signed in on free.
 * `loading` waits rather than flashing the row and taking it away again. */
export function shouldShowPlanRow({ cloudEnabled, status, plan }: PlanRowInput): boolean {
  if (!cloudEnabled) return false;
  if (status === 'signed-out') return true;
  if (status === 'signed-in') return plan === 'free';
  return false;
}
