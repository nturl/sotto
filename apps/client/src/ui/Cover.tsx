/**
 * Cover — the typographic cover system (run 8, APP-V2-SPEC "Cover system",
 * PLAN decisions 2-4). A cover is now built from the book's own metadata
 * with plain `View`/`Text`: one of six paper grounds picked from the book's
 * primary collection, a 3px darker spine strip down the left edge, one
 * large mark (the title's initial, or a glyph for one book in three), the
 * title in the display face, the author in tracked small caps, and the
 * level printed as a mono stamp bottom-right. Every size scales by
 * `width / 120`, the desktop tile width.
 *
 * This replaced eight flat SVG illustrations hashed off the bookId, and the
 * `art` prop that selected between them. `svgUrl` survives as the fallback
 * for a book with no title (the library seam's placeholder), which is the
 * only case where there is nothing to set.
 *
 * Colour: the six papers are artwork, not chrome — they carry one colourway
 * in both schemes (see `@sotto/core/theme`'s `paper`), so the ink/canvas
 * text on them comes from the light palette by design. The peach cutout IS
 * chrome and now follows the active scheme through `useTheme()` (run 8
 * RECON risk 2 and risk 10: this file used to import the static light
 * `colors` and never darkened).
 */
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { colors as lightColors, paper, radius } from '@sotto/core/theme';
import { SvgUri } from 'react-native-svg';
import { coverMark, coverPaper, paperInk, type CoverSource } from './coverPaper';
import { fonts } from './fonts';
import { useTheme } from './theme/ThemeProvider';

export type { CoverSource } from './coverPaper';

export type CoverProps = {
  book: CoverSource;
  width: number;
  height: number;
  /** Peach cutout shadow (DESIGN.md device A). Pass the offset in px. */
  cutout?: boolean;
  cutoutSize?: number;
  accessibilityLabel?: string;
};

/** The mockup's `.cv` is drawn at 120x180; everything scales from there. */
const BASE_WIDTH = 120;

export function Cover({
  book,
  width,
  height,
  cutout = false,
  cutoutSize = 6,
  accessibilityLabel,
}: CoverProps) {
  const { colors } = useTheme();
  const label = accessibilityLabel ?? book.title;
  const shadow = cutout ? (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.cutout,
        {
          backgroundColor: colors.peach,
          transform: [{ translateX: cutoutSize }, { translateY: cutoutSize }],
        },
      ]}
    />
  ) : null;

  // A book with no title has nothing to set — fall back to the pack's own
  // cover asset if there is one (the placeholder book has neither).
  if (!book.title.trim()) {
    return (
      <View
        style={{ width, height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
      >
        {shadow}
        <View style={[styles.face, { backgroundColor: paper.sand }]}>
          {book.svgUrl ? (
            Platform.OS === 'web' ? (
              <Image source={{ uri: book.svgUrl }} style={{ width, height }} resizeMode="contain" />
            ) : (
              <SvgUri uri={book.svgUrl} width={width} height={height} />
            )
          ) : null}
        </View>
      </View>
    );
  }

  const scale = width / BASE_WIDTH;
  const px = (value: number) => value * scale;
  const paperName = coverPaper(book);
  const ground = paper[paperName];
  const ink = paperInk(paperName) === 'ink' ? lightColors.ink : lightColors.canvas;
  const mark = coverMark(book);

  const markSize = px(mark.kind === 'glyph' ? 44 : 64);
  const titleSize = px(13);
  const authorSize = px(8);
  const stampSize = px(9);

  return (
    <View style={{ width, height }} accessible accessibilityRole="image" accessibilityLabel={label}>
      {shadow}
      <View style={[styles.face, styles.paper, { backgroundColor: ground, padding: px(12) }]}>
        <View style={[styles.spine, { width: px(3) }]} pointerEvents="none" />

        <Text
          style={{
            position: 'absolute',
            top: px(mark.kind === 'glyph' ? 22 : 16),
            left: px(15),
            right: px(12),
            color: ink,
            fontFamily: fonts.frauncesLight,
            fontSize: markSize,
            lineHeight: markSize,
            letterSpacing: markSize * -0.04,
          }}
          numberOfLines={1}
        >
          {mark.text}
        </Text>

        <Text
          numberOfLines={3}
          style={{
            marginLeft: px(3),
            paddingRight: px(6),
            color: ink,
            fontFamily: fonts.frauncesLight,
            fontSize: titleSize,
            lineHeight: Math.round(titleSize * 1.2),
          }}
        >
          {book.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            marginLeft: px(3),
            marginTop: px(6),
            paddingRight: px(30),
            color: ink,
            fontFamily: fonts.interRegular,
            fontSize: authorSize,
            lineHeight: Math.round(authorSize * 1.3),
            letterSpacing: authorSize * 0.14,
            textTransform: 'uppercase',
          }}
        >
          {book.author}
        </Text>

        <Text
          style={{
            position: 'absolute',
            right: px(8),
            bottom: px(8),
            color: ink,
            borderColor: ink,
            borderWidth: 1,
            borderRadius: radius.sm,
            paddingHorizontal: px(4),
            paddingVertical: px(3),
            fontFamily: fonts.mono,
            fontSize: stampSize,
            lineHeight: stampSize,
            letterSpacing: stampSize * 0.08,
          }}
        >
          {book.level}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cutout: {
    borderRadius: radius.sm,
  },
  face: {
    flex: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  paper: {
    justifyContent: 'flex-end',
  },
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    // Artwork, like the papers: a darker edge of the same board, not a
    // chrome hairline, so it is the same in both schemes.
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
});
