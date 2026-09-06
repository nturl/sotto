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
import { resolveRailView, type RailViewState } from './railView';
import { useLayoutMetrics } from './Shell';
import { Text } from './Text';
import { webCursor } from './tokens';

export { resolveRailView, type RailViewState };

export type RailProps = {
  title: string;
  books: LibraryBook[];
  onPressBook: (book: LibraryBook) => void;
  onSeeAll?: () => void;
  /** Run 7 card B, directive 4: when set, an empty `books` array renders a
   * titled empty line (this label) instead of the rail vanishing (`null`).
   * Omit to keep the old "hide when empty" behaviour — e.g. Home's
   * "Resume" rail, which is normal (not an error) when nobody has started
   * a book yet. */
  emptyLabel?: string;
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

export function Rail({ title, books, onPressBook, onSeeAll, emptyLabel }: RailProps) {
  const t = useT();
  const grid = useBookGridTier();
  const view = resolveRailView(books, emptyLabel);
  if (view.kind === 'hidden') return null;

  if (view.kind === 'empty') {
    return (
      <View style={styles.rail}>
        <View style={styles.header}>
          <Text role="heading">{title}</Text>
        </View>
        <Text role="caption" color="ink2">
          {view.label}
        </Text>
      </View>
    );
  }

  const displayBooks = grid && onSeeAll ? view.books.slice(0, grid.columns) : view.books;

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
          {displayBooks.map((book) => (
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
