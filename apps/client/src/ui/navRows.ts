/**
 * Pure nav-row data shared by `Sidebar.tsx` (desktop) and `TabBar.tsx`
 * (phone) — CONFIRM 25 / run-7 card B: both surfaces show the same four
 * rows, Home/Library/Vocabulary plus a pinned/appended Settings row.
 *
 * Kept free of any `react-native` import on purpose: this repo's `vitest`
 * setup has no React Native transform, so any module that imports
 * `react-native` (even transitively, e.g. `Sidebar.tsx` itself) fails to
 * parse under plain `vitest run` (`import typeof * as ReactNativePublicAPI`
 * is Flow syntax rollup/esbuild can't read). Pulling the plain-data pieces
 * out here is what makes `navRows.test.ts` possible without a component
 * render harness.
 */
import type { MessageKey } from '../i18n/useT';

export type NavRow = { segment: string; href: string; labelKey: MessageKey };

export const NAV_ROWS: NavRow[] = [
  { segment: 'home', href: '/(tabs)/home', labelKey: 'tabs.home' },
  { segment: 'library', href: '/(tabs)/library', labelKey: 'tabs.library' },
  { segment: 'vocabulary', href: '/(tabs)/vocabulary', labelKey: 'tabs.vocabulary' },
];

/** `/settings` doesn't exist as a route until lane E lands
 * `app/settings/index.tsx` — until then this 404s to `+not-found.tsx`,
 * which is expected (noted in the run-7 report); `/profile` still works as
 * the interim settings screen. */
export const SETTINGS_ROW: NavRow = {
  segment: 'settings',
  href: '/settings',
  labelKey: 'tabs.settings',
};

export type TabRow = { key: string; name: string; isSettings?: boolean };

/** Appends the Settings row after the real tab-navigator routes (Settings
 * isn't one of the `Tabs.Screen`s in `app/(tabs)/_layout.tsx` — it lives
 * outside the tabs group — so `TabBar` renders it as a plain nav link
 * rather than a `navigation.navigate` tab switch). */
export function buildTabRows(routes: Array<{ key: string; name: string }>): TabRow[] {
  return [...routes, { key: 'settings', name: 'settings', isSettings: true }];
}
