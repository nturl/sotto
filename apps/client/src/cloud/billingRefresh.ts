import type { CloudAdapter } from './types';

/** Best-effort reconciliation: Account must remain usable if Stripe is down. */
export async function refreshBillingState(
  cloud: CloudAdapter,
  refreshMe: () => void,
): Promise<void> {
  try {
    await cloud.refreshBilling?.();
  } catch {
    // The existing /me state is safer than turning a billing outage into an
    // unhandled rejection or a false logout.
  } finally {
    refreshMe();
  }
}
