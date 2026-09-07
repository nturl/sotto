/**
 * BookTile — a book standing on a shelf (run 8, mockup `.book`): the
 * typographic cover with its peach cutout, the title in the display face,
 * the author, and one mono line that says either where the reader is
 * ("p. 3 of 7") or how long the book takes ("7 MIN").
 *
 * Run 8 changes: the 3px progress track is gone (the mono line replaces it,
 * PLAN decision 5); the coral ribbon marks the one book the reader is
 * currently in (`ribbon`, PLAN decision 6); the desktop grid sizes are
 * retired with DESKTOP.md's grid tiers, so a tile is 120x180 on desktop and
 * 104x156 on phone and nothing else (PLAN decision 1).
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import { useTheme } from './theme';
import { Cover } from './Cover';
import type { LibraryBook } from './data';
import { fonts } from './fonts';
import { useT } from '../i18n/useT';
import { progressLabel } from './progressLabel';
import { useLayoutMetrics } from './Shell';
import { Text } from './Text';
import { webCursor } from './tokens';

export type BookTileProps = {
  book: LibraryBook;
  onPress: (book: LibraryBook) => void;
  /** PLAN decision 6: exactly one book in the app wears the ribbon — the
   * one with the most recent progress that is not finished. */
  ribbon?: boolean;
  /** Optional small caption line beneath the title/author (IMPORT.md §6:
   * "Votre livre" under a private/imported book). Defaults to that caption
   * whenever `book.private` is set; pass an explicit value (or `null`) to
   * override. */
  caption?: string | null;
};

/** Mockup `.book` / `.pmain .book`. */
export const TILE_SIZES = {
  desktop: { width: 120, coverHeight: 180 },
  phone: { width: 104, coverHeight: 156 },
} as const;

export function BookTile({ book, onPress, ribbon = false, caption }: BookTileProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isDesktop } = useLayoutMetrics();
  const [hovered, setHovered] = useState(false);
  const t = useT();
  const size = isDesktop ? TILE_SIZES.desktop : TILE_SIZES.phone;
  const resolvedCaption =
    caption !== undefined ? caption : book.private ? t('import.yourBook') : null;

  const label = progressLabel({ minutes: book.minutes, progress: book.progress });
  const metaLine =
    label.kind === 'page'
      ? t('tile.pageOf', { page: label.page, pages: label.pages })
      : t('book.minutesAbbr', { count: label.minutes });

  return (
    <Pressable
      onPress={() => onPress(book)}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}, ${book.author}`}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.tile, { width: size.width }, webCursor]}
    >
      <Cover
        book={book}
        width={size.width}
        height={size.coverHeight}
        cutout
        cutoutSize={isDesktop && hovered ? 8 : 6}
        accessibilityLabel={book.title}
      />
      {ribbon ? (
        <View style={styles.ribbon} pointerEvents="none">
          <View style={styles.ribbonNotch} />
        </View>
      ) : null}
      <Text role="heading" size={14} style={styles.title} numberOfLines={1}>
        {book.title}
      </Text>
      {/* PLAN decision 13 / DESIGN.md contrast findings: ink-2, never ink-3
          (measured 2.61:1 on canvas — it fails at every size). */}
      <Text role="caption" size={12.5} color="ink2" numberOfLines={1}>
        {book.shortAuthor}
      </Text>
      {resolvedCaption ? (
        <Text role="caption" size={12.5} color="ink2" numberOfLines={1}>
          {resolvedCaption}
        </Text>
      ) : null}
      <Text role="mono" size={11} style={styles.meta} numberOfLines={1}>
        {metaLine}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    tile: {
      gap: 2,
    },
    title: {
      // PLAN decision 13: Fraunces 400 at 14/1.3, ink, one line. The heading
      // role gives the face and the colour; 1.3 is tighter than the role's
      // own line-height, so it is set here.
      fontFamily: fonts.frauncesRegular,
      lineHeight: 18,
      marginTop: 10,
    },
    meta: {
      // PLAN decision 13: mono 11, tracked 0.06em, uppercase, ink-2 (never
      // ink-3 — it fails 4.5:1 at this size on canvas).
      letterSpacing: 11 * 0.06,
      textTransform: 'uppercase',
    },
    // Mockup `.ribbon`: a 12x44 accent strip hooked over the cover's top
    // edge, with a chevron notch at the bottom.
    ribbon: {
      position: 'absolute',
      top: -6,
      right: 14,
      width: 12,
      height: 44,
      backgroundColor: colors.accent,
      zIndex: 2,
    },
    ribbonNotch: {
      position: 'absolute',
      left: 0,
      bottom: -6,
      width: 0,
      height: 0,
      borderLeftWidth: 6,
      borderRightWidth: 6,
      borderBottomWidth: 6,
      borderLeftColor: colors.accent,
      borderRightColor: colors.accent,
      borderBottomColor: 'transparent',
    },
  });
}
