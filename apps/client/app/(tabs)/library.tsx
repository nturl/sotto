/**
 * Library — mockup frame 2 (desktop) and phone 2.
 *
 * Run 8: run 7's single flat chip row (collections and levels sharing one
 * mutually-exclusive list) is replaced by the two controls the mockup draws
 * — one hairline-segmented level scale and a row of plain collection links —
 * plus an inline search field where the search icon button used to be. No
 * pills anywhere. The URL grammar and the rail composition live in
 * `src/ui/libraryFilters.ts` (RN-free, tested); this file is the rendering.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { radius, space } from '@sotto/core/theme';
import { isFilterEmpty, resolvePacksBanner } from '../../src/state/selectors';
import { useT, type MessageKey } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { useLibrary, usePreferences, type LibraryBook } from '../../src/ui/data';
import { fonts } from '../../src/ui/fonts';
import { PlusGlyph, SearchGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { languageNameFor } from '../../src/ui/languages';
import { LevelScale } from '../../src/ui/LevelScale';
import {
  composeRails,
  CORE_CATEGORIES,
  LEVELS,
  parseLibraryParams,
  paramsNeedRewrite,
  serializeLibraryParams,
  type Collection,
  type LibraryFilters,
} from '../../src/ui/libraryFilters';
import { Rail } from '../../src/ui/Rail';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';
import { fetchHealth } from '../../src/state/contentApi';

/** Collection link labels. `fables` and `adventure` reuse the run-7 keys
 * that already say exactly "Fables" and "Travel" in all nine catalogs
 * (COMMON.md: reuse a key that already says the same thing); the other five
 * are new `library.collection.*` keys. */
const COLLECTION_LABEL: Record<Collection, MessageKey> = {
  all: 'library.collection.everything',
  tales: 'library.collection.tales',
  fables: 'library.filter.fables',
  adventure: 'library.filter.voyage',
  classics: 'library.collection.classics',
  folk: 'library.collection.folk',
  idioms: 'library.collection.idioms',
  daily: 'library.collection.daily',
  yours: 'import.library.rail',
};

/** Shelf headings. Two categories have a longer authored rail title than
 * their link label ("Animal fables", "Travel"); the rest reuse the link
 * label, and `all`/`yours` keep their run-7 headings. */
const RAIL_TITLE: Record<Collection | 'results', MessageKey> = {
  ...COLLECTION_LABEL,
  all: 'library.rail.all',
  fables: 'library.rail.fables',
  adventure: 'library.rail.voyage',
  results: 'library.rail.results',
};

/** The canonical Library URL for a filter state. Expo Router's `params`
 * object drops nothing, so the defaults are left out of it entirely rather
 * than written as `filter=all`. */
function libraryHref(filters: LibraryFilters) {
  const { filter, level } = serializeLibraryParams(filters);
  const params: Record<string, string> = {};
  if (filter) params.filter = filter;
  if (level) params.level = level;
  return { pathname: '/library' as const, params };
}

/** Mockup `.coll a` / `.coll a.on`: a plain text link, ink-2, with a 1.5px
 * inset underline when active. 40px of hit height (PLAN decision 14). */
