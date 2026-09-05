/**
 * ThemedText — `Text` (apps/client/src/ui/Text.tsx) with its color resolved
 * against the *active* scheme instead of the static light `colors` import.
 *
 * Why this exists instead of just making `Text` itself theme-aware: `Text`
 * is used by every screen in the app, and only a handful of screens (the
 * reader, settings/appearance) have been migrated to dark-mode-correct
 * backgrounds in this pass — the rest (Home, Library, Vocabulary, Card,
 * BookTile, Sidebar, TabBar, …) are outside this dispatch's ownership
 * ceiling and still render their `StyleSheet.create`-baked light
 * canvas/surface colors regardless of scheme. Making `Text` globally
 * scheme-aware was tried first and reverted: in dark mode it rendered
 * near-white ink text on those screens' still-light backgrounds —
 * unreadable, a worse regression than doing nothing. `ThemedText` is the
 * opt-in alternative: only call sites that know their surrounding surface
 * is *also* theme-aware should use it.
 */
import { Text, ROLE_COLOR, type TextProps, type TextRole } from '../Text';
import { useTheme } from './ThemeProvider';

const DEFAULT_ROLE: TextRole = 'ui';

export function ThemedText({ role = DEFAULT_ROLE, color, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const resolvedColor = colors[color ?? ROLE_COLOR[role]];
  return <Text role={role} style={[{ color: resolvedColor }, style]} {...rest} />;
}
