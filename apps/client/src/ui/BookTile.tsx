/**
 * BookTile — cover 110x165 with the peach cutout, Fraunces title, caption
 * author, and a 3px progress track in surface-2 with an accent fill when
 * the book is in progress (DESIGN.md Home/Library rails).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '@sotto/core/theme';
import { Cover } from './Cover';
import type { LibraryBook } from './data';
import { fonts } from './fonts';
import { Text } from './Text';
import { webCursor } from './tokens';

export type BookTileProps = {
  book: LibraryBook;
  onPress: (book: LibraryBook) => void;
};

export function BookTile({ book, onPress }: BookTileProps) {
  return (
    <Pressable
      onPress={() => onPress(book)}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}, ${book.author}`}
      style={[styles.tile, webCursor]}
    >
      <Cover art={book.cover} width={110} height={165} cutout accessibilityLabel={book.title} />
      <Text role="caption" color="ink" style={styles.title} numberOfLines={1}>
        {book.title}
      </Text>
      <Text role="caption" size={12} numberOfLines={1}>
        {book.shortAuthor}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(book.progress * 100)}%` }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 110,
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
