/**
 * Icon glyphs: 24px viewBox strokes drawn with the local SVG layer.
 * Paths follow `planning/design/app-mockup-v2.html` (run 8, lane E); stroke
 * weights follow the mockup's CSS — 1.5 for the 22px tab glyphs, 1.6 for
 * the 20px icon buttons (`.ib svg`) and the 18px transport glyphs
 * (`.tc svg`), 1.8 for the 15-18px speaker/save glyphs (`.spk svg`,
 * `.save svg`). Caps and joins are round everywhere, as in the mockup.
 *
 * Colour comes from `useTheme()`, not the module-scope `themeColors`
 * proxy: a proxy read at module scope freezes whichever palette was active
 * when the module was evaluated, so glyphs kept their light-mode ink after
 * a scheme switch (RECON.md risk 10).
 */
import { useTheme } from './theme';
import { Circle, Line, Path, Polygon, Rect, Svg } from './svg';

export type GlyphProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

/** Resolves an explicit colour, else the live ink token. */
function useGlyphColor(color?: string) {
  const { colors } = useTheme();
  return color ?? colors.ink;
}

function GlyphShell({
  size = 24,
  color,
  strokeWidth = 1.8,
  children,
}: GlyphProps & { children: React.ReactNode }) {
  const stroke = useGlyphColor(color);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export function SettingsGlyph(props: GlyphProps) {
  return (
    <GlyphShell {...props}>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </GlyphShell>
  );
}

export function GiftGlyph(props: GlyphProps) {
  return (
    <GlyphShell {...props}>
      <Rect x={4} y={9} width={16} height={11} rx={1} />
      <Path d="M12 9V6M8 9c0-2 1.5-4 4-4s4 2 4 4" />
    </GlyphShell>
  );
}

export function SearchGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.6} {...props}>
      <Circle cx={11} cy={11} r={7} />
      <Path d="M20 20l-3.5-3.5" />
    </GlyphShell>
  );
}

export function PlusGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.8} {...props}>
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </GlyphShell>
  );
}

export function ChevronRightGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={2} {...props}>
      <Path d="M9 6l6 6-6 6" />
    </GlyphShell>
  );
}

export function BackGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={2} {...props}>
      <Path d="M15 18l-6-6 6-6" />
    </GlyphShell>
  );
}

export function PlayGlyph({ size = 24, color }: GlyphProps) {
  const fill = useGlyphColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 4l13 8-13 8z" fill={fill} />
    </Svg>
  );
}

export function WaveformGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={2} {...props}>
      <Path d="M3 12h3l3 8 4-16 3 8h5" />
    </GlyphShell>
  );
}

export function SpeakerGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.8} {...props}>
      <Path d="M4 9v6h4l5 4V5L8 9H4z" />
      <Path d="M16 9a4 4 0 0 1 0 6" />
    </GlyphShell>
  );
}

export function BookmarkGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.8} {...props}>
      <Path d="M6 3h12v18l-6-4-6 4z" />
    </GlyphShell>
  );
}

export function TrashGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={2} {...props}>
      <Path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" />
    </GlyphShell>
  );
}

export function CloseGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.6} {...props}>
      <Path d="M6 6l12 12M18 6 6 18" />
    </GlyphShell>
  );
}

export function ClockGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={2} {...props}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 3" />
    </GlyphShell>
  );
}

export function LevelGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={2} {...props}>
      <Path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0 0 4h13" />
    </GlyphShell>
  );
}

export function MuteGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.7} {...props}>
      <Path d="M11 5 6 9H3v6h3l5 4V5z" />
      <Path d="M16 9l5 6M21 9l-5 6" />
    </GlyphShell>
  );
}

export function ReplayGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.7} {...props}>
      <Path d="M4 12a8 8 0 1 1 2.5 5.8" />
      <Path d="M4 6v6h6" />
    </GlyphShell>
  );
}

export function PauseGlyph({ size = 24, color }: GlyphProps) {
  const fill = useGlyphColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={5} width={4} height={14} rx={1} fill={fill} />
      <Rect x={14} y={5} width={4} height={14} rx={1} fill={fill} />
    </Svg>
  );
}

