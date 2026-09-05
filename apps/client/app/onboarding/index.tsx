/**
 * A1 fast path (OVERNIGHT-2.md Lane A): a stranger opening the hosted link
 * should be reading a narrated story within two taps. This screen detects
 * the browser's language, proposes sensible defaults (no questions asked),
 * and offers one primary cutout CTA that lands directly on the reader of
 * the first book of the proposed learning language (tap 1). Tap 2 is the
 * reader's own play button. "Choose languages" escapes to the full wizard
 * (app/onboarding/languages.tsx) for anyone who wants control.
 */
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { setUiCatalog, useT, type MessageKey } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { setPreference, usePreferences } from '../../src/ui/data';
import { APP_LANGUAGES, LEARNING_LANGUAGES, localizedName } from '../../src/ui/languages';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';
import { selectPackForLocale } from '../../src/state/selectors';
import { useSottoStore } from '../../src/state/store';
import { detectBrowserLanguage, fastPathDefaultsFor } from '../../src/onboarding/fastPathDefaults';

const LEVEL_DESC_KEYS: Record<string, MessageKey> = {
  A0: 'onboarding.level.a0.desc',
  A1: 'onboarding.level.a1.desc',
  A2: 'onboarding.level.a2.desc',
};

export default function OnboardingFastPathScreen() {
  const t = useT();
  const router = useRouter();
  const preferences = usePreferences();
  const { gutter, isDesktop } = useLayoutMetrics();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const packs = useSottoStore((s) => s.packs);
  const packsStatus = useSottoStore((s) => s.packsStatus);
  const loadPacks = useSottoStore((s) => s.loadPacks);

  // Stable for the life of this screen — re-detecting on every render would
  // flip the proposed language if navigator.languages ever changed mid-flow.
  const defaults = useMemo(() => fastPathDefaultsFor(detectBrowserLanguage()), []);

  useEffect(() => {
    setUiCatalog(defaults.interfaceLocale);
  }, [defaults.interfaceLocale]);

  useEffect(() => {
    if (packsStatus === 'idle') void loadPacks();
  }, [packsStatus, loadPacks]);

  // Same gate as the rest of onboarding: an already-onboarded user (deep
  // link, back navigation) skips straight to home.
  if (preferences.onboarded) return <Redirect href="/(tabs)/home" />;

  const pack = selectPackForLocale(packs, defaults.learningLocale);
  const firstBookId = pack?.books[0]?.bookId;
  const ready = packsStatus === 'ready' && !!firstBookId;

  const start = () => {
    if (!firstBookId) return;
    setPreference('interfaceLocale', defaults.interfaceLocale);
    setPreference('explanationLocale', defaults.explanationLocale);
    setPreference('learningLocale', defaults.learningLocale);
    setPreference('level', defaults.level);
    setPreference('onboarded', true);
    router.replace(`/reader/${firstBookId}`);
  };

  const ctaKey =
    defaults.learningLocale === 'fr-FR' ? 'onboarding.fast.cta.fr' : 'onboarding.fast.cta.es';

  // Proposed-defaults summary (F1.3): fills the empty middle of the phone
  // layout between the subtitle and the bottom-anchored CTA with the three
  // choices the fast path is silently making, so a stranger sees what
  // "Start reading" is about to set up rather than a blank stretch of
  // canvas. Quiet rows only — not interactive; "Choose languages" below
  // remains the one way to change any of this.
  const learningName = localizedName(
    LEARNING_LANGUAGES.find((o) => o.code === defaults.learningLocale) ?? LEARNING_LANGUAGES[0]!,
    defaults.interfaceLocale,
  );
  const explanationName = localizedName(
    APP_LANGUAGES.find((o) => o.code === defaults.explanationLocale) ?? APP_LANGUAGES[0]!,
    defaults.interfaceLocale,
  );
  const levelDescKey = LEVEL_DESC_KEYS[defaults.level] ?? 'onboarding.level.a1.desc';
  const summaryRows = (
    <View style={styles.summary}>
      <SummaryRow label={t('onboarding.step.learning')} value={learningName} colors={colors} />
      <SummaryRow label={t('onboarding.step.explainIn')} value={explanationName} colors={colors} />
      <SummaryRow
        label={t('onboarding.step.level')}
        value={`${defaults.level} — ${t(levelDescKey)}`}
        colors={colors}
      />
    </View>
  );

  // DESKTOP.md §8: at >= 900 the whole screen (title -> CTA -> link) is one
  // vertically centered stack (Shell centers the content box itself), so
  // the footer sits in normal flow. Phone keeps it pinned above the home
  // indicator, per DESIGN.md's onboarding CTA rule — the one deliberate
  // difference between the two widths for this screen.
  const footer = (
    <View
      style={[
        isDesktop ? styles.footerDesktop : styles.footerPhone,
        { paddingHorizontal: isDesktop ? 0 : gutter, paddingBottom: isDesktop ? 0 : space.lg },
      ]}
    >
      <Button title={t(ctaKey)} onPress={start} disabled={!ready} />
      <Pressable
        onPress={() => router.push('/onboarding/languages')}
        accessibilityRole="button"
        style={[styles.secondary, webCursor]}
        hitSlop={space.sm}
      >
        <Text role="ui" size={15} color="ink2">
          {t('onboarding.fast.chooseLanguages')}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <Shell contentBottomPadding={160} sidebar={false}>
      <Text role="display" style={styles.title}>
        {t('onboarding.fast.title')}
      </Text>
      <Text role="ui" size={15} color="ink2" style={styles.subtitle}>
        {t('onboarding.fast.subtitle')}
      </Text>
      {summaryRows}
      {footer}
    </Shell>
  );
}

/** A quiet, non-interactive row matching OptionRow's visual language
 * (surface background, hairline divider, Fraunces label + caption) without
 * its Pressable/selected affordances — this is a summary, not a choice. */
function SummaryRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const styles = useMemo(() => createSummaryRowStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Text role="reading" size={17}>
        {value}
      </Text>
      <Text role="caption" style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

function createSummaryRowStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      paddingVertical: space.lg,
      paddingHorizontal: 14,
      minHeight: space.tapTarget,
      justifyContent: 'center',
    },
    label: {
      marginTop: 2,
    },
  });
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    title: {
      marginBottom: space.md,
    },
    subtitle: {
      marginBottom: space.xl,
    },
    summary: {
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
      marginBottom: space.xl,
    },
    footerPhone: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: space.md,
      backgroundColor: colors.canvas,
      gap: space.md,
    },
    footerDesktop: {
      marginTop: space.xxl,
      gap: space.md,
    },
    secondary: {
      alignSelf: 'center',
      minHeight: space.tapTarget,
      justifyContent: 'center',
    },
  });
}
