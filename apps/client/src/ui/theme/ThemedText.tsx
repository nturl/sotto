/**
 * ThemedText — kept as a thin alias for `Text` (apps/client/src/ui/Text.tsx).
 *
 * Historically this component resolved color against the active scheme
 * while the plain `Text` stayed static, back when only a handful of
 * screens (the reader, settings/appearance) were dark-mode-migrated. Now
 * that `Text` itself reads `useTheme()` internally (see Text.tsx), the two
 * are identical — this alias just avoids touching the reader/appearance
 * call sites that already import `ThemedText`.
 */
import { Text, type TextProps } from '../Text';

export function ThemedText(props: TextProps) {
  return <Text {...props} />;
}
