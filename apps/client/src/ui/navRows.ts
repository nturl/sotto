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

/**
 * Names of the four tab glyphs from `planning/design/app-mockup-v2.html`
 * (lines 345-348). Kept here rather than in `Glyphs.tsx` so the row →
 * glyph pairing is testable without importing `react-native`; `TabBar`
 * resolves a name to the component.
 */
export type NavGlyphName = 'bookOpen' | 'shelves' | 'bookmark' | 'gear';

export const NAV_GLYPH_NAMES: NavGlyphName[] = ['bookOpen', 'shelves', 'bookmark', 'gear'];

/** Route/segment name → tab glyph. Unknown routes get no glyph. */
export const NAV_GLYPHS: Record<string, NavGlyphName> = {
  home: 'bookOpen',
  library: 'shelves',
  vocabulary: 'bookmark',
  settings: 'gear',
};

export type NavRow = {
  segment: string;
  href: string;
  labelKey: MessageKey;
  glyph: NavGlyphName;
};

export const NAV_ROWS: NavRow[] = [
  { segment: 'home', href: '/(tabs)/home', labelKey: 'tabs.home', glyph: 'bookOpen' },
  { segment: 'library', href: '/(tabs)/library', labelKey: 'tabs.library', glyph: 'shelves' },
  {
    segment: 'vocabulary',
    href: '/(tabs)/vocabulary',
    labelKey: 'tabs.vocabulary',
    glyph: 'bookmark',
  },
];

/** `/settings` doesn't exist as a route until lane E lands
 * `app/settings/index.tsx` — until then this 404s to `+not-found.tsx`,
 * which is expected (noted in the run-7 report); `/profile` still works as
 * the interim settings screen. */
export const SETTINGS_ROW: NavRow = {
  segment: 'settings',
  href: '/settings',
  labelKey: 'tabs.settings',
  glyph: 'gear',
};

export type TabRow = {
  key: string;
  name: string;
  isSettings?: boolean;
  glyph?: NavGlyphName;
};

/** Appends the Settings row after the real tab-navigator routes (Settings
 * isn't one of the `Tabs.Screen`s in `app/(tabs)/_layout.tsx` — it lives
 * outside the tabs group — so `TabBar` renders it as a plain nav link
 * rather than a `navigation.navigate` tab switch). */
export function buildTabRows(routes: Array<{ key: string; name: string }>): TabRow[] {
  return [
    ...routes.map((route) => ({ ...route, glyph: NAV_GLYPHS[route.name] })),
    { key: 'settings', name: 'settings', isSettings: true, glyph: NAV_GLYPHS.settings },
  ];
}
