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
 * Covers direction B (planning/design/COVERS-DIRECTIONS-SPEC.md) put a
 * hand-drawn cover back on top: a book whose pack carries authored art
 * (`coverInk` set) renders that SVG full-bleed and prints the same three
 * pieces of type — title, author, level stamp — over the solid band the
 * artist left across its bottom 98 of 330 units. The typographic cover
 * below is what a book without authored art still wears (an imported
 * private book, or a pack built before the art landed), so `coverPaper.ts`
 * stays.
 *
 * Colour: the six papers are artwork, not chrome — they carry one colourway
 * in both schemes (see `@sotto/core/theme`'s `paper`), so the ink/canvas
 * text on them comes from the light palette by design. The peach cutout IS
 * chrome and now follows the active scheme through `useTheme()` (run 8
 * RECON risk 2 and risk 10: this file used to import the static light
 * `colors` and never darkened).
 */
import { useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { colors as lightColors, paper, radius } from '@sotto/core/theme';
import { SvgUri } from 'react-native-svg';
import {
  BAND_HEIGHT,
  coverArt,
  coverMark,
  coverPaper,
  paperInk,
  type CoverSource,
} from './coverPaper';
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

/** Narrower than this and the title/author/stamp are smaller than any legible
 * type, so they are dropped rather than printed as smudges (run 8 P1-10). */
const MIN_TYPOGRAPHIC_WIDTH = 72;

export function Cover({
  book,
  width,
  height,
  cutout = false,
  cutoutSize = 6,
  accessibilityLabel,
}: CoverProps) {
  const { colors } = useTheme();
  // Measured so the author line can reserve exactly the stamp's footprint
  // (see the author style below). Declared here, above the no-title early
  // return, to keep the hook order stable.
  const [stampWidth, setStampWidth] = useState(0);
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
  // Below the mockup's smallest cover the type stops being type: at the
  // 32x48 and 44x66 selectors on the vocabulary screen the title would be
  // ~3.5px and the author ~2.1px. Under 72px wide the cover keeps only what
  // still reads — the artwork itself, or the paper, the spine and the one
  // big mark.
  const typographic = width >= MIN_TYPOGRAPHIC_WIDTH;
  const titleSize = px(13);
  const authorSize = px(8);
  const stampSize = px(9);

  const art = coverArt(book);
  if (art.kind === 'authored') {
    // The band is part of the artwork and carries one colourway in both
    // schemes, so its text comes from the light palette by design — the
    // same rule the six papers follow.
    const bandInk = art.ink === 'ink' ? lightColors.ink : lightColors.canvas;
    return (
      <View
        style={{ width, height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
      >
        {shadow}
        <View style={styles.face}>
          {Platform.OS === 'web' ? (
            <Image source={{ uri: art.svgUrl }} style={{ width, height }} resizeMode="cover" />
          ) : (
            <SvgUri uri={art.svgUrl} width={width} height={height} />
          )}
          {typographic ? (
            <View
              pointerEvents="none"
              style={[
                styles.band,
                {
                  height: height * BAND_HEIGHT,
                  paddingHorizontal: px(10),
                  paddingTop: px(4),
                  paddingBottom: px(5),
                },
              ]}
            >
              <Text
                numberOfLines={2}
                ellipsizeMode="tail"
                style={{
                  color: bandInk,
                  fontFamily: fonts.frauncesLight,
                  fontSize: titleSize,
                  lineHeight: Math.round(titleSize * 1.15),
                }}
              >
                {book.title}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  marginTop: px(2),
                  // Clear of the stamp, measured the same way the
                  // typographic cover's author line is.
                  paddingRight: stampWidth > 0 ? stampWidth + px(6) + 2 : px(28),
                  color: bandInk,
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
                onLayout={(event) => setStampWidth(event.nativeEvent.layout.width)}
                style={{
                  position: 'absolute',
                  right: px(6),
                  bottom: px(5),
                  color: bandInk,
                  borderColor: bandInk,
                  borderWidth: 1,
                  borderRadius: radius.sm,
                  paddingHorizontal: px(3),
                  // Tighter than the typographic cover's stamp on purpose:
                  // boxed to the author line's own height, so a two-line
                  // title can never run into its top edge.
                  paddingVertical: 0,
                  fontFamily: fonts.mono,
                  fontSize: stampSize,
                  lineHeight: Math.round(stampSize * 1.15),
                  letterSpacing: stampSize * 0.08,
                }}
              >
                {book.level}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  const paperName = coverPaper(book);
  const ground = paper[paperName];
  const ink = paperInk(paperName) === 'ink' ? lightColors.ink : lightColors.canvas;
  const mark = coverMark(book);

  const markSize = px(mark.kind === 'glyph' ? 44 : 64);

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

        {typographic ? (
          <>
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
                // The clearance for the level stamp is the stamp itself —
                // its measured width plus its own right offset and a 2px
                // gap — not a scaled guess at it. `px(30)` came from the
                // mockup, whose cover is always 120 wide; measured, the
                // stamp is 21px there and 49px on the 280px book-detail
                // cover, so a *constant* 30 would have run the author under
                // the stamp at that size. Until the first layout pass lands
                // the mockup's own value stands in.
                paddingRight: stampWidth > 0 ? stampWidth + px(8) + 2 : px(30),
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
              onLayout={(event) => setStampWidth(event.nativeEvent.layout.width)}
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
          </>
        ) : null}
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
  /**
   * The artwork's own text zone: y 232 to 330 of the 220x330 viewBox, so the
   * type sits on the solid band the artist drew rather than on the scene.
   * Bottom-anchored inside it, like the typographic cover.
   *
   * Its padding is tighter than the typographic cover's 12: the band is only
   * 98 of 330 units, which is ~53px on a 120-wide tile, and a two-line title
   * plus the author line plus the stamp does not fit inside 12 of padding
   * with a 1.2 line-height (verified on the rendered Library grid — the
   * author was pushed out of the cover entirely and the title ran under the
   * stamp). 10/4/5 with a 1.15 title line-height fits with room to spare,
   * and scales with everything else.
   */
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
