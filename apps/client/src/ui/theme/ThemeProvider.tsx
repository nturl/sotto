/**
 * Color-scheme provider (DESKTOP.md's sibling dark-mode task, not itself a
 * desktop concern). `preferences.colorScheme` ('system' default) resolves
 * against the OS/browser preference via React Native's own `useColorScheme`
 * — react-native-web already implements that hook with a
 * `matchMedia('(prefers-color-scheme: dark)')` listener (see
 * node_modules/react-native-web/dist/exports/Appearance), so one hook
 * genuinely covers both "Appearance.getColorScheme() on native" and
 * "matchMedia on web" without any web-specific branching here.
 *
 * Reactivity note (documented per TASK's "least invasive approach, keep
 * every screen compiling" instruction): `useTheme()`/`Text` and anything
 * else that reads colors *inside its render body* (not baked into a
 * module-scope `StyleSheet.create`) updates live the moment the scheme
 * changes. Screens whose styles are built once via
 * `StyleSheet.create({ ...colors.x })` at module load (the majority of the
 * existing screens, e.g. Card/BookTile/Home/Library/Vocabulary — all
 * outside this dispatch's ownership ceiling) keep whichever palette was
 * active when their module first evaluated; only screens deliberately
 * migrated to read colors through `useTheme()` (Text.tsx, the reader, this
 * settings screen) are scheme-reactive in this pass.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { schemes, type SchemeName } from '@sotto/core/theme';
import { useSottoStore } from '../../state/store';
import { setActiveSchemeForThemeColors } from './themeColors';

type ThemeContextValue = {
  scheme: SchemeName;
  colors: (typeof schemes)[SchemeName];
};

const defaultValue: ThemeContextValue = { scheme: 'light', colors: schemes.light };

const ThemeContext = createContext<ThemeContextValue>(defaultValue);

/** Resolves `preferences.colorScheme` ('system' | 'light' | 'dark') to the
 * concrete scheme actually in effect right now. */
export function useColorScheme(): SchemeName {
  const preference = useSottoStore((s) => s.preferences.colorScheme) ?? 'system';
  const system = useSystemColorScheme();
  if (preference === 'system') return system === 'dark' ? 'dark' : 'light';
  return preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const value = useMemo<ThemeContextValue>(() => ({ scheme, colors: schemes[scheme] }), [scheme]);
  // Keep the module-level themeColors proxy (see ./themeColors) in sync so
  // StyleSheet.create call sites reading it get the current scheme.
  useEffect(() => {
    setActiveSchemeForThemeColors(scheme);
  }, [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Active { scheme, colors } — use this instead of the static `colors`
 * import from '@sotto/core/theme' in any screen/component that needs to
 * follow the user's Appearance setting. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
