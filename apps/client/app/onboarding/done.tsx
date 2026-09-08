/**
 * The last screen of onboarding: one book, by name (run 7 lane C, made a
 * spread in run 10).
 *
 * "Finish with a recommendation and the library." The old fast path ended by
 * replacing itself with a reader, which meant setup finished by a screen the
 * learner had not asked for; this ends by offering one, and by saying that
 * the library holds the rest.
 *
 * Run 10: the recommendation was a text-only card and two equal buttons, so
 * the last thing a stranger saw before their first page was a form. It is
 * now the same spread Home opens with (`src/ui/TodaysStorySpread.tsx`) —
 * cover left, level, title, author and premise right — with one primary
 * button and the library as a text link. `TodaysStorySpread` itself is not
 * reused: it always prints Read / Listen / About, which would put three
 * buttons where setup needs one.
 *
 * It also carries the two questions run 10 stopped asking. The interface and
 * explanation languages are set from the browser, so the screen says which
 * ones they are and links to Settings; a default nobody was told about is
 * the thing the four-step wizard existed to avoid.
 *
 * No `onboarded` gate here, unlike every other onboarding screen: this screen
 * is reached *because* `onboarded` was just set.
 */
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { recommendBook } from '../../src/onboarding/recommend';
import { selectPackForLocale } from '../../src/state/selectors';
import { useSottoStore } from '../../src/state/store';
import { Button } from '../../src/ui/Button';
import { Cover } from '../../src/ui/Cover';
import { toLibraryBook, usePreferences } from '../../src/ui/data';
import {
  APP_LANGUAGES,
  EXPLANATION_LANGUAGES,
  localizedName,
  type LanguageOption,
} from '../../src/ui/languages';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';

/** The name of a locale as this catalog writes it, falling back to the code
 * itself for anything the option lists do not carry. */
function nameOf(code: string, options: LanguageOption[]): string {
  const option = options.find((candidate) => candidate.code === code);
  return option ? localizedName(option) : code;
}

export default function OnboardingDoneScreen() {
  const t = useT();
  const router = useRouter();
  const preferences = usePreferences();
  const { colors } = useTheme();
  const { isDesktop } = useLayoutMetrics();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const packs = useSottoStore((s) => s.packs);
  const packsStatus = useSottoStore((s) => s.packsStatus);
  const loadPacks = useSottoStore((s) => s.loadPacks);

  useEffect(() => {
    if (packsStatus === 'idle') void loadPacks();
  }, [packsStatus, loadPacks]);

  const books = selectPackForLocale(packs, preferences.learningLocale)?.books ?? [];
  const summary = recommendBook(books, preferences.level);
  // Same mapping the library and Home use, so the cover is built from the
  // book's own metadata (paper, mark, level stamp) rather than a second
  // guess at it. Progress is 0: this is a book nobody has opened yet.
  const book = summary ? toLibraryBook(summary, preferences, 0) : undefined;

  const uiName = nameOf(preferences.interfaceLocale, APP_LANGUAGES);
  const explainName = nameOf(preferences.explanationLocale, EXPLANATION_LANGUAGES);
  const languagesLine =
    preferences.interfaceLocale === preferences.explanationLocale
      ? t('onboarding.done.languages', { language: uiName })
      : t('onboarding.done.languagesSplit', { ui: uiName, explain: explainName });

  return (
    <Shell sidebar={false}>
      <Text role="display" style={styles.title} testID="onboarding-done-title">
        {t('onboarding.done.title')}
      </Text>
      <Text role="ui" size={15} color="ink2" style={styles.subtitle}>
        {t(book ? 'onboarding.done.subtitle' : 'onboarding.done.noBook')}
      </Text>

      {book ? (
        <View style={styles.spread}>
          <View style={[styles.coverColumn, isDesktop ? styles.coverDesktop : styles.coverPhone]}>
            <Cover
              book={book}
              width={isDesktop ? 120 : 104}
              height={isDesktop ? 180 : 156}
              cutout
              accessibilityLabel={book.title}
            />
          </View>
          <View style={[styles.text, isDesktop ? styles.textDesktop : styles.textPhone]}>
            <Text role="mono" color="ink2" style={styles.eyebrow}>
              {book.level}
            </Text>
            <Text role="display" size={22} style={styles.bookTitle} testID="onboarding-done-book">
              {book.title}
            </Text>
            <Text role="caption" color="ink2">
              {book.author}
            </Text>
            {book.synopsis ? (
              <Text role="reading" size={16} style={styles.premise}>
                {book.synopsis}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        {book ? (
          <Button
            title={t('onboarding.done.start')}
            onPress={() => router.replace(`/reader/${book.id}`)}
          />
        ) : (
          <Button title={t('onboarding.done.library')} onPress={() => router.replace('/library')} />
        )}
        {book ? (
          <Pressable
            onPress={() => router.replace('/library')}
            accessibilityRole="link"
            style={[styles.libraryLink, webCursor]}
          >
            <Text role="ui" size={15} color="ink2">
              {t('onboarding.done.library')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.languagesLine}>
        <Text role="caption" color="ink2">
          {languagesLine}
        </Text>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="link"
          hitSlop={space.sm}
          style={webCursor}
        >
          <Text role="caption" color="ink2" style={styles.underline}>
            {t('onboarding.done.change')}
          </Text>
        </Pressable>
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
    // Home's `.spread`: surface card, hairline border, a surface-2 cover
    // column with a hairline right edge.
    spread: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    coverColumn: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface2,
      borderRightWidth: 1,
      borderRightColor: colors.hairline,
    },
    coverPhone: {
      width: 140,
      paddingVertical: 18,
      paddingHorizontal: 14,
    },
    coverDesktop: {
      width: 184,
      paddingVertical: 28,
      paddingHorizontal: 24,
    },
    text: {
      flex: 1,
      minWidth: 0,
    },
    textPhone: {
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    textDesktop: {
      paddingVertical: 28,
      paddingHorizontal: 32,
    },
    eyebrow: {
      textTransform: 'uppercase',
    },
    bookTitle: {
      marginTop: space.sm,
    },
    premise: {
      marginTop: space.sm,
    },
    actions: {
      marginTop: space.xl,
      gap: space.sm,
    },
    libraryLink: {
      alignSelf: 'center',
      minHeight: 40,
      justifyContent: 'center',
    },
    languagesLine: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: space.xs,
      marginTop: space.xl,
    },
    underline: {
      textDecorationLine: 'underline',
    },
    tutorNote: {
      marginTop: space.sm,
    },
  });
}
