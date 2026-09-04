import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { DailyStoryCard } from '../../src/ui/DailyStoryCard';
import { useLibrary, type LibraryBook } from '../../src/ui/data';
import { GiftGlyph, SettingsGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { Rail } from '../../src/ui/Rail';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { Toast } from '../../src/ui/Toast';

export default function HomeScreen() {
  const t = useT();
  const router = useRouter();
  const library = useLibrary();
  const { sectionGap } = useLayoutMetrics();
  const [toast, setToast] = useState<string | null>(null);

  const openBook = (book: LibraryBook) => router.push(`/book/${book.id}`);

  return (
    <Shell>
      <View style={styles.header}>
        <Text role="display">{t('tabs.home')}</Text>
        <View style={styles.headerActions}>
          <IconButton
            icon={<SettingsGlyph size={20} />}
            accessibilityLabel={t('home.settings')}
            onPress={() => router.push('/profile')}
          />
          <IconButton
            icon={<GiftGlyph size={20} />}
            accessibilityLabel={t('home.gift')}
            onPress={() => openBook(library.daily)}
          />
        </View>
      </View>

      <View style={{ marginBottom: sectionGap }}>
        <DailyStoryCard book={library.daily} onPress={() => openBook(library.daily)} />
      </View>

      <View style={{ gap: sectionGap }}>
        <Rail title={t('home.rail.continue')} books={library.continueReading} onPressBook={openBook} />
        <Rail title={t('home.rail.recommended')} books={library.recommended} onPressBook={openBook} />
        <Rail title={t('home.rail.new')} books={library.newReleases} onPressBook={openBook} />
      </View>

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
});
