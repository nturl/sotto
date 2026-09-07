import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { BookTile } from '../../src/ui/BookTile';
import { Cover } from '../../src/ui/Cover';
import { useLibrary, type LibraryBook } from '../../src/ui/data';
import { fonts } from '../../src/ui/fonts';
import { SearchGlyph } from '../../src/ui/Glyphs';
import { useBookGridTier } from '../../src/ui/Rail';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';

function ResultRow({ book, onPress }: { book: LibraryBook; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}, ${book.author}`}
      style={[styles.resultRow, webCursor]}
    >
      <Cover
        book={book}
        width={56}
        height={84}
        cutout
        cutoutSize={3}
        accessibilityLabel={book.title}
      />
      <View style={styles.resultText}>
        <Text role="ui" size={15} style={styles.resultTitle} numberOfLines={1}>
          {book.title}
        </Text>
        <Text role="caption" numberOfLines={1}>
          {book.author}
        </Text>
      </View>
      <Text role="caption" color="ink3">
        {book.level}
      </Text>
    </Pressable>
  );
}

export default function LibrarySearchScreen() {
  const t = useT();
  const router = useRouter();
  const library = useLibrary();
  const { isDesktop } = useLayoutMetrics();
  const grid = useBookGridTier();
  const [query, setQuery] = useState('');
  const results = library.search(query);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const openBook = (book: LibraryBook) => router.push(`/book/${book.id}`);

  return (
    <Shell>
      <BackLink />
      <View style={[styles.inputRow, isDesktop && styles.inputRowDesktop]}>
        <SearchGlyph size={16} color={colors.ink2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('library.searchPlaceholder')}
          placeholderTextColor={colors.ink3}
          autoFocus
          accessibilityLabel={t('library.searchPlaceholder')}
          style={styles.input}
        />
      </View>

      {results.length === 0 ? (
        <Text role="caption" color="ink3" style={styles.empty}>
          {t('library.noResults', { query })}
        </Text>
      ) : grid ? (
        // DESKTOP.md §3: search results are the same grid as Library, not a
        // list — keeps the grid affordance consistent between the two.
        <View style={[styles.grid, { columnGap: grid.columnGap, rowGap: grid.rowGap }]}>
          {results.map((book) => (
            <BookTile
              key={book.id}
              book={book}
              onPress={openBook}
              coverWidth={grid.coverWidth}
              coverHeight={grid.coverHeight}
            />
          ))}
        </View>
      ) : (
        <View>
          {results.map((book) => (
            <ResultRow key={book.id} book={book} onPress={() => openBook(book)} />
          ))}
        </View>
      )}
    </Shell>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginTop: space.lg,
      marginBottom: space.xl,
      minHeight: space.tapTarget,
    },
    // DESKTOP.md §3: 480px wide, left-aligned under the title (not stretched
    // to the content region's full width).
    inputRowDesktop: {
      width: 480,
      alignSelf: 'flex-start',
    },
    input: {
      flex: 1,
      fontFamily: fonts.interRegular,
      fontSize: 15,
      color: colors.ink,
      padding: 0,
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      minHeight: space.tapTarget,
    },
    resultText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    resultTitle: {
      fontFamily: fonts.interMedium,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    empty: {
      textAlign: 'center',
      marginTop: space.xxxl,
    },
  });
}
