/**
 * Design tokens for Sotto (Direction A "Paper").
 * Transcribed verbatim from planning/design/DESIGN.md "Tokens" section.
 * Screens must import from here — never inline colors/sizes.
 */

export const colors = {
  canvas: '#F4ECDF', // app background, every screen
  surface: '#FBF6EC', // cards, sheets, docked panels, tab bar
  surface2: '#EFE4D2', // secondary buttons, chips, metadata strip, progress track
  ink: '#221E1B', // primary text, primary-button shadow, icon strokes
  ink2: '#6E6459', // secondary text, inactive tab labels
  ink3: '#9C9287', // muted/legal text (4.5:1 on canvas)
  hairline: 'rgba(34,30,27,0.12)', // borders, dividers
  accent: '#E4572E', // ONE job: primary CTA fill + active tab. Nowhere else.
  peach: '#F2C8B4', // the cutout shadow color, and the 18% word-selection fill
  mark: '#FFD8A8', // the saved-word marker stroke (marker sweep)
  quiet: '#B5AB9F', // unspoken narration words (speech fill start state)
  ok: '#4E7D5B', // offline/ready states only, never a button
  warn: '#B8651B', // error/limit text only
  dailyTeal: '#1F4F57', // daily-story card gradient start (the only gradient in v1)
  dailySage: '#5B8A6B', // daily-story card gradient end
} as const;

export type ColorToken = keyof typeof colors;

type TypeRole = {
  face: string;
  size: number;
  lineHeight: number;
  tracking: number;
  weight: number;
};

export const type = {
  display: {
    face: 'Fraunces',
    size: 34,
    lineHeight: 1.05,
    tracking: -0.015,
    weight: 300,
  },
  heading: {
    face: 'Fraunces',
    size: 22,
    lineHeight: 1.15,
    tracking: -0.01,
    weight: 400,
  },
  reading: {
    face: 'Fraunces',
    size: 20,
    lineHeight: 1.55,
    tracking: 0,
    weight: 400,
  },
  readingCjk: {
    face: 'system-cjk-serif',
    size: 22,
    lineHeight: 1.8,
    tracking: 0,
    weight: 400,
  },
  ui: {
    face: 'Inter',
    size: 16,
    lineHeight: 1.4,
    tracking: 0,
    weight: 400,
  },
  uiButton: {
    face: 'Inter',
    size: 16,
    lineHeight: 1.4,
    tracking: 0,
    weight: 500,
  },
  caption: {
    face: 'Inter',
    size: 13,
    lineHeight: 1.4,
    tracking: 0,
    weight: 400,
  },
  monoLabel: {
    face: 'system-mono',
    size: 11,
    lineHeight: 1,
    tracking: 0.08,
    weight: 400,
  },
} satisfies Record<string, TypeRole>;

export type TypeRoleName = keyof typeof type;

export const radius = {
  sm: 2, // covers, images
  md: 10, // cards, sheets, buttons
  full: 9999, // speaker button, play ring only
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  gutter: {
    phone: 20,
    tablet: 32,
    desktop: 48,
  },
  sectionRhythm: {
    phone: 32,
    desktop: 48,
  },
  tapTarget: 44,
} as const;

/** The cutout: hard-edged offset shadow, no blur, ever. */
export const shadow = {
  cutoutPeach: { offsetX: 6, offsetY: 6, blur: 0, spread: 0, color: colors.peach },
  cutoutInk: { offsetX: 4, offsetY: 4, blur: 0, spread: 0, color: colors.ink },
  pressed: { offsetX: 2, offsetY: 2, blur: 0, spread: 0 },
} as const;

export const motion = {
  press: { durationMs: 120, easing: 'ease' },
  sheet: { durationMs: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  savedWordSweep: { durationMs: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  speechFillStaggerMs: 60,
} as const;

export const theme = { colors, type, radius, space, shadow, motion } as const;

export type Theme = typeof theme;
