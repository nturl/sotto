import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { Chip } from '../../src/ui/Chip';
import { useLibrary, type LibraryBook } from '../../src/ui/data';
import type { BookCategory, BookLevel } from '../../src/ui/dev/fixtures';
import { SearchGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { Rail } from '../../src/ui/Rail';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';

type Filter = 'all' | BookCategory | BookLevel;
const LEVELS: BookLevel[] = ['A0', 'A1', 'A2'];

export default function LibraryScreen() {
  const t = useT();
  const router = useRouter();
  const library = useLibrary();
  const { sectionGap, isDesktop } = useLayoutMetrics();
  const [filter, setFilter] = useState<Filter>('all');

  const openBook = (book: LibraryBook) => router.push(`/book/${book.id}`);

  const rails = useMemo<Array<{ title: string; books: LibraryBook[]; seeAll?: Filter }>>(() => {
    if (filter === 'fables' || filter === 'voyage') {
      const title = filter === 'fables' ? t('library.rail.fables') : t('library.rail.voyage');
      return [{ title, books: library.byCategory(filter) }];
    }
    if (LEVELS.includes(filter as BookLevel)) {
      return [{ title: filter, books: library.byLevel(filter as BookLevel) }];
    }
    return [
      { title: t('library.rail.fables'), books: library.byCategory('fables'), seeAll: 'fables' },
      { title: t('library.rail.voyage'), books: library.byCategory('voyage'), seeAll: 'voyage' },
      { title: t('library.rail.all'), books: library.books },
    ];
  }, [filter, library, t]);

  const filters: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: t('library.filter.all') },
    { value: 'fables', label: t('library.filter.fables') },
    { value: 'voyage', label: t('library.filter.voyage') },
    ...LEVELS.map((level) => ({ value: level as Filter, label: level })),
  ];

  return (
    <Shell>
      <View style={styles.header}>
        <Text role="display">{t('tabs.library')}</Text>
        <IconButton
          icon={<SearchGlyph size={20} />}
          accessibilityLabel={t('library.a11y.search')}
          onPress={() => router.push('/library/search')}
        />
      </View>

      {isDesktop ? (
        // DESKTOP.md §3: chips never scroll horizontally on desktop — wrap
        // to a second line instead.
        <View style={[styles.chips, styles.chipsWrap]}>
          {filters.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              selected={filter === item.value}
              onPress={() => setFilter(item.value)}
            />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
        >
          {filters.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              selected={filter === item.value}
              onPress={() => setFilter(item.value)}
            />
          ))}
        </ScrollView>
      )}

      <View style={{ gap: sectionGap }}>
        {rails.map((rail) => (
          <Rail
            key={rail.title}
            title={rail.title}
            books={rail.books}
            onPressBook={openBook}
            onSeeAll={rail.seeAll ? () => setFilter(rail.seeAll ?? 'all') : undefined}
          />
        ))}
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.gutter.phone,
  },
  chips: {
    marginBottom: space.xl,
  },
  chipsContent: {
    gap: space.sm,
    paddingRight: space.gutter.phone,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
});
