/**
 * BookTile — cover with the peach cutout, Fraunces title, caption author,
 * and a 3px progress track in surface-2 with an accent fill when the book
 * is in progress (DESIGN.md Home/Library rails).
 *
 * Phone: fixed 110x165 cover (unchanged). Desktop grids (DESKTOP.md §2/§3)
 * pass a larger `coverWidth`/`coverHeight` (150x225 at 900-1199, 160x240 at
 * >= 1200) so the same component drives both the scroll rail and the grid.
 * Desktop-only hover (120ms via usePressAnimation's reduced-motion
 * handling): cutout grows 6 -> 8px, title darkens ink-2 -> ink. Phone stays
 * exactly as it was (cutout 6, title ink) since it has no hover.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius } from '@sotto/core/theme';
import { useTheme } from './theme';
import { Cover } from './Cover';
import type { LibraryBook } from './data';
import { fonts } from './fonts';
import { useT } from '../i18n/useT';
import { useLayoutMetrics } from './Shell';
import { Text } from './Text';
import { webCursor } from './tokens';

export type BookTileProps = {
  book: LibraryBook;
  onPress: (book: LibraryBook) => void;
  coverWidth?: number;
  coverHeight?: number;
  /** Optional small caption line beneath the title/author (IMPORT.md §6:
   * "Votre livre" under a private/imported book). Wired from the library
   * seam — defaults to that caption whenever `book.private` is set, so
   * every existing BookTile call site (Rail, search, reader
   * recommendations) picks it up without change; pass an explicit value
   * (or `null`) to override. */
  caption?: string | null;
};

export function BookTile({
  book,
  onPress,
  coverWidth = 110,
  coverHeight = 165,
  caption,
}: BookTileProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isDesktop } = useLayoutMetrics();
  const [hovered, setHovered] = useState(false);
  const hoverActive = isDesktop && hovered;
  const t = useT();
  const resolvedCaption =
    caption !== undefined ? caption : book.private ? t('import.yourBook') : null;

  return (
    <Pressable
      onPress={() => onPress(book)}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}, ${book.author}`}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.tile, { width: coverWidth }, webCursor]}
    >
      <Cover
        art={book.cover}
        width={coverWidth}
        height={coverHeight}
        cutout
        cutoutSize={hoverActive ? 8 : 6}
        svgUrl={book.svgUrl}
        accessibilityLabel={book.title}
      />
      <Text
        role="caption"
        color={isDesktop ? (hoverActive ? 'ink' : 'ink2') : 'ink'}
        style={styles.title}
        numberOfLines={1}
      >
        {book.title}
      </Text>
      <Text role="caption" size={12} numberOfLines={1}>
        {book.shortAuthor}
      </Text>
      {resolvedCaption ? (
        <Text role="caption" size={12} color="ink3" numberOfLines={1}>
          {resolvedCaption}
        </Text>
      ) : null}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(book.progress * 100)}%` }]} />
      </View>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    tile: {
      gap: 8,
    },
    title: {
      fontFamily: fonts.frauncesRegular,
      marginTop: 4,
    },
    track: {
      width: '100%',
      height: 3,
      borderRadius: radius.full,
      backgroundColor: colors.surface2,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: radius.full,
    },
  });
}
