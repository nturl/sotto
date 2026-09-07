import { describe, expect, it } from 'vitest';
import { shouldShowPlanRow } from './planRow';

describe('shouldShowPlanRow', () => {
  it('never shows without a cloud adapter', () => {
    expect(shouldShowPlanRow({ cloudEnabled: false, status: 'no-cloud' })).toBe(false);
    expect(shouldShowPlanRow({ cloudEnabled: false, status: 'signed-out' })).toBe(false);
  });

  it('waits while me() is in flight', () => {
    expect(shouldShowPlanRow({ cloudEnabled: true, status: 'loading' })).toBe(false);
  });

  it('shows to a signed-out learner, who has no plan', () => {
    expect(shouldShowPlanRow({ cloudEnabled: true, status: 'signed-out' })).toBe(true);
  });

  it('shows on the free plan', () => {
    expect(shouldShowPlanRow({ cloudEnabled: true, status: 'signed-in', plan: 'free' })).toBe(true);
  });

  it('hides once there is a plan', () => {
    expect(shouldShowPlanRow({ cloudEnabled: true, status: 'signed-in', plan: 'standard' })).toBe(
      false,
    );
    expect(shouldShowPlanRow({ cloudEnabled: true, status: 'signed-in', plan: 'plus' })).toBe(
      false,
    );
  });

  it('shows at most once per render, not once per session', () => {
    const input = { cloudEnabled: true, status: 'signed-in' as const, plan: 'free' as const };
    expect(shouldShowPlanRow(input)).toBe(true);
    expect(shouldShowPlanRow(input)).toBe(true);
  });
});
