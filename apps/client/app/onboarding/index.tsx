/**
 * Onboarding — two questions, two steps (run 7 lane C, halved in run 10).
 *
 * Run 7 replaced the silent A1 "fast path" with four questions, one per
 * step: app language, I'm learning, your level, explain in. Nothing was
 * hidden any more, and the cost showed up on the stopwatch — six taps from
 * the landing page to the first page of a book, the first of them spent
 * answering a question ("App language") that the browser had already
 * answered correctly.
 *
 * So the two language questions the browser answers are defaults again, not
 * steps: `fastPathDefaultsFor(detectBrowserLanguage())` still supplies the
 * interface and explanation locales, `preferencesFrom` still writes all four
 * preferences in one write, and the last screen of setup names both
 * languages with a link to Settings. What is left is the pair only the
 * learner knows: what they are learning, and how much of it they can read.
 * Four taps, landing page to reader.
 *
 * Step 1 groups the eleven content locales into eight language rows
 * (`src/onboarding/languageFamilies.ts`); a region or script is picked in a
 * segmented control that opens under the selected row, so the list is a
 * list of languages rather than of variants.
 *
 * Step 2 asks the level with sentences instead of labels. A2 and B1 mean
 * nothing to someone who has never sat a CEFR exam, and run 7's answer to
 * that — a "Not sure which level?" toggle that expanded a second list below
 * the fold — was help you had to know to ask for. The sentence is now the
 * row (`src/onboarding/levelSamples.ts`).
 *
 * The primary button is pinned (Shell's `footer`), so neither step can hide
 * it under a list.
 *
 * No tutor step. The tutor is a setting, not a setup question, and asking
 * about it here is how a learner ends up thinking they need a key to read.
 */
import { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { getLanguage } from '@sotto/core';
import { space } from '@sotto/core/theme';
import { playSample, synthesizeSample } from '@sotto/voice';
import { playAudioSlice } from '../../src/platform/audio';
import { setUiCatalog, useT, type MessageKey } from '../../src/i18n/useT';
import { detectBrowserLanguage, fastPathDefaultsFor } from '../../src/onboarding/fastPathDefaults';
import {
  defaultVariantFor,
  familyForCode,
  languageFamilies,
  shortVariantName,
  type LanguageFamily,
} from '../../src/onboarding/languageFamilies';
import { LEVELS, levelSamplesFor } from '../../src/onboarding/levelSamples';
import { VariantSegments, type VariantSegment } from '../../src/onboarding/VariantSegments';
import {
  ONBOARDING_STEPS,
  initialWizardState,
  preferencesFrom,
  setWizardValue,
} from '../../src/onboarding/wizard';
import { Button } from '../../src/ui/Button';
import { setPreferences, usePreferences } from '../../src/ui/data';
import { SpeakerGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import type { BookLevel } from '../../src/ui/dev/fixtures';
import { LEARNING_LANGUAGES, SCRIPT_OPTIONS } from '../../src/ui/languages';
import { OptionRow } from '../../src/ui/OptionRow';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';
import { useVoiceSample } from '../../src/onboarding/useVoiceSample';

const STEP_TITLES: Record<(typeof ONBOARDING_STEPS)[number], MessageKey> = {
  learningLocale: 'onboarding.step.learning',
  level: 'onboarding.step.level',
};

const LEVEL_DESC_KEYS: Record<BookLevel, MessageKey> = {
  A0: 'onboarding.level.a0.desc',
  A1: 'onboarding.level.a1.desc',
  A2: 'onboarding.level.a2.desc',
  B1: 'onboarding.level.b1.desc',
  B2: 'onboarding.level.b2.desc',
  C1: 'onboarding.level.c1.desc',
};

export default function OnboardingScreen() {
  const t = useT();
  const router = useRouter();
  const preferences = usePreferences();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Stable for the life of this screen — re-detecting on every render would
  // flip the proposal if `navigator.languages` ever changed mid-flow.
  const [defaults] = useState(() => fastPathDefaultsFor(detectBrowserLanguage()));
  const [state, setState] = useState(() => initialWizardState(defaults));
  const [stepIndex, setStepIndex] = useState(0);

  const step = ONBOARDING_STEPS[stepIndex]!;
  const activeLocale = state.learningLocale === 'zh' ? state.script : state.learningLocale;
  const hasNarrationVoice = getLanguage(activeLocale).ttsVoice !== null;
  const sample = useVoiceSample(activeLocale);

  // A4 fix, kept: the interface language takes effect before paint rather
  // than at the end of setup, so the steps render in it. It is a default
  // now rather than an answer, but the catalog still has to be set.
  useLayoutEffect(() => {
    setUiCatalog(state.interfaceLocale);
  }, [state.interfaceLocale]);

  // Same gate as before: an already-onboarded learner (deep link, back
  // navigation) skips straight to home instead of redoing setup.
  if (preferences.onboarded) return <Redirect href="/(tabs)/home" />;

  const set = <K extends keyof typeof state>(field: K, value: (typeof state)[K]) =>
    setState((current) => setWizardValue(current, field, value));

  const advance = () => {
    if (stepIndex < ONBOARDING_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
      return;
    }
    // One write, so a half-finished setup can never be persisted: the four
    // preferences and `onboarded` land together.
    setPreferences({ ...preferencesFrom(state), onboarded: true });
    router.replace('/onboarding/done');
  };

  const back = () => {
    if (stepIndex === 0) return;
    setStepIndex(stepIndex - 1);
  };

  // Rebuilt on every render rather than memoized: eight rows off a static
  // list, and the localized half of each row follows the active catalog.
  const families = languageFamilies(LEARNING_LANGUAGES);
  const selectedFamily = familyForCode(families, state.learningLocale) ?? families[0]!;

  /** The control under a row: the two Chinese scripts, or the regions of a
   * language that ships more than one. Neither adds a locale — `zh` has
   * always been one row with the script stored separately. */
  const variantsFor = (
    family: LanguageFamily,
  ): { segments: VariantSegment[]; value: string; onChange: (next: string) => void } | null => {
    if (family.id === 'zh') {
      return {
        segments: SCRIPT_OPTIONS.map((option) => ({
          value: option.code,
          label: shortVariantName(option),
        })),
        value: state.script,
        onChange: (next) => set('script', next),
      };
    }
    if (family.variants.length < 2) return null;
    return {
      segments: family.variants.map((option) => ({
        value: option.code,
        label: shortVariantName(option),
      })),
      value: state.learningLocale,
      onChange: (next) => set('learningLocale', next),
    };
  };

  const samples = levelSamplesFor(activeLocale);
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  return (
    <Shell
      sidebar={false}
      footer={
        <View style={styles.footer}>
          <Button
            title={t(isLastStep ? 'onboarding.finish' : 'common.continue')}
            onPress={advance}
          />
          {stepIndex > 0 ? (
            <Pressable
              onPress={back}
              accessibilityRole="button"
              testID="onboarding-back"
              hitSlop={space.sm}
              style={[styles.secondary, webCursor]}
            >
              <Text role="ui" size={15} color="ink2">
                {t('common.back')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <Text role="caption" color="ink2" style={styles.progress} testID="onboarding-progress">
        {t('onboarding.progress', {
          step: String(stepIndex + 1),
          total: String(ONBOARDING_STEPS.length),
        })}
      </Text>
      <Text role="display" style={styles.title} testID="onboarding-title">
        {t(STEP_TITLES[step])}
      </Text>

      {step === 'learningLocale' ? (
        <>
          <View style={styles.list}>
            {families.map((family) => {
              const selected = family.id === selectedFamily.id;
              const variants = selected ? variantsFor(family) : null;
              return (
                <View key={family.id}>
                  <OptionRow
                    nativeName={family.nativeName}
                    localizedName={family.localizedName}
                    selected={selected}
                    onPress={() =>
                      set('learningLocale', defaultVariantFor(family, defaults.learningLocale))
                    }
                  />
                  {variants ? (
                    <View style={styles.variants}>
                      <VariantSegments
                        segments={variants.segments}
                        value={variants.value}
                        onChange={variants.onChange}
                        groupLabel={t('onboarding.step.script')}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          {/* Only when there is something to play: "Sample unavailable" was
              a row that told a stranger about our loading state. */}
          {hasNarrationVoice && sample ? (
            <View style={styles.voiceRow}>
              <IconButton
                variant="ring"
                icon={<SpeakerGlyph size={16} color={colors.accent} />}
                accessibilityLabel={t('onboarding.a11y.playSample')}
                onPress={() => {
                  // Slice 3 (planning/BROWSER-TUTOR.md): use the in-browser
                  // tutor's voice when it is already downloaded, else the
                  // recorded narration slice.
                  void synthesizeSample(sample.text, activeLocale).then((synthesized) => {
                    if (synthesized) playSample(synthesized);
                    else playAudioSlice(sample.uri, sample.startMs, sample.endMs);
                  });
                }}
              />
              <Text role="ui" size={13} color="ink2">
                {t('onboarding.voiceSample')}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      {step === 'level' ? (
        <>
          <Text role="caption" color="ink2" style={styles.hint}>
            {t('onboarding.level.samplesHint')}
          </Text>
          <View style={styles.list}>
            {LEVELS.map((value) => (
              <OptionRow
                key={value}
                // The sentence is the row. A band is a label a stranger
                // cannot honestly answer; a line in the language they are
                // about to read is one they can.
                nativeName={samples ? `${value} · ${samples[value][0]!}` : value}
                localizedName={t(LEVEL_DESC_KEYS[value])}
                selected={state.level === value}
                onPress={() => set('level', value)}
              />
            ))}
          </View>
        </>
      ) : null}
    </Shell>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    progress: {
      marginBottom: space.xs,
    },
    title: {
      marginBottom: space.xl,
    },
    hint: {
      marginBottom: space.md,
    },
    list: {
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
    },
    variants: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      paddingHorizontal: 14,
      paddingBottom: space.md,
    },
    voiceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      marginTop: 18,
    },
    footer: {
      gap: space.sm,
    },
    secondary: {
      alignSelf: 'center',
      minHeight: space.tapTarget,
      justifyContent: 'center',
    },
  });
}
