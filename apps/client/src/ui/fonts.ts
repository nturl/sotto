/**
 * Font family names exactly as registered in app/_layout.tsx via useFonts.
 * Fraunces display/heading/reading weights come from the family name
 * (300 = Light, 400 = Regular) — never from fontWeight.
 */
import { Platform } from 'react-native';

export const fonts = {
  frauncesLight: 'Fraunces_300Light',
  frauncesRegular: 'Fraunces_400Regular',
  interRegular: 'Inter_400Regular',
  interMedium: 'Inter_500Medium',
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  }),
} as const;
