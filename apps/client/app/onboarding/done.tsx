/**
 * The last screen of onboarding: one book, by name (run 7 lane C).
 *
 * "Finish with a recommendation and the library." The old fast path ended by
 * replacing itself with a reader, which meant setup finished by a screen the
 * learner had not asked for; this ends by offering one, and by saying that
 * the library holds the rest.
 *
 * It also says the one thing the whole run is trying to stop being confusing:
 * the tutor is a later, optional setting. Nobody needs a key or a plan to
 * finish setting Sotto up.
 *
 * No `onboarded` gate here, unlike every other onboarding screen: this screen
 * is reached *because* `onboarded` was just set.
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { recommendBook } from '../../src/onboarding/recommend';
import { selectPackForLocale } from '../../src/state/selectors';
import { useSottoStore } from '../../src/state/store';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { usePreferences } from '../../src/ui/data';
import { SectionEyebrow } from '../../src/ui/SectionEyebrow';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';

export default function OnboardingDoneScreen() {
  const t = useT();
  const router = useRouter();
  const preferences = usePreferences();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const packs = useSottoStore((s) => s.packs);
  const packsStatus = useSottoStore((s) => s.packsStatus);
  const loadPacks = useSottoStore((s) => s.loadPacks);

  useEffect(() => {
    if (packsStatus === 'idle') void loadPacks();
  }, [packsStatus, loadPacks]);

  const books = selectPackForLocale(packs, preferences.learningLocale)?.books ?? [];
  const book = recommendBook(books, preferences.level);
  const title = book
    ? (book.localizedTitles[preferences.interfaceLocale] ?? book.title)
    : undefined;

  return (
    <Shell contentBottomPadding={140} sidebar={false}>
      <Text role="display" style={styles.title} testID="onboarding-done-title">
        {t('onboarding.done.title')}
      </Text>
      <Text role="ui" size={15} color="ink2" style={styles.subtitle}>
        {t(book ? 'onboarding.done.subtitle' : 'onboarding.done.noBook')}
      </Text>

      {book ? (
        <Card style={styles.card}>
          <SectionEyebrow>{book.level}</SectionEyebrow>
          <Text role="display" size={22} testID="onboarding-done-book">
            {title}
          </Text>
          <Text role="caption" color="ink2">
            {book.author}
          </Text>
          {book.premise[preferences.explanationLocale] ? (
            <Text role="reading" size={16} style={styles.premise}>
              {book.premise[preferences.explanationLocale]}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <View style={styles.actions}>
        {book ? (
          <Button
            title={t('onboarding.done.start')}
            onPress={() => router.replace(`/reader/${book.bookId}`)}
          />
        ) : null}
        <Button
          variant={book ? 'secondary' : 'primary'}
          title={t('onboarding.done.library')}
          onPress={() => router.replace('/library')}
        />
      </View>

      <Text role="caption" color="ink2" style={styles.tutorNote}>
        {t('onboarding.done.tutorLater')}
      </Text>
    </Shell>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    title: {
      marginTop: space.lg,
      marginBottom: space.md,
    },
    subtitle: {
      marginBottom: space.xl,
    },
    card: {
      gap: space.xs,
      borderColor: colors.hairline,
    },
    premise: {
      marginTop: space.sm,
    },
    actions: {
      marginTop: space.xl,
      gap: space.md,
    },
    tutorNote: {
      marginTop: space.xl,
    },
  });
}
