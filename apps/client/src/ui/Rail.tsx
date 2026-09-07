/**
 * Rail — a shelf of books: heading, an optional "See all" text link, and
 * one horizontal row of BookTiles resting on a 1.5px hairline.
 *
 * Run 8 PLAN decision 1: the shelf replaces DESKTOP.md's 3/4-column desktop
 * grid at every width (`useBookGridTier` is retired with it). Desktop
 * covers are 120x180 with a 24px gap, phone 104x156 with 18 — the tile owns
 * those sizes. The shelf line sits 12px under the last caption and runs the
 * full width of the rail, per the mockup's `.shelf`.
 *
 * Migrated off the module-scope `themeColors` proxy onto `useTheme()`
 * (RECON risk 10) — the "See all" link's frozen background interpolation
 * was one of the two sites that comment warned about, and it is gone: the
 * mockup's "See all" is a plain text link with no fill.
 */
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { space } from '@sotto/core/theme';
import { useTheme } from './theme';
import { useT } from '../i18n/useT';
import { BookTile } from './BookTile';
import type { LibraryBook } from './data';
import { pickRibbon, resolveRailView, type RailViewState } from './railView';
import { useLayoutMetrics } from './Shell';
import { Text } from './Text';
import { webCursor } from './tokens';

export { pickRibbon, resolveRailView, type RailViewState };

export type RailProps = {
  title: string;
  books: LibraryBook[];
  onPressBook: (book: LibraryBook) => void;
  onSeeAll?: () => void;
  /** PLAN decision 6: the id of the book the reader is currently in. This
   * rail draws the coral ribbon on it only if it is holding it. */
  ribbonBookId?: string | null;
  /** Run 7 card B, directive 4: when set, an empty `books` array renders a
   * titled empty line (this label) instead of the rail vanishing (`null`).
   * Omit to keep the old "hide when empty" behaviour — e.g. Home's
   * "Resume" rail, which is normal (not an error) when nobody has started
   * a book yet. */
  emptyLabel?: string;
};

/** Mockup `.seeall`: a text link, no pill, 40px of hit height (PLAN
 * decision 14). */
function SeeAllLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={space.sm}
      style={[styles.seeAll, webCursor]}
    >
      <Text role="uiButton" size={14} color="ink2">
        {label}
      </Text>
    </Pressable>
  );
}

export function Rail({ title, books, onPressBook, onSeeAll, ribbonBookId, emptyLabel }: RailProps) {
  const t = useT();
  const { colors } = useTheme();
  const { isDesktop } = useLayoutMetrics();
  const shelfStyles = useMemo(() => createStyles(colors), [colors]);
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

  const ribbonId = pickRibbon(view.books, ribbonBookId);

  return (
    <View style={styles.rail}>
      <View style={styles.header}>
        <Text role="heading">{title}</Text>
        {onSeeAll ? <SeeAllLink label={t('common.seeAll')} onPress={onSeeAll} /> : null}
      </View>
      <View style={shelfStyles.shelf}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.row, { gap: isDesktop ? 24 : 18 }]}
        >
          {view.books.map((book) => (
            <BookTile
              key={book.id}
              book={book}
              onPress={onPressBook}
              ribbon={book.id === ribbonId}
            />
          ))}
        </ScrollView>
      </View>
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
    // The ribbon hangs 6px above the cover's top edge; leave it room rather
    // than letting the scroll view clip it. The trailing tile's 6px peach
    // cutout needs the same on the right.
    paddingTop: 8,
    paddingRight: space.sm,
  },
  seeAll: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    // Mockup `.shelf`: the books stand on a 1.5px hairline that runs the
    // full width of the rail, 12px under the last caption line.
    shelf: {
      paddingBottom: 12,
      borderBottomWidth: 1.5,
      borderBottomColor: colors.hairline2,
    },
  });
}
