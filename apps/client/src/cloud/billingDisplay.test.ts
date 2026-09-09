import { describe, expect, it } from 'vitest';
import type { Entitlement } from './types';
import { accountBillingRow } from './billingDisplay';

const BASE: Entitlement = {
  plan: 'standard',
  tutorMinutesCap: 250,
  tutorMinutesUsed: 0,
  tutorMinutesRemaining: 250,
  importBooksCap: 2,
  importsUsed: 0,
  renewsAt: '2026-10-09T00:00:00.000Z',
  billingEndsAt: '2026-10-09T00:00:00.000Z',
  provider: 'cascade-openai',
};

describe('accountBillingRow', () => {
  it('labels an active paid period as a renewal', () => {
    expect(accountBillingRow({ ...BASE, billingStatus: 'active' })).toEqual({
      labelKey: 'account.renewalRow',
      at: BASE.renewsAt,
    });
  });

  it('labels a trial separately from a paid renewal', () => {
    expect(accountBillingRow({ ...BASE, billingStatus: 'trialing' })).toEqual({
      labelKey: 'account.trialEndsRow',
      at: BASE.renewsAt,
    });
  });

  it('labels a scheduled cancellation as access ending while preserving the paid plan', () => {
    expect(accountBillingRow({ ...BASE, billingStatus: 'canceling' })).toEqual({
      labelKey: 'account.accessEndsRow',
      at: BASE.renewsAt,
    });
  });

  it('shows the end of expired paid access distinctly from a never-subscribed free account', () => {
    expect(
      accountBillingRow({
        ...BASE,
        plan: 'free',
        billingStatus: 'expired',
        renewsAt: '2026-09-12T00:00:00.000Z',
        billingEndsAt: '2026-09-12T00:00:00.000Z',
      }),
    ).toEqual({
      labelKey: 'account.accessEndedRow',
      at: '2026-09-12T00:00:00.000Z',
    });
    expect(
      accountBillingRow({ ...BASE, plan: 'free', billingStatus: null, renewsAt: null }),
    ).toBeNull();
  });

  it('keeps the renewal label for a paid entitlement from an older server', () => {
    expect(accountBillingRow(BASE)).toEqual({
      labelKey: 'account.renewalRow',
      at: BASE.renewsAt,
    });
  });
});
