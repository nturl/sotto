/**
 * Icon glyphs: 24px viewBox strokes drawn with the local SVG layer.
 * Icon strokes use the ink token by default; the speaker/ring usages pass
 * the accent token explicitly (accent as 2px outline only, per DESIGN.md).
 */
import { themeColors as colors } from './theme';
import { Circle, Line, Path, Polygon, Rect, Svg } from './svg';

export type GlyphProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

function GlyphShell({
  size = 24,
  color = colors.ink,
  strokeWidth = 1.8,
  children,
}: GlyphProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
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
    <GlyphShell {...props}>
      <Circle cx={11} cy={11} r={7} />
      <Path d="M21 21l-4.3-4.3" />
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

export function PlayGlyph({ size = 24, color = colors.ink }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5v14l11-7z" fill={color} />
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
    <GlyphShell strokeWidth={2} {...props}>
      <Path d="M3 9v6h4l5 5V4L7 9H3z" />
      <Path d="M16 8a5 5 0 0 1 0 8" />
    </GlyphShell>
  );
}

export function BookmarkGlyph(props: GlyphProps) {
  return (
    <GlyphShell strokeWidth={2} {...props}>
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
    <GlyphShell strokeWidth={2} {...props}>
      <Path d="M5 5l14 14M19 5 5 19" />
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

export function PauseGlyph({ size = 24, color = colors.ink }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={5} width={4} height={14} rx={1} fill={color} />
      <Rect x={14} y={5} width={4} height={14} rx={1} fill={color} />
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
      <Rect x={9} y={3} width={6} height={11} rx={3} />
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

export function SkipPrevGlyph({ size = 24, color = colors.ink }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6h2v12H6zM20 6l-10 6 10 6z" fill={color} />
    </Svg>
  );
}

export function SkipNextGlyph({ size = 24, color = colors.ink }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M16 6h2v12h-2zM4 6l10 6-10 6z" fill={color} />
    </Svg>
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
  color = colors.ink,
  strokeWidth = 1.5,
}: {
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 24 40"
      fill="none"
      stroke={color}
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
