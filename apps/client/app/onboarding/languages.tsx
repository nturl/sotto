import { useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { getLanguage } from '@sotto/core';
import { colors, space } from '@sotto/core/theme';
import { playAudioSlice } from '../../src/platform/audio';
import { assetUrl, fetchBook, fetchChapter } from '../../src/state/contentApi';
import { selectPackForLocale } from '../../src/state/selectors';
import { useSottoStore } from '../../src/state/store';
import { useT } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { setPreference, usePreferences } from '../../src/ui/data';
import { SpeakerGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import {
  APP_LANGUAGES,
  EXPLANATION_LANGUAGES,
  LEARNING_LANGUAGES,
  SCRIPT_OPTIONS,
  localizedName,
  type LanguageOption,
} from '../../src/ui/languages';
import { OptionRow } from '../../src/ui/OptionRow';
import { SectionEyebrow } from '../../src/ui/SectionEyebrow';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { setUiCatalog } from '../../src/i18n/useT';

type VoiceSample = { uri: string; startMs: number; endMs: number };

/** Loads the first sentence's audio slice of the first book in `locale`'s
 * pack, once packs are loaded — for onboarding's "listen to a sample" row.
 * Returns `undefined` while still resolving, `null` once resolution finished
 * with nothing playable (no pack/chapter/timings for this locale). */
function useVoiceSample(locale: string): VoiceSample | null | undefined {
  const packs = useSottoStore((s) => s.packs);
  const packsStatus = useSottoStore((s) => s.packsStatus);
  const loadPacks = useSottoStore((s) => s.loadPacks);
  const [sample, setSample] = useState<VoiceSample | null | undefined>(undefined);

  useEffect(() => {
    if (packsStatus === 'idle') void loadPacks();
  }, [packsStatus, loadPacks]);

  useEffect(() => {
    let cancelled = false;
    setSample(undefined);

    if (packsStatus !== 'ready') return undefined;
    const summary = selectPackForLocale(packs, locale)?.books[0];
    if (!summary) {
      setSample(null);
      return undefined;
    }

    void (async () => {
      try {
        const book = await fetchBook(locale, summary.bookId);
        const chapterSummary = book.chapters[0];
        if (!chapterSummary?.audio) {
          if (!cancelled) setSample(null);
          return;
        }
        const chapter = await fetchChapter(locale, summary.bookId, chapterSummary.file);
        const tokens = chapter.blocks[0]?.sentences[0]?.tokens ?? [];
        const first = tokens[0];
        const last = tokens[tokens.length - 1];
        if (first?.startMs === undefined || last?.endMs === undefined) {
          if (!cancelled) setSample(null);
          return;
        }
        if (!cancelled) {
          setSample({
            uri: assetUrl(locale, summary.bookId, chapterSummary.audio),
            startMs: first.startMs,
            endMs: last.endMs,
          });
        }
      } catch {
        if (!cancelled) setSample(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locale, packs, packsStatus]);

  return sample;
}

type Step = 0 | 1 | 2;

const STEP_TITLES = [
  'onboarding.step.appLanguage',
  'onboarding.step.explainIn',
  'onboarding.step.learning',
] as const;

export default function OnboardingLanguagesScreen() {
  const t = useT();
  const router = useRouter();
  const preferences = usePreferences();
  const { gutter } = useLayoutMetrics();
  const [step, setStep] = useState<Step>(0);
  const [appLanguage, setAppLanguage] = useState('fr');
  const [explanation, setExplanation] = useState('en');
  const [learning, setLearning] = useState('fr-FR');
  const [script, setScript] = useState('zh-CN');

  const activeLocale = learning === 'zh' ? script : learning;
  const hasNarrationVoice = getLanguage(activeLocale).ttsVoice !== null;
  const sample = useVoiceSample(activeLocale);

  // A4 fix: the picked interface language used to only take effect once the
  // wizard finished (setUiCatalog was called in `advance()` on the last
  // step), so the "Explain in" and "I'm learning" steps still rendered in
  // whatever catalog was active before onboarding started. Sync it on every
  // change instead, so each step re-renders in the picked language
  // immediately (before paint, to avoid a flash of the old language).
  useLayoutEffect(() => {
    setUiCatalog(appLanguage);
  }, [appLanguage]);

  // Same gate as app/index.tsx: an already-onboarded user (deep link, back
  // navigation) skips straight to home instead of redoing setup.
  if (preferences.onboarded) return <Redirect href="/(tabs)/home" />;

  const advance = () => {
    if (step < 2) {
      setStep((step + 1) as Step);
      return;
    }
    setPreference('interfaceLocale', appLanguage);
    setPreference('explanationLocale', explanation);
    setPreference('learningLocale', learning === 'zh' ? script : learning);
    router.push('/onboarding/level');
  };

  const renderOptions = (
    options: LanguageOption[],
    selected: string,
    onSelect: (code: string) => void,
  ) => (
    <View style={styles.list}>
      {options.map((option) => (
        <OptionRow
          key={option.code}
          nativeName={option.nativeName}
          localizedName={localizedName(option)}
          selected={option.code === selected}
          onPress={() => onSelect(option.code)}
        />
      ))}
    </View>
  );

  return (
    <Shell contentBottomPadding={120} sidebar={false}>
      <Text role="display" style={styles.title}>
        {t(STEP_TITLES[step])}
      </Text>

      {step === 0 ? renderOptions(APP_LANGUAGES, appLanguage, setAppLanguage) : null}
      {step === 1 ? renderOptions(EXPLANATION_LANGUAGES, explanation, setExplanation) : null}
      {step === 2 ? (
        <>
          {renderOptions(LEARNING_LANGUAGES, learning, setLearning)}
          {learning === 'zh' ? (
            <View style={styles.scriptSection}>
              <SectionEyebrow>{t('onboarding.step.script')}</SectionEyebrow>
              {renderOptions(SCRIPT_OPTIONS, script, setScript)}
            </View>
          ) : null}
          {hasNarrationVoice ? (
            <View style={styles.voiceRow}>
              <IconButton
                variant="ring"
                icon={<SpeakerGlyph size={16} color={colors.accent} />}
                accessibilityLabel={t('onboarding.a11y.playSample')}
                onPress={() => {
                  if (sample) playAudioSlice(sample.uri, sample.startMs, sample.endMs);
                }}
                style={sample ? undefined : styles.voiceButtonDisabled}
              />
              <Text role="ui" size={13} color="ink2">
                {sample ? t('onboarding.voiceSample') : t('onboarding.voiceSample.unavailable')}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      <View style={[styles.footer, { paddingHorizontal: gutter, paddingBottom: space.lg }]}>
        <Button title={t('common.continue')} onPress={advance} />
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: space.xl,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  scriptSection: {
    marginTop: space.xl,
    gap: space.md,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: 18,
  },
  voiceButtonDisabled: {
    opacity: 0.4,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.md,
    backgroundColor: colors.canvas,
  },
});
