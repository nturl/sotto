/**
 * Onboarding — four questions, four steps (run 7 lane C).
 *
 * What was here before was the A1 "fast path": one screen that silently chose
 * a language, an explanation language and a level, and dropped the learner
 * into a reader. It got a stranger reading quickly, and it was also most of
 * why the journey felt unfigured (recording 1) — nobody was ever asked
 * anything, so nobody knew what had been decided for them, and the two
 * escapes (`/onboarding/languages`, `/onboarding/level`) asked the same
 * questions again in a different order.
 *
 * Now: one screen, four steps, each asking one thing, each already showing
 * the fast path's proposal as the selected answer. Confirming four times is
 * still quick; nothing is hidden. The state lives in `src/onboarding/wizard.ts`
 * so "changing one answer never changes another" is a test, not a hope.
 *
 * Step 3 is the level, the one question a stranger genuinely cannot answer
 * from a label — so it carries the "not sure?" helper: sample sentences in
 * the language they are about to read (`src/onboarding/levelSamples.ts`).
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
import { LEVELS, levelSamplesFor } from '../../src/onboarding/levelSamples';
import {
  ONBOARDING_STEPS,
  initialWizardState,
  preferencesFrom,
  setWizardValue,
} from '../../src/onboarding/wizard';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { setPreferences, usePreferences } from '../../src/ui/data';
import { SpeakerGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import type { BookLevel } from '../../src/ui/dev/fixtures';
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
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';
import { useVoiceSample } from '../../src/onboarding/useVoiceSample';

const STEP_TITLES: Record<(typeof ONBOARDING_STEPS)[number], MessageKey> = {
  interfaceLocale: 'onboarding.step.appLanguage',
  learningLocale: 'onboarding.step.learning',
  level: 'onboarding.step.level',
  explanationLocale: 'onboarding.step.explainIn',
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
  const { gutter } = useLayoutMetrics();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Stable for the life of this screen — re-detecting on every render would
  // flip the proposal if `navigator.languages` ever changed mid-flow.
  const defaults = useMemo(() => fastPathDefaultsFor(detectBrowserLanguage()), []);
  const [state, setState] = useState(() => initialWizardState(defaults));
  const [stepIndex, setStepIndex] = useState(0);
  const [showSamples, setShowSamples] = useState(false);

  const step = ONBOARDING_STEPS[stepIndex]!;
  const activeLocale = state.learningLocale === 'zh' ? state.script : state.learningLocale;
  const hasNarrationVoice = getLanguage(activeLocale).ttsVoice !== null;
  const sample = useVoiceSample(activeLocale);

  // A4 fix, kept: the picked interface language takes effect on every change
  // rather than at the end, so each step renders in the language just chosen
  // — before paint, to avoid a flash of the old one.
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
      setShowSamples(false);
      return;
    }
    // One write, so a half-finished setup can never be persisted: the four
    // answers and `onboarded` land together.
    setPreferences({ ...preferencesFrom(state), onboarded: true });
    router.replace('/onboarding/done');
  };

  const back = () => {
    if (stepIndex === 0) return;
    setStepIndex(stepIndex - 1);
    setShowSamples(false);
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

  const samples = levelSamplesFor(activeLocale);

  return (
    <Shell contentBottomPadding={140} sidebar={false}>
      <Text role="caption" color="ink2" style={styles.progress} testID="onboarding-progress">
        {t('onboarding.progress', {
          step: String(stepIndex + 1),
          total: String(ONBOARDING_STEPS.length),
        })}
      </Text>
      <Text role="display" style={styles.title} testID="onboarding-title">
        {t(STEP_TITLES[step])}
      </Text>

      {step === 'interfaceLocale'
        ? renderOptions(APP_LANGUAGES, state.interfaceLocale, (code) =>
            set('interfaceLocale', code),
          )
        : null}

      {step === 'learningLocale' ? (
        <>
          {renderOptions(LEARNING_LANGUAGES, state.learningLocale, (code) =>
            set('learningLocale', code),
          )}
          {state.learningLocale === 'zh' ? (
            <View style={styles.scriptSection}>
              <SectionEyebrow>{t('onboarding.step.script')}</SectionEyebrow>
              {renderOptions(SCRIPT_OPTIONS, state.script, (code) => set('script', code))}
            </View>
          ) : null}
          {hasNarrationVoice ? (
            <View style={styles.voiceRow}>
              <IconButton
                variant="ring"
                icon={<SpeakerGlyph size={16} color={colors.accent} />}
                accessibilityLabel={t('onboarding.a11y.playSample')}
                onPress={() => {
                  if (!sample) return;
                  // Slice 3 (planning/BROWSER-TUTOR.md): use the in-browser
                  // tutor's voice when it is already downloaded, else the
                  // recorded narration slice.
                  void synthesizeSample(sample.text, activeLocale).then((synthesized) => {
                    if (synthesized) playSample(synthesized);
                    else playAudioSlice(sample.uri, sample.startMs, sample.endMs);
                  });
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

      {step === 'level' ? (
        <>
          <View style={styles.list}>
            {LEVELS.map((value) => (
              <OptionRow
                key={value}
                nativeName={value}
                localizedName={t(LEVEL_DESC_KEYS[value])}
                selected={state.level === value}
                onPress={() => set('level', value)}
              />
            ))}
          </View>

          {/* The helper. A CEFR band is meaningless to most people; a
              sentence in the language they are about to read is not. */}
          {samples ? (
            <View style={styles.helper}>
              <Pressable
                onPress={() => setShowSamples(!showSamples)}
                accessibilityRole="button"
                testID="onboarding-not-sure"
                hitSlop={space.sm}
                style={[styles.helperToggle, webCursor]}
              >
                <Text role="ui" size={15} color="ink2" style={styles.underline}>
                  {t(showSamples ? 'onboarding.level.hideSamples' : 'onboarding.level.notSure')}
                </Text>
              </Pressable>
              {showSamples ? (
                <View style={styles.samples} testID="onboarding-samples">
                  <Text role="caption" color="ink2">
                    {t('onboarding.level.samplesHint')}
                  </Text>
                  {LEVELS.map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => {
                        set('level', value);
                        setShowSamples(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: state.level === value }}
                      style={webCursor}
                    >
                      <Card style={styles.sampleCard}>
                        <SectionEyebrow>{value}</SectionEyebrow>
                        {samples[value].map((sentence) => (
                          <Text key={sentence} role="reading" size={16}>
                            {sentence}
                          </Text>
                        ))}
                      </Card>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      {step === 'explanationLocale'
        ? renderOptions(EXPLANATION_LANGUAGES, state.explanationLocale, (code) =>
            set('explanationLocale', code),
          )
        : null}

      <View style={[styles.footer, { paddingHorizontal: gutter, paddingBottom: space.lg }]}>
        <Button
          title={t(
            stepIndex === ONBOARDING_STEPS.length - 1 ? 'onboarding.finish' : 'common.continue',
          )}
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
    helper: {
      marginTop: space.lg,
      gap: space.md,
    },
    helperToggle: {
      alignSelf: 'flex-start',
      minHeight: space.tapTarget,
      justifyContent: 'center',
    },
    underline: {
      textDecorationLine: 'underline',
    },
    samples: {
      gap: space.md,
    },
    sampleCard: {
      gap: space.xs,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: space.md,
      backgroundColor: colors.canvas,
      gap: space.sm,
    },
    secondary: {
      alignSelf: 'center',
      minHeight: space.tapTarget,
      justifyContent: 'center',
    },
  });
}
