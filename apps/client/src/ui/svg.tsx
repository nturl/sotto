/**
 * Minimal cross-platform SVG layer — NATIVE FALLBACK implementation.
 *
 * The design system needs vector primitives (glyph strokes, generated cover
 * art, the daily-card gradient, the marker stroke's rough ends). The intended
 * backing library is `react-native-svg`, but it is not installed yet (the
 * package-install step was blocked in this environment). On web,
 * `svg.web.tsx` renders real <svg> elements via react-native-web's
 * unstable_createElement, so web is pixel-true today. This native fallback
 * keeps the bundle compiling: containers render a sized View (with the art's
 * background color when provided) and leaf shapes render nothing.
 *
 * TODO(WS-2): after `pnpm --filter @sotto/client add react-native-svg`,
 * replace this file's bodies with re-exports from 'react-native-svg'.
 */
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

export type SvgProps = {
  width?: number | string;
  height?: number | string;
  viewBox?: string;
  preserveAspectRatio?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Flat color used by the native fallback when the art cannot be drawn. */
  fallbackColor?: string;
  style?: ViewStyle | ViewStyle[];
  children?: ReactNode;
};

export type PathProps = {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
};

export type RectProps = {
  x?: number;
  y?: number;
  width: number | string;
  height: number | string;
  rx?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
};

export type CircleProps = { cx: number; cy: number; r: number; fill?: string };
export type LineProps = { x1: number; y1: number; x2: number; y2: number; stroke?: string; strokeWidth?: number };
export type PolygonProps = { points: string; fill?: string };
export type DefsProps = { children?: ReactNode };
export type LinearGradientProps = { id: string; x1?: string; y1?: string; x2?: string; y2?: string; children?: ReactNode };
export type StopProps = { offset: string; stopColor: string };
export type SvgTextProps = {
  x: number;
  y: number;
  textAnchor?: 'start' | 'middle' | 'end';
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fill?: string;
  children?: ReactNode;
};

export function Svg({ width, height, fallbackColor, style }: SvgProps) {
  return (
    <View
      style={[
        {
          width: typeof width === 'number' ? width : undefined,
          height: typeof height === 'number' ? height : undefined,
          backgroundColor: fallbackColor,
        },
        style,
      ]}
    />
  );
}

export function Path(_props: PathProps) {
  return null;
}

export function Rect(_props: RectProps) {
  return null;
}

export function Circle(_props: CircleProps) {
  return null;
}

export function Line(_props: LineProps) {
  return null;
}

export function Polygon(_props: PolygonProps) {
  return null;
}

export function Defs(_props: DefsProps) {
  return null;
}

export function LinearGradient(_props: LinearGradientProps) {
  return null;
}

export function Stop(_props: StopProps) {
  return null;
}

export function SvgText(_props: SvgTextProps) {
  return null;
}
