/**
 * The only text component screens should use. Roles map 1:1 to the type
 * tokens in @sotto/core/theme; color comes from color tokens. `size` exists
 * solely for the rare spots where DESIGN.md names a size outside the role
 * scale (e.g. book-detail title 30, wordmark 22) — pass token-adjacent
 * values only.
 */
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, type as typeScale, type ColorToken } from '@sotto/core/theme';
import { fonts } from './fonts';

export type TextRole = 'display' | 'heading' | 'reading' | 'ui' | 'uiButton' | 'caption' | 'mono';

const ROLE_TOKEN = {
  display: typeScale.display,
  heading: typeScale.heading,
  reading: typeScale.reading,
  ui: typeScale.ui,
  uiButton: typeScale.uiButton,
  caption: typeScale.caption,
  mono: typeScale.monoLabel,
} as const;

const ROLE_FONT: Record<TextRole, string> = {
  display: fonts.frauncesLight,
  heading: fonts.frauncesRegular,
  reading: fonts.frauncesRegular,
  ui: fonts.interRegular,
  uiButton: fonts.interMedium,
  caption: fonts.interRegular,
  mono: fonts.mono,
};

const ROLE_COLOR: Record<TextRole, ColorToken> = {
  display: 'ink',
  heading: 'ink',
  reading: 'ink',
  ui: 'ink',
  uiButton: 'ink',
  caption: 'ink2',
  mono: 'ink2',
};

export type TextProps = Omit<RNTextProps, 'role'> & {
  role?: TextRole;
  color?: ColorToken;
  size?: number;
};

export function Text({ role = 'ui', color, size, style, ...rest }: TextProps) {
  const token = ROLE_TOKEN[role];
  const fontSize = size ?? token.size;
  const base: TextStyle = {
    fontFamily: ROLE_FONT[role],
    fontSize,
    lineHeight: Math.round(fontSize * token.lineHeight),
    letterSpacing: token.tracking * fontSize,
    color: colors[color ?? ROLE_COLOR[role]],
  };
  return <RNText style={[base, style]} {...rest} />;
}
