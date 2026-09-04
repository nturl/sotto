/**
 * Cover: flat geometric cover art rendered with the local SVG layer, ported
 * 1:1 from the cover sprite in planning/design/system.html. Cover palettes
 * are artwork (per-category pack palettes, CONTRACTS §2b), not UI chrome —
 * the hex values below belong to the illustrations, matching the reference
 * renders exactly. Radius 2 (radius.sm); optional peach cutout shadow.
 */
import { Image, Platform, StyleSheet, View } from 'react-native';
import { colors, radius } from '@sotto/core/theme';
import { SvgUri } from 'react-native-svg';
import { fonts } from './fonts';
import { Circle, Line, Path, Rect, Svg, SvgText } from './svg';

export type CoverArt =
  | 'fox'
  | 'lantern'
  | 'river'
  | 'mountain'
  | 'dune'
  | 'night'
  | 'market'
  | 'sail';

type CoverDefinition = {
  bg: string;
  title: string;
  titleColor: string;
  titleSize: number;
  art: React.ReactNode;
};

const SERIF = fonts.frauncesLight;

function CoverTitle({ title, color, size }: { title: string; color: string; size: number }) {
  return (
    <SvgText x={75} y={205} textAnchor="middle" fontFamily={SERIF} fontSize={size} fill={color}>
      {title}
    </SvgText>
  );
}

const COVER_ART: Record<CoverArt, CoverDefinition> = {
  fox: {
    bg: '#8C4A2F',
    title: 'Renard',
    titleColor: '#F4ECDF',
    titleSize: 16,
    art: (
      <>
        <Path d="M75 60 L110 130 Q75 155 40 130 Z" fill="#EFCBA0" />
        <Path d="M52 68 L68 92 L40 92 Z" fill="#EFCBA0" />
        <Path d="M98 68 L110 92 L82 92 Z" fill="#EFCBA0" />
        <Circle cx={75} cy={118} r={4} fill="#3B2A1E" />
      </>
    ),
  },
  lantern: {
    bg: '#3B2A2E',
    title: 'Lanterne',
    titleColor: '#F4ECDF',
    titleSize: 16,
    art: (
      <>
        <Line x1={75} y1={40} x2={75} y2={62} stroke="#D9A441" strokeWidth={2} />
        <Rect x={58} y={62} width={34} height={46} rx={4} fill="#D9A441" />
        <Rect x={66} y={108} width={18} height={8} fill="#D9A441" />
        <Circle cx={75} cy={85} r={9} fill="#F4ECDF" />
      </>
    ),
  },
  river: {
    bg: '#2F5A63',
    title: 'Rivière',
    titleColor: '#F4ECDF',
    titleSize: 16,
    art: (
      <>
        <Path d="M0 90 Q40 70 75 90 T150 88 V130 Q110 112 75 130 T0 128 Z" fill="#7FA8AE" />
        <Path d="M0 140 Q40 122 75 140 T150 138 V170 Q110 154 75 170 T0 168 Z" fill="#4C818A" />
        <Circle cx={30} cy={45} r={9} fill="#F4ECDF" />
      </>
    ),
  },
  mountain: {
    bg: '#5B6B73',
    title: 'Col',
    titleColor: '#F4ECDF',
    titleSize: 18,
    art: (
      <>
        <Path d="M0 140 L45 70 L75 108 L100 60 L150 140 Z" fill="#3E4A52" />
        <Path d="M55 140 L85 96 L115 140 Z" fill="#8FA3AA" />
        <Circle cx={85} cy={60} r={8} fill="#E7C9A8" />
      </>
    ),
  },
  dune: {
    bg: '#E7C9A8',
    title: 'Dune',
    titleColor: '#3B2A1E',
    titleSize: 18,
    art: (
      <>
        <Circle cx={112} cy={50} r={18} fill="#D98C4A" />
        <Path d="M0 150 Q40 122 80 150 T150 148 V225 H0 Z" fill="#C9A876" />
        <Path d="M0 178 Q45 158 90 178 T150 176 V225 H0 Z" fill="#B58F5E" />
      </>
    ),
  },
  night: {
    bg: '#2E2A3D',
    title: 'Nuit',
    titleColor: '#F4ECDF',
    titleSize: 17,
    art: (
      <>
        <Circle cx={104} cy={54} r={26} fill="#F2C8B4" />
        <Circle cx={114} cy={45} r={22} fill="#2E2A3D" />
        <Circle cx={28} cy={150} r={2.4} fill="#E7C9A8" />
        <Circle cx={50} cy={118} r={1.8} fill="#F4ECDF" />
        <Circle cx={68} cy={172} r={1.5} fill="#F4ECDF" />
        <Circle cx={22} cy={88} r={1.5} fill="#F4ECDF" />
        <Circle cx={126} cy={150} r={1.6} fill="#F4ECDF" />
      </>
    ),
  },
  market: {
    bg: '#EFDCC0',
    title: 'Marché',
    titleColor: '#3B2A1E',
    titleSize: 17,
    art: (
      <>
        <Path d="M14 70 H62 L56 96 H20 Z" fill="#3F6E5E" />
        <Path d="M70 66 H120 L114 96 H76 Z" fill="#A85C36" />
        <Rect x={20} y={96} width={36} height={34} fill="#D9C6A3" />
        <Rect x={76} y={96} width={38} height={34} fill="#D9C6A3" />
      </>
    ),
  },
  sail: {
    bg: '#24425A',
    title: 'Voilier',
    titleColor: '#F4ECDF',
    titleSize: 16,
    art: (
      <>
        <Rect x={0} y={140} width={150} height={4} fill="#7FA8AE" />
        <Path d="M50 60 L50 140 L95 140 Z" fill="#F4ECDF" />
        <Path d="M20 140 L130 140 L110 160 L40 160 Z" fill="#3B5B6B" />
      </>
    ),
  },
};

export type CoverProps = {
  art: CoverArt;
  width: number;
  height: number;
  /** Peach cutout shadow (DESIGN.md device A). Pass the offset in px. */
  cutout?: boolean;
  cutoutSize?: number;
  /** Optional URL to a real SVG cover. When provided it overrides flat art. */
  svgUrl?: string;
  accessibilityLabel?: string;
};

export function Cover({
  art,
  width,
  height,
  cutout = false,
  cutoutSize = 6,
  svgUrl,
  accessibilityLabel,
}: CoverProps) {
  const definition = COVER_ART[art];
  const label = accessibilityLabel ?? definition.title;
  const shadow = cutout ? (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.cutout,
        { transform: [{ translateX: cutoutSize }, { translateY: cutoutSize }] },
      ]}
    />
  ) : null;

  if (svgUrl) {
    return (
      <View style={{ width, height }} accessible accessibilityRole="image" accessibilityLabel={label}>
        {shadow}
        <View style={styles.face}>
          {Platform.OS === 'web' ? (
            <Image source={{ uri: svgUrl }} style={{ width, height }} resizeMode="contain" />
          ) : (
            <SvgUri uri={svgUrl} width={width} height={height} />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ width, height }} accessible accessibilityRole="image" accessibilityLabel={label}>
      {shadow}
      <View style={[styles.face, { backgroundColor: definition.bg }]}>
        <Svg width={width} height={height} viewBox="0 0 150 225">
          <Rect x={0} y={0} width={150} height={225} fill={definition.bg} />
          {definition.art}
          <CoverTitle title={definition.title} color={definition.titleColor} size={definition.titleSize} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cutout: {
    backgroundColor: colors.peach,
    borderRadius: radius.sm,
  },
  face: {
    flex: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
