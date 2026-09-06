import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BOOK_LEVELS } from '@sotto/core';
import { space } from '@sotto/core/theme';
import { isFilterEmpty, resolvePacksBanner } from '../../src/state/selectors';
import { useT } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { Chip } from '../../src/ui/Chip';
import { useLibrary, usePreferences, type LibraryBook } from '../../src/ui/data';
import type { BookCategory, BookLevel } from '../../src/ui/dev/fixtures';
import { PlusGlyph, SearchGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { languageNameFor } from '../../src/ui/languages';
import { Rail } from '../../src/ui/Rail';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { fetchHealth } from '../../src/state/contentApi';

type Filter = 'all' | BookCategory | BookLevel;
const LEVELS: BookLevel[] = [...BOOK_LEVELS];
const VALID_FILTERS = new Set<string>(['all', 'fables', 'voyage', ...LEVELS]);

function isValidFilter(value: unknown): value is Filter {
  return typeof value === 'string' && VALID_FILTERS.has(value);
}

export default function LibraryScreen() {
  const t = useT();
  const router = useRouter();
  const library = useLibrary();
  const preferences = usePreferences();
  const { sectionGap, isDesktop } = useLayoutMetrics();
  // Run 7 card B, directive 6: the recon found this filter chip reset to
  // 'all' on every remount (a plain useState, nothing persisted it) — a
  // refresh, back-navigation, or direct link all silently dropped the
  // learner's chosen category/level. Reading/writing it as the `filter`
  // URL param instead makes it survive all three the same way `bookId`
  // already does on the reader/book-detail routes.
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const filter: Filter = isValidFilter(filterParam) ? filterParam : 'all';
  const setFilter = (next: Filter) =>
    router.setParams({ filter: next === 'all' ? undefined : next });
  // R3-I: free-tier import needs apps/server reachable (local LLM/TTS/STT).
  // No CloudAdapter exists in this OSS-only build, so "no cloud adapter" is
  // always true here — the health check alone decides visibility.
  const [serverReachable, setServerReachable] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    void fetchHealth().then((h) => setServerReachable(!!h?.ok));
  }, []);

  const openBook = (book: LibraryBook) => router.push(`/book/${book.id}`);

  const rails = useMemo<Array<{ title: string; books: LibraryBook[]; seeAll?: Filter }>>(() => {
    if (filter === 'fables' || filter === 'voyage') {
      const title = filter === 'fables' ? t('library.rail.fables') : t('library.rail.voyage');
      return [{ title, books: library.byCategory(filter) }];
    }
    if (LEVELS.includes(filter as BookLevel)) {
      return [{ title: filter, books: library.byLevel(filter as BookLevel) }];
    }
    const base = [
      {
        title: t('library.rail.fables'),
        books: library.byCategory('fables'),
        seeAll: 'fables' as Filter,
      },
      {
        title: t('library.rail.voyage'),
        books: library.byCategory('voyage'),
        seeAll: 'voyage' as Filter,
      },
      { title: t('library.rail.all'), books: library.books },
    ];
    return library.yourBooks.length > 0
      ? [{ title: t('import.library.rail'), books: library.yourBooks }, ...base]
      : base;
  }, [filter, library, t]);

  const filters: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: t('library.filter.all') },
    { value: 'fables', label: t('library.filter.fables') },
    { value: 'voyage', label: t('library.filter.voyage') },
    ...LEVELS.map((level) => ({ value: level as Filter, label: level })),
  ];

  // Run 7 card B, directive 4: distinguish loading / error / "no books for
  // this locale+level" (packs-wide) from "this filter chip has zero
  // results" (filter-scoped) — previously both looked identical to a
  // permanently blank rail set.
  const banner = resolvePacksBanner(library.packsStatus, library.books.length);
  const filterEmpty = banner.kind === 'none' && filter !== 'all' && isFilterEmpty(rails);

  return (
    <Shell>
      <View style={styles.header}>
        <Text role="display">{t('tabs.library')}</Text>
        <View style={styles.headerIcons}>
          {serverReachable ? (
            <IconButton
              icon={<PlusGlyph size={20} />}
              accessibilityLabel={t('import.library.button')}
              onPress={() => router.push('/import')}
            />
          ) : null}
          <IconButton
            icon={<SearchGlyph size={20} />}
            accessibilityLabel={t('library.a11y.search')}
            onPress={() => router.push('/library/search')}
          />
        </View>
      </View>
      {serverReachable === false ? (
        <Text role="caption" color="ink3" style={styles.offlineCaption}>
          {t('import.library.captionOffline')}
        </Text>
      ) : null}

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

      {banner.kind === 'loading' ? (
        <Text role="caption" color="ink2">
          {t('packs.status.loading')}
        </Text>
      ) : banner.kind === 'error' ? (
        <View style={styles.banner}>
          <Text role="caption" color="ink2">
            {t('packs.status.error')}
          </Text>
          <Button
            variant="secondary"
            title={t('packs.status.retry')}
            onPress={library.retryPacks}
          />
        </View>
      ) : banner.kind === 'emptyLevel' ? (
        <View style={styles.banner}>
          <Text role="caption" color="ink2">
            {t('packs.status.emptyLevel', {
              language: languageNameFor(preferences.learningLocale),
              level: preferences.level,
            })}
          </Text>
          <Button
            variant="secondary"
            title={t('packs.status.changeLevel')}
            onPress={() => router.push('/settings/learning-language')}
          />
        </View>
      ) : filterEmpty ? (
        <View style={styles.banner}>
          <Text role="caption" color="ink2">
            {t('packs.status.emptyFilter')}
          </Text>
          <Button
            variant="secondary"
            title={t('packs.status.clearFilters')}
            onPress={() => setFilter('all')}
          />
        </View>
      ) : (
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
      )}
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
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  offlineCaption: {
    marginTop: -space.sm,
    marginBottom: space.lg,
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
  banner: {
    gap: space.md,
    alignItems: 'flex-start',
  },
});