function CollectionLink({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      // react-native-web 0.21 no longer maps `accessibilityState` to
      // `aria-*`; the aria prop is the one that reaches the DOM. Both are
      // set so native keeps its own state too.
      aria-selected={active}
      accessibilityState={{ selected: active }}
      style={[
        styles.collLink,
        active ? { borderBottomWidth: 1.5, borderBottomColor: colors.ink } : null,
        webCursor,
      ]}
    >
      <Text role="ui" size={14} color={active ? 'ink' : 'ink2'}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const t = useT();
  const router = useRouter();
  const library = useLibrary();
  const preferences = usePreferences();
  const { sectionGap, isDesktop } = useLayoutMetrics();
  const { colors } = useTheme();
  const themed = useMemo(() => createStyles(colors), [colors]);

  // Run 7 card B, directive 6: the filter used to be plain component state,
  // so a refresh, a back-navigation or a direct link all silently dropped
  // it. It lives in the URL instead. Run 8 splits it in two — `?filter=`
  // for the collection, `?level=` for the level scale — and reads run 7's
  // legacy spellings (PLAN decision 9).
  const { filter: filterParam, level: levelParam } = useLocalSearchParams<{
    filter?: string;
    level?: string;
  }>();
  const filters: LibraryFilters = useMemo(
    () => parseLibraryParams({ filter: filterParam, level: levelParam }),
    [filterParam, levelParam],
  );
  useEffect(() => {
    // A legacy or invalid URL is rewritten to its canonical spelling, so the
    // address bar always shows the state the screen is actually in. It is a
    // `replace`, not a `setParams`: canonicalising a link the learner
    // followed must not leave the legacy spelling sitting in history for the
    // back button to return to.
    if (paramsNeedRewrite({ filter: filterParam, level: levelParam }, filters)) {
      router.replace(libraryHref(filters));
    }
  }, [filterParam, levelParam, filters, router]);

  // Run 7's mechanism, kept: the filter state is the URL, so it survives a
  // reload, a direct link, and leaving the screen and coming back.
  //
  // MEASURED LIMIT (lane C report): on web this — and `router.push` of the
  // same route with new params, which was tried and behaves identically —
  // updates the address bar without adding a history entry
  // (`history.length` stays put), so the back button does not step back
  // through successive filter changes; it leaves Library. Undoing a filter
  // is the "Everything"/"All" segment, not the browser's back button.
  const setFilters = (next: LibraryFilters) => router.setParams(serializeLibraryParams(next));
  const setCollection = (collection: Collection) => setFilters({ ...filters, collection });
  const setLevel = (level: LibraryFilters['level']) => setFilters({ ...filters, level });

  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();

  // R3-I: free-tier import needs apps/server reachable (local LLM/TTS/STT).
  // No CloudAdapter exists in this OSS-only build, so "no cloud adapter" is
  // always true here — the health check alone decides visibility.
  const [serverReachable, setServerReachable] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    void fetchHealth().then((h) => setServerReachable(!!h?.ok));
  }, []);

  const openBook = (book: LibraryBook) => router.push(`/book/${book.id}`);

  const rails = useMemo(() => {
    if (trimmedQuery) {
      return [{ key: 'results' as const, books: library.search(trimmedQuery), seeAll: undefined }];
    }
    return composeRails({ books: library.books, yourBooks: library.yourBooks, filters });
  }, [filters, library, trimmedQuery]);

  /** Only collections that actually have a book in this locale get a link,
   * plus "Your books" once something has been imported. */
  const collections: Collection[] = useMemo(() => {
    const present = CORE_CATEGORIES.filter((category) =>
      library.books.some((b) => b.categories.includes(category)),
    );
    return [
      'all',
      ...present,
      ...(library.yourBooks.length > 0 ? (['yours'] as Collection[]) : []),
    ];
  }, [library]);

  // Run 7 card B, directive 4: distinguish loading / error / "no books for
  // this locale+level" (packs-wide) from "these filters have zero results"
  // (filter-scoped) — previously both looked identical to a permanently
  // blank rail set.
  const banner = resolvePacksBanner(library.packsStatus, library.books.length);
  const hasFilters = filters.collection !== 'all' || filters.level !== undefined;
  const filterEmpty = banner.kind === 'none' && !trimmedQuery && hasFilters && isFilterEmpty(rails);

  const searchField = (
    <View style={[themed.search, isDesktop ? styles.searchDesktop : styles.searchPhone]}>
      <SearchGlyph size={16} color={colors.ink2} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('library.searchPlaceholder')}
        placeholderTextColor={colors.ink2}
        accessibilityLabel={t('library.a11y.search')}
        style={themed.searchInput}
      />
    </View>
  );

  const levelScale = (
    <LevelScale
      levels={LEVELS}
      value={filters.level}
      onChange={setLevel}
      allLabel={t('library.filter.all')}
      groupLabel={t('library.a11y.level')}
      compact={!isDesktop}
    />
  );

  const collectionLinks = collections.map((collection) => (
    <CollectionLink
      key={collection}
      label={t(COLLECTION_LABEL[collection])}
      active={filters.collection === collection}
      onPress={() => setCollection(collection)}
    />
  ));

  const bookCount = t('library.count', { n: library.books.length });

  return (
    <Shell>
      <View style={styles.header}>
        <Text role="display">{t('tabs.library')}</Text>
        <View style={styles.headerRight}>
          {/* Mockup `.titlerow .meta`: the language is dropped on the phone,
              where the row has no room for it. */}
          <Text role="mono">
            {isDesktop
              ? `${languageNameFor(preferences.learningLocale)} · ${bookCount}`
              : bookCount}
          </Text>
          {serverReachable ? (
            <IconButton
              icon={<PlusGlyph size={20} />}
              accessibilityLabel={t('import.library.button')}
              onPress={() => router.push('/import')}
            />
          ) : null}
        </View>
      </View>
      {serverReachable === false ? (
        <Text role="caption" color="ink3" style={styles.offlineCaption}>
          {t('import.library.captionOffline')}
        </Text>
      ) : null}

      {isDesktop ? (
        // Mockup `.controls`: one wrapping row, gap 28, the search field
        // pushed to the right edge by `margin-left:auto`.
        <View style={styles.controls}>
          {levelScale}
          <View style={styles.coll}>{collectionLinks}</View>
          {searchField}
        </View>
      ) : (
        <View>
          {searchField}
          {/* R-adversarial finding 4 (run 7): with the style on the
              ScrollView itself, RN Web gave this row no height cap at all
              and it rendered at 342px instead of 36. Rail.tsx's own
              horizontal ScrollView is the working reference — the style
              goes on the outer View and the content container, never on
              the ScrollView. */}
          <View style={styles.scaleRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollRowContent}
            >
              {levelScale}
            </ScrollView>
          </View>
          <View style={styles.collRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.scrollRowContent, styles.collContent]}
            >
              {collectionLinks}
            </ScrollView>
          </View>
        </View>
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
      ) : trimmedQuery && rails[0]?.books.length === 0 ? (
        <Text role="caption" color="ink3" style={styles.noResults}>
          {t('library.noResults', { query: trimmedQuery })}
        </Text>
      ) : filterEmpty ? (
        <View style={styles.banner}>
          <Text role="caption" color="ink2">
            {t('packs.status.emptyFilter')}
          </Text>
          <Button
            variant="secondary"
            title={t('packs.status.clearFilters')}
            onPress={() => setFilters({ collection: 'all', level: undefined })}
          />
        </View>
      ) : (
        <View style={[styles.rails, { gap: sectionGap }]}>
          {rails.map((rail) => (
            <Rail
              key={rail.key}
              title={t(RAIL_TITLE[rail.key])}
              books={rail.books}
              onPressBook={openBook}
              ribbonBookId={library.currentBookId}
              onSeeAll={rail.seeAll ? () => setCollection(rail.seeAll as Collection) : undefined}
            />
          ))}
        </View>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
  // Mockup `.titlerow`: display left, mono meta right, 28 below.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: space.xl,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  offlineCaption: {
    marginTop: -space.sm,
    marginBottom: space.lg,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 28,
    marginBottom: space.sm,
  },
  coll: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 18,
  },
  collLink: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  searchDesktop: {
    width: 240,
    marginLeft: 'auto',
  },
  searchPhone: {
    marginBottom: 14,
  },
  scaleRow: {
    marginBottom: 14,
  },
  collRow: {
    marginBottom: space.sm,
  },
  scrollRowContent: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    paddingRight: space.gutter.phone,
  },
  collContent: {
    gap: 18,
  },
  banner: {
    gap: space.md,
    alignItems: 'flex-start',
  },
  noResults: {
    textAlign: 'center',
    marginTop: space.xxxl,
  },
  rails: {
    marginTop: 28,
  },
});

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    // Mockup `.search`: surface-2, radius 10, 9/12 padding, glyph + field.
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingVertical: 9,
      paddingHorizontal: 12,
      minHeight: 40,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.interRegular,
      fontSize: 14,
      color: colors.ink,
      padding: 0,
    },
  });
}
