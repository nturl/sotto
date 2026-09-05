/**
 * iOS purchase flow via `expo-iap` (the OpenIAP monorepo's Expo module —
 * added instead of hand-rolling StoreKit bindings because it already wraps
 * `initConnection`/`requestPurchase`/`purchaseUpdatedListener`/
 * `finishTransaction` behind one cross-store API and ships an Expo config
 * plugin, so no native module work is needed to add it to `app.config.ts`).
 *
 * PAYWALL.md §2: the primary CTA on iOS is StoreKit. There are no App
 * Store Connect products yet (docs/app-store.md — no Apple Developer team
 * configured), so this has not been exercised against a real purchase;
 * the shape follows expo-iap's documented `RequestPurchaseProps` /
 * `Purchase` types (node_modules/expo-iap/build/types.d.ts) and should be
 * spot-checked once `sotto.standard.monthly` / `sotto.plus.monthly` exist.
 */
import {
  endConnection,
  finishTransaction,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
} from 'expo-iap';
import type { CloudAdapter, Entitlement } from './types';
import { CloudError } from './types';

/** iOS purchases return their StoreKit 2 JWS on `jwsRepresentationIOS`
 * (per expo-iap's `VerifyPurchaseResultIOS`); some expo-iap versions carry
 * it directly on the `Purchase` object instead, so this checks both spots
 * rather than assuming one. */
function extractJws(purchase: Purchase): string | undefined {
  const p = purchase as unknown as Record<string, unknown>;
  const jws = p.jwsRepresentationIOS ?? p.jwsRepresentation ?? p.transactionReceipt;
  return typeof jws === 'string' && jws.length > 0 ? jws : undefined;
}

export async function purchaseWithAppleIap(
  cloud: CloudAdapter,
  appleProductId: string,
): Promise<Entitlement> {
  await initConnection();
  try {
    const purchase = await new Promise<Purchase>((resolve, reject) => {
      const updateSub = purchaseUpdatedListener((p) => {
        updateSub.remove();
        errorSub.remove();
        resolve(p);
      });
      const errorSub = purchaseErrorListener((err) => {
        updateSub.remove();
        errorSub.remove();
        reject(new CloudError('purchase_failed', err.message ?? 'Purchase failed.'));
      });
      requestPurchase({
        type: 'subs',
        request: { apple: { sku: appleProductId } },
      }).catch((err: unknown) => {
        updateSub.remove();
        errorSub.remove();
        reject(err);
      });
    });

    const jws = extractJws(purchase);
    if (!jws)
      throw new CloudError(
        'purchase_unverifiable',
        'Purchase completed but could not be verified.',
      );

    const entitlement = await cloud.submitAppleTransaction(jws);
    await finishTransaction({ purchase, isConsumable: false });
    return entitlement;
  } finally {
    await endConnection();
  }
}

export async function restoreApplePurchases(cloud: CloudAdapter): Promise<Entitlement | null> {
  await initConnection();
  try {
    await restorePurchases();
    const me = await cloud.me();
    return me?.entitlement ?? null;
  } finally {
    await endConnection();
  }
}
