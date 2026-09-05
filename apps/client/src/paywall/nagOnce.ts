/**
 * The free-tier nag row (PAYWALL.md §1a) shows "at most once per session".
 * A module-level flag, not persisted (DECISIONS.md §7 / PAYWALL.md §0: it
 * must not turn into a per-user dismissal state that survives a relaunch —
 * every fresh app start gets one more chance to see it). `claimNagSlot()`
 * is the single gate: it returns true exactly once per process lifetime,
 * so whichever Home mount calls it first wins and no other call site needs
 * its own bookkeeping.
 */
let claimed = false;

export function claimNagSlot(): boolean {
  if (claimed) return false;
  claimed = true;
  return true;
}

/** Test-only: React Testing Library/vitest runs share one module registry
 * across test files unless reset, so tests that assert "shows once" need a
 * way back to the unclaimed state. Never called from app code. */
export function resetNagForTests(): void {
  claimed = false;
}
