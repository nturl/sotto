import type { MessageKey } from '../i18n/useT';
import type { Entitlement } from './types';

export interface AccountBillingRow {
  labelKey: MessageKey;
  at: string | null;
}

/** Turns server billing metadata into the one truthful date row on Account. */
export function accountBillingRow(entitlement: Entitlement): AccountBillingRow | null {
  const at = entitlement.billingEndsAt ?? entitlement.renewsAt;
  switch (entitlement.billingStatus) {
    case 'trialing':
      return { labelKey: 'account.trialEndsRow', at };
    case 'canceling':
      return { labelKey: 'account.accessEndsRow', at };
    case 'expired':
      return { labelKey: 'account.accessEndedRow', at };
    case 'active':
      return { labelKey: 'account.renewalRow', at };
    default:
      return entitlement.plan === 'free'
        ? null
        : { labelKey: 'account.renewalRow', at: entitlement.renewsAt };
  }
}
