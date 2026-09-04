/**
 * Rail — heading + optional "Voir tout" (ui 500 ink-2) + horizontal scroll
 * of BookTiles. Section rhythm (32 phone / 48 desktop) is applied by screens.
 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { space } from '@sotto/core/theme';
import { useT } from '../i18n/useT';
import { BookTile } from './BookTile';
import type { LibraryBook } from './data';
import { Text } from './Text';
import { webCursor } from './tokens';

export type RailProps = {
  title: string;
  books: LibraryBook[];
  onPressBook: (book: LibraryBook) => void;
  onSeeAll?: () => void;
};

export function Rail({ title, books, onPressBook, onSeeAll }: RailProps) {
  const t = useT();
  if (books.length === 0) return null;
  return (
    <View style={styles.rail}>
      <View style={styles.header}>
        <Text role="heading">{title}</Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={space.sm} style={webCursor}>
            <Text role="uiButton" size={13} color="ink2">
              {t('common.seeAll')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {books.map((book) => (
          <BookTile key={book.id} book={book} onPress={onPressBook} />
        ))}
      </ScrollView>
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
});
