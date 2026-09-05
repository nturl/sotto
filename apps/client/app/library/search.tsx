import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Cover } from '../../src/ui/Cover';
import { useLibrary, type LibraryBook } from '../../src/ui/data';
import { fonts } from '../../src/ui/fonts';
import { SearchGlyph } from '../../src/ui/Glyphs';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { webCursor } from '../../src/ui/tokens';

function ResultRow({ book, onPress }: { book: LibraryBook; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}, ${book.author}`}
      style={[styles.resultRow, webCursor]}
    >
      <Cover
        art={book.cover}
        width={56}
        height={84}
        cutout
        cutoutSize={3}
        svgUrl={book.svgUrl}
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
  const [query, setQuery] = useState('');
  const results = library.search(query);

  return (
    <Shell>
      <BackLink />
      <View style={styles.inputRow}>
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
      ) : (
        <View>
          {results.map((book) => (
            <ResultRow key={book.id} book={book} onPress={() => router.push(`/book/${book.id}`)} />
          ))}
        </View>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
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
  empty: {
    textAlign: 'center',
    marginTop: space.xxxl,
  },
});
