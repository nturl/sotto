/**
 * Small helpers that derive values from @sotto/core/theme tokens.
 * Nothing here introduces a new color/size — only derivations of tokens.
 */
import { Platform, type ViewStyle } from 'react-native';
import { colors } from '@sotto/core/theme';

/** Expand a #RRGGBB token to an rgba() string at the given alpha. */
export function withAlpha(hexToken: string, alpha: number): string {
  const hex = hexToken.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Word-selection fill: peach at 18% (DESIGN.md reader spec). */
export const peachSelection = withAlpha(colors.peach, 0.18);

/** Dotted word underline: peach at 35% (DESIGN.md reader spec). */
export const peachUnderline = withAlpha(colors.peach, 0.35);

/** react-native-web honors `cursor` in styles; native ignores the cast. */
export const webCursor = (Platform.OS === 'web'
  ? { cursor: 'pointer' }
  : {}) as unknown as ViewStyle;
