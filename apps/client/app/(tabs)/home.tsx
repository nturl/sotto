import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { resolvePacksBanner } from '../../src/state/selectors';
import { useT } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { DailyStoryCard } from '../../src/ui/DailyStoryCard';
import { useLibrary, usePreferences, type LibraryBook } from '../../src/ui/data';
import { GiftGlyph, SettingsGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { languageNameFor } from '../../src/ui/languages';
import { PaywallNagRow } from '../../src/ui/PaywallNagRow';
import { Rail } from '../../src/ui/Rail';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { Toast } from '../../src/ui/Toast';

export default function HomeScreen() {
  const t = useT();
  const router = useRouter();
  const library = useLibrary();
  const preferences = usePreferences();
  const { sectionGap, isDesktop } = useLayoutMetrics();
  const [toast, setToast] = useState<string | null>(null);

  const openBook = (book: LibraryBook) => router.push(`/book/${book.id}`);
  // DESKTOP.md §2: "Voir tout" is a desktop-only addition to Home's
  // rails (DESIGN.md phone spec has none); it opens the Library tab.
  const seeAll = isDesktop ? () => router.push('/library') : undefined;

  // Run 7 card B, directive 4: loading / error / "no books for this
  // locale+level" must read distinctly instead of the daily card and every
  // rail silently going blank together.
  const banner = resolvePacksBanner(library.packsStatus, library.books.length);

  return (
    <Shell>
      <View style={styles.header}>
        <Text role="display">{t('tabs.home')}</Text>
        <View style={styles.headerActions}>
          <IconButton
            icon={<SettingsGlyph size={20} />}
            accessibilityLabel={t('home.settings')}
            onPress={() => router.push('/settings')}
          />
          <IconButton
            icon={<GiftGlyph size={20} />}
            accessibilityLabel={t('home.gift')}
            onPress={() => openBook(library.daily)}
          />
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
        <>
          <View style={{ marginBottom: sectionGap }}>
            <DailyStoryCard book={library.daily} onPress={() => openBook(library.daily)} />
          </View>

          <PaywallNagRow spacingBelow={sectionGap} />

          <View style={{ gap: sectionGap }}>
            <Rail
              title={t('home.rail.continue')}
              books={library.continueReading}
              onPressBook={openBook}
              onSeeAll={seeAll}
              ribbonBookId={library.currentBookId}
            />
            <Rail
              title={t('home.rail.recommended')}
              books={library.recommended}
              onPressBook={openBook}
              onSeeAll={seeAll}
            />
            <Rail
              title={t('home.rail.new')}
              books={library.newReleases}
              onPressBook={openBook}
              onSeeAll={seeAll}
            />
          </View>
        </>
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
});
