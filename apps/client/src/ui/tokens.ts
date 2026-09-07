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

/** Word-selection fill: peach at 55% (run 8 PLAN.md decision 7 — DESIGN.md's
 * 18% is effectively invisible on the canvas, and the v2 mockup's `.w.sel`
 * is `rgba(242,200,180,.55)`). */
export const peachSelection = withAlpha(colors.peach, 0.55);

/** The same fill, flattened against the light canvas it was measured on.
 * A 55% peach over the *dark* canvas composites to a muddy grey (ink on it
 * measures 3.95:1), so on a dark ground the selection uses this opaque
 * equivalent and keeps the mockup's appearance and its ink text. */
export const peachSelectionOpaque = flattenOnCanvas(colors.peach, 0.55);

function flattenOnCanvas(hexToken: string, alpha: number): string {
  const channel = (hex: string, index: number) =>
    parseInt(hex.replace('#', '').slice(index * 2, index * 2 + 2), 16);
  const mixed = [0, 1, 2].map((i) =>
    Math.round(alpha * channel(hexToken, i) + (1 - alpha) * channel(colors.canvas, i)),
  );
  return `rgb(${mixed[0]},${mixed[1]},${mixed[2]})`;
}

/** Dotted word underline: peach at 35%. Run 8 removes the underline from the
 * reader (decision 7: "No dotted underline on any token"), but the voice
 * screen's SpeechFillText.tsx — not this lane's file — still reads it, so the
 * token stays. Delete it with that call site, not before. */
export const peachUnderline = withAlpha(colors.peach, 0.35);

/** react-native-web honors `cursor` in styles; native ignores the cast. */
export const webCursor = (Platform.OS === 'web'
  ? { cursor: 'pointer' }
  : {}) as unknown as ViewStyle;
