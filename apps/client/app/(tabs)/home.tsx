/**
 * Home ("For you") — run 8 PLAN decision 10 order: Continue reading, then
 * Today's story as a spread, then Recommended for {level}, then Your books.
 * "New releases" left Home (the Library carries it), and so did the plan
 * nag, which is now a row in Settings > Account (src/paywall/planRow.ts).
 *
 * The title row's icon buttons are Search and, on desktop only, Settings —
 * on the phone Settings is a tab. The gift button is gone; the daily book is
 * reachable through the spread's own three destinations instead.
 *
 * The section list itself is decided by `resolveHomeSections` so it can be
 * tested without react-native (see `homeSections.ts`).
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { resolvePacksBanner } from '../../src/state/selectors';
import { useT } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { useLibrary, usePreferences, type LibraryBook } from '../../src/ui/data';
import { SearchGlyph, SettingsGlyph } from '../../src/ui/Glyphs';
import { resolveHomeSections } from '../../src/ui/homeSections';
import { IconButton } from '../../src/ui/IconButton';
import { languageNameFor } from '../../src/ui/languages';
import { Rail } from '../../src/ui/Rail';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { TodaysStorySpread } from '../../src/ui/TodaysStorySpread';
import { Toast } from '../../src/ui/Toast';

export default function HomeScreen() {
  const t = useT();
  const router = useRouter();
  const library = useLibrary();
  const preferences = usePreferences();
  const { sectionGap, isDesktop } = useLayoutMetrics();
  const [toast, setToast] = useState<string | null>(null);

  const openBook = (book: LibraryBook) => router.push(`/book/${book.id}`);

  // Run 7 card B, directive 4: loading / error / "no books for this
  // locale+level" must read distinctly instead of the daily card and every
  // rail silently going blank together.
  const banner = resolvePacksBanner(library.packsStatus, library.books.length);

  const daily = library.daily;
  const sections = resolveHomeSections({
    continueReading: library.continueReading.length,
    // `library.daily` is always an object; it is a placeholder with an empty
    // title when the pack has no books (`data.ts`), which is exactly when
    // the spread must not render.
    hasDaily: daily.title.length > 0,
    recommended: library.recommended.length,
    yourBooks: library.yourBooks.length,
  });

  const renderSection = (kind: (typeof sections)[number]) => {
    switch (kind) {
      case 'continue':
        return (
          <Rail
            key={kind}
            title={t('home.rail.continue')}
            books={library.continueReading}
            onPressBook={openBook}
            ribbonBookId={library.currentBookId}
          />
        );
      case 'today':
        return (
          <View key={kind} style={styles.today}>
            <View style={styles.railhead}>
              <Text role="heading">{t('home.dailyEyebrow')}</Text>
              {isDesktop ? (
                <Text role="mono" color="ink2" style={styles.changes}>
                  {t('home.today.changes')}
                </Text>
              ) : null}
            </View>
            <TodaysStorySpread
              book={daily}
              onRead={() => router.push(`/reader/${daily.id}`)}
              // CONTRACTS §6: the reader already starts narration on mount
              // for `?mode=narration` (`app/reader/[bookId].tsx`), so
              // "Listen" needs no reader change.
              onListen={() => router.push(`/reader/${daily.id}?mode=narration`)}
              onAbout={() => openBook(daily)}
            />
          </View>
        );
      case 'recommended':
        return (
          <Rail
            key={kind}
            /* Mockup phone frame line 337 is a plain "Recommended"; the
               desktop frame carries the level. */
            title={
              isDesktop
                ? t('home.rail.recommended', { level: preferences.level })
                : t('home.rail.recommendedPlain')
            }
            books={library.recommended}
            onPressBook={openBook}
            onSeeAll={() => router.push(`/library?level=${preferences.level}`)}
          />
        );
      case 'yourBooks':
        return (
          <Rail
            key={kind}
            title={t('import.library.rail')}
            books={library.yourBooks}
            onPressBook={openBook}
          />
        );
    }
  };

  return (
    <Shell>
      <View style={styles.header}>
        <Text role="display">{t('tabs.home')}</Text>
        <View style={styles.headerActions}>
          <IconButton
            icon={<SearchGlyph size={20} />}
            accessibilityLabel={t('library.a11y.search')}
            onPress={() => router.push('/library/search')}
          />
          {/* Settings is a tab on the phone; the icon button is the desktop
              way in (PLAN decision 10). */}
          {isDesktop ? (
            <IconButton
              icon={<SettingsGlyph size={20} />}
              accessibilityLabel={t('home.settings')}
              onPress={() => router.push('/settings')}
            />
          ) : null}
        </View>
      </View>

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
      ) : (
        <View style={{ gap: sectionGap }}>{sections.map(renderSection)}</View>
      )}

      <Toast message={toast} onHide={() => setToast(null)} />
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
  headerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  banner: {
    gap: space.md,
    alignItems: 'flex-start',
  },
  today: {
    gap: space.md,
  },
  // Mockup `.railhead`: heading left, the mono line right, baseline-aligned.
  railhead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  changes: {
    textTransform: 'uppercase',
  },
});
