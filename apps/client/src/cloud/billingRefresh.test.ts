import { expect, it, vi } from 'vitest';
import type { CloudAdapter } from './types';
import { refreshBillingState } from './billingRefresh';

it('re-reads Account after a successful billing reconciliation', async () => {
  const refreshBilling = vi.fn(async () => ({ plan: 'free' }));
  const refreshMe = vi.fn();
  await refreshBillingState({ refreshBilling } as unknown as CloudAdapter, refreshMe);
  expect(refreshBilling).toHaveBeenCalledOnce();
  expect(refreshMe).toHaveBeenCalledOnce();
});

it('keeps Account usable and re-reads its cached state when reconciliation fails', async () => {
  const refreshMe = vi.fn();
  await expect(
    refreshBillingState(
      {
        refreshBilling: async () => {
          throw new TypeError('offline');
        },
      } as unknown as CloudAdapter,
      refreshMe,
    ),
  ).resolves.toBeUndefined();
  expect(refreshMe).toHaveBeenCalledOnce();
});
