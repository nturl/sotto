/**
 * The paid client's own origin. The free web build (readsotto.app) runs on
 * NullCloud, so anything it offers from the paid tier — today only starting
 * the free trial — has to leave as a plain link instead of an in-app route.
 * Same env var provider.tsx and the paywall read, so a staging build points
 * at its own cloud rather than production.
 */
export const PAID_ORIGIN = (
  process.env.EXPO_PUBLIC_CLOUD_URL ?? 'https://app.readsotto.app'
).replace(/\/$/, '');
