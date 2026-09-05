/**
 * Rail — heading + optional "Voir tout" (ui 500 ink-2) + a horizontal
 * scroll of BookTiles on phone/tablet. Section rhythm (32 phone / 48
 * desktop) is applied by screens.
 *
 * Desktop (DESKTOP.md §2/§3, >= 900px): the scroll becomes a grid — 3
 * columns/150x225 covers at 900-1199, 4 columns/160x240 at >= 1200, column
 * gap 20/24, row gap 32 both tiers. A rail with a "Voir tout" escape hatch
 * clips to exactly one row (no vertical overflow, no horizontal scroll);
 * a rail with no escape hatch (Library's unfiltered "all books" rail,
 * which is already the full list) shows everything, unclipped.
 */
import { useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { radius, space } from '@sotto/core/theme';
import { themeColors as colors } from './theme';
import { useT } from '../i18n/useT';
import { usePressAnimation } from './Button';
import { BookTile } from './BookTile';
import type { LibraryBook } from './data';
import { useLayoutMetrics } from './Shell';
import { Text } from './Text';
import { webCursor } from './tokens';

export type RailProps = {
  title: string;
  books: LibraryBook[];
  onPressBook: (book: LibraryBook) => void;
  onSeeAll?: () => void;
};

export type BookGridTier = {
  columns: number;
  coverWidth: number;
  coverHeight: number;
  columnGap: number;
  rowGap: number;
};

/** DESKTOP.md §2/§3 grid tiers, or null below the 900px desktop breakpoint. */
export function useBookGridTier(): BookGridTier | null {
  const { isDesktop, isWideDesktop } = useLayoutMetrics();
  if (!isDesktop) return null;
  return isWideDesktop
    ? { columns: 4, coverWidth: 160, coverHeight: 240, columnGap: 24, rowGap: 32 }
    : { columns: 3, coverWidth: 150, coverHeight: 225, columnGap: 20, rowGap: 32 };
}

function SeeAllLink({ label, onPress }: { label: string; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  const animation = usePressAnimation(hovered);
  const backgroundColor = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surface, colors.surface2],
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={space.sm}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={webCursor}
    >
      <Animated.View style={[styles.seeAll, { backgroundColor }]}>
        <Text role="uiButton" size={13} color="ink2">
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function Rail({ title, books, onPressBook, onSeeAll }: RailProps) {
  const t = useT();
  const grid = useBookGridTier();
  if (books.length === 0) return null;

  const displayBooks = grid && onSeeAll ? books.slice(0, grid.columns) : books;

  return (
    <View style={styles.rail}>
      <View style={styles.header}>
        <Text role="heading">{title}</Text>
        {onSeeAll ? <SeeAllLink label={t('common.seeAll')} onPress={onSeeAll} /> : null}
      </View>
      {grid ? (
        <View style={[styles.grid, { columnGap: grid.columnGap, rowGap: grid.rowGap }]}>
          {displayBooks.map((book) => (
            <BookTile
              key={book.id}
              book={book}
              onPress={onPressBook}
              coverWidth={grid.coverWidth}
              coverHeight={grid.coverHeight}
            />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {books.map((book) => (
            <BookTile key={book.id} book={book} onPress={onPressBook} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    gap: space.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  row: {
    gap: 14,
    paddingBottom: space.xs,
    // Leave room for the tiles' 6px peach cutout on the trailing edge.
    paddingRight: space.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  seeAll: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
});
