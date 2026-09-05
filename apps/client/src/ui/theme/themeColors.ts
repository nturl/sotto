/**
 * `themeColors` — a `colors`-shaped object for `StyleSheet.create` call
 * sites that want the active scheme's palette without threading a prop
 * through. Property reads always return whatever `ThemeProvider` last set
 * as the active scheme (module-level, updated by ThemeProvider's effect
 * below) — so `StyleSheet.create({ card: { backgroundColor:
 * themeColors.surface } })` bakes in whatever scheme is active *at the
 * moment that call runs*. That still means the call itself must re-run on
 * scheme change to pick up new values (e.g. `useMemo(() =>
 * StyleSheet.create(...), [scheme])` inside a component) — a Proxy can't
 * make a *already-executed* StyleSheet.create call retroactively reactive,
 * only a component re-render can. This is the "least invasive" half of
 * that: call sites read `themeColors.x` instead of importing a specific
 * palette, and recompute their styles keyed on `useTheme().scheme`.
 */
import { schemes, type SchemeName } from '@sotto/core/theme';

let activeScheme: SchemeName = 'light';

/** Set by ThemeProvider whenever the resolved scheme changes. Not exported
 * — only ThemeProvider should drive this. */
export function setActiveSchemeForThemeColors(scheme: SchemeName): void {
  activeScheme = scheme;
}

export const themeColors: (typeof schemes)['light'] = new Proxy(schemes.light, {
  get(_target, prop: string) {
    return (schemes[activeScheme] as Record<string, string>)[prop];
  },
}) as (typeof schemes)['light'];
