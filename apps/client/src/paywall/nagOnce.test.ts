import { describe, expect, it } from 'vitest';
import { claimNagSlot, resetNagForTests } from './nagOnce';

describe('claimNagSlot', () => {
  it('returns true exactly once, then false on every later call', () => {
    resetNagForTests();
    expect(claimNagSlot()).toBe(true);
    expect(claimNagSlot()).toBe(false);
    expect(claimNagSlot()).toBe(false);
  });

  it('stays claimed across separate call sites (module-level, not per-caller)', () => {
    resetNagForTests();
    expect(claimNagSlot()).toBe(true);
    // A second "session" (e.g. a different mounted Home instance) must not
    // get its own independent claim — PAYWALL.md §1a: at most once per app
    // session, not once per row instance.
    expect(claimNagSlot()).toBe(false);
  });
});
