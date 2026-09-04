/**
 * Minimal cross-platform SVG layer — WEB implementation.
 *
 * Renders real <svg> DOM through react-native-web's unstable_createElement,
 * so glyphs, cover art, gradients and the marker stroke are pixel-true in the
 * browser without pulling react-native-svg (whose native side is not
 * installed yet — see svg.tsx). Prop types must stay in sync with svg.tsx.
 */
import { unstable_createElement } from 'react-native-web';
import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

export type SvgProps = {
  width?: number | string;
  height?: number | string;
  viewBox?: string;
  preserveAspectRatio?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
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

export function Svg({ children, fallbackColor: _fallbackColor, ...rest }: SvgProps) {
  return unstable_createElement('svg', rest, children);
}

export function Path(props: PathProps) {
  return unstable_createElement('path', props);
}

export function Rect(props: RectProps) {
  return unstable_createElement('rect', props);
}

export function Circle(props: CircleProps) {
  return unstable_createElement('circle', props);
}

export function Line(props: LineProps) {
  return unstable_createElement('line', props);
}

export function Polygon(props: PolygonProps) {
  return unstable_createElement('polygon', props);
}

export function Defs({ children }: DefsProps) {
  return unstable_createElement('defs', {}, children);
}

export function LinearGradient({ children, ...rest }: LinearGradientProps) {
  return unstable_createElement('linearGradient', rest, children);
}

export function Stop(props: StopProps) {
  return unstable_createElement('stop', props);
}

export function SvgText({ children, ...rest }: SvgTextProps) {
  return unstable_createElement('text', rest, children);
}
