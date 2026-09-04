/**
 * Cross-platform SVG layer — thin re-export of `react-native-svg` primitives.
 *
 * Keeping the indirection lets the rest of the UI import from `./svg` so
 * platform special-casing (if ever needed again) lives in one place.
 */
export {
  Svg,
  Path,
  Rect,
  Circle,
  Line,
  Polyline,
  Polygon,
  G,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
