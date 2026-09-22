/**
 * Guarded back — the shape `src/voice/exitTutor.ts` already uses, pulled out
 * so every "Back"/"Close" control shares it. A cold-loaded screen (a pasted
 * /book/<id> link, a reload, the installed PWA) has nothing to pop, and
 * expo-router's `back()` silently no-ops there rather than throwing, so the
 * control sits on screen doing nothing (audit 2026-09-21). Falling back to an
 * explicit destination is the only way off those screens.
 *
 * Kept free of any `react-native` import so it stays testable under plain
 * `vitest run`, the same reason `navRows.ts` is split out.
 */
import type { Href } from 'expo-router';

export type BackRouter = {
  canGoBack(): boolean;
  back(): void;
  replace(href: Href): void;
};

export function goBackOr(router: BackRouter, fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