export function StopGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.7} {...props}>
      <Rect x={6} y={6} width={12} height={12} rx={1.5} />
    </GlyphShell>
  );
}

export function MicGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.8} {...props}>
      <Path d="M12 3a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4z" />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </GlyphShell>
  );
}

export function StarGlyph(props: GlyphProps) {
  return (
    <GlyphShell {...props}>
      <Path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.7-5.4 2.7 1.1-6L3.2 9.4l6.1-.8z" />
    </GlyphShell>
  );
}

export function OpenBookGlyph(props: GlyphProps) {
  return (
    <GlyphShell {...props}>
      <Path d="M2 5c3-1.5 6-1.5 8 0 2-1.5 5-1.5 8 0v14c-3-1.5-6-1.5-8 0-2-1.5-5-1.5-8 0z" />
      <Line x1={12} y1={5} x2={12} y2={19} />
    </GlyphShell>
  );
}

export function CapGlyph(props: GlyphProps) {
  return (
    <GlyphShell {...props}>
      <Path d="M12 4 2 9l10 5 10-5z" />
      <Path d="M6 11v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" />
      <Line x1={22} y1={9} x2={22} y2={14} />
    </GlyphShell>
  );
}

/**
 * The four tab-bar glyphs (`app-mockup-v2.html:345-348`), drawn at 22px
 * with stroke 1.5 by `TabBar`. `BookOpenGlyph` is the mockup's split
 * open-book (For you); `OpenBookGlyph` above is the older single-spine
 * drawing still used by the book-detail metadata strip.
 */
export function BookOpenGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.5} {...props}>
      <Path d="M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z" />
      <Path d="M20 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />
    </GlyphShell>
  );
}

/** Library tab: three books upright with a fourth leaning. */
export function ShelvesGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.5} {...props}>
      <Path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 5l3.8 1 -3.9 14-3.8-1z" />
    </GlyphShell>
  );
}

/**
 * Settings tab: the mockup's sun-style gear (`app-mockup-v2.html:348`),
 * distinct from `SettingsGlyph`, the cog used by the title-row icon button
 * (`app-mockup-v2.html:206`).
 */
export function GearGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.5} {...props}>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" />
    </GlyphShell>
  );
}

export function SkipPrevGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.6} {...props}>
      <Path d="M6 5v14M18 5 8 12l10 7z" />
    </GlyphShell>
  );
}

export function SkipNextGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={1.6} {...props}>
      <Path d="M18 5v14M6 5l10 7-10 7z" />
    </GlyphShell>
  );
}

export function ForwardGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={2} {...props}>
      <Path d="M20 12a8 8 0 1 0-2.5 5.8" />
      <Path d="M20 6v6h-6" />
    </GlyphShell>
  );
}

/**
 * Completion view's "hand-drawn arrow" (DESIGN.md "Completion": "a
 * hand-drawn arrow — single 1.5px ink SVG path with slight wobble"). Was
 * the literal `↓` character (ADVERSARIAL-REVIEW.md design-drift list); this
 * is a single stroked path whose shaft bows very slightly left-then-right
 * rather than a straight line, ending in an asymmetric arrowhead.
 */
export function HandDrawnArrowGlyph({
  width = 24,
  height = 40,
  color,
  strokeWidth = 1.5,
}: {
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const stroke = useGlyphColor(color);
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 24 40"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
    >
      <Path d="M12 2 C 10.5 8 13.5 13 12 19 C 10.7 25 13.4 29 12 34" strokeLinecap="round" />
      <Path d="M12 34 L5.5 27.5" strokeLinecap="round" />
      <Path d="M12 34 L18 28.5" strokeLinecap="round" />
    </Svg>
  );
}

/** The marker-stroke rough-ends polygon (DESIGN.md device B), shared with MarkerStroke. */
export function MarkerStrokeShape({
  width,
  height,
  color,
}: {
  width: number;
  height: number;
  color: string;
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
      <Polygon points="0,30 4,0 96,12 100,35 100,78 96,100 4,88 0,62" fill={color} />
    </Svg>
  );
}
