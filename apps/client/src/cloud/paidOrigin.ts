/**
 * The paid client's own origin. The free web build (readsotto.app) runs on
 * NullCloud, so anything it offers from the paid tier — today only starting
 * the free trial — has to leave as a plain link instead of an in-app route.
 * A staging free reader can set PAID_ORIGIN without enabling CloudProvider;
 * the paid build defaults to the same cloud URL provider.tsx reads.
 */
export const PAID_ORIGIN = (
  process.env.EXPO_PUBLIC_PAID_ORIGIN ??
  process.env.EXPO_PUBLIC_CLOUD_URL ??
  'https://app.readsotto.app'
).replace(/\/$/, '');
