import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { setPreference } from '../../src/ui/data';
import { SpeakerGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { APP_LANGUAGES, EXPLANATION_LANGUAGES, LEARNING_LANGUAGES, SCRIPT_OPTIONS, localizedName, type LanguageOption } from '../../src/ui/languages';
import { OptionRow } from '../../src/ui/OptionRow';
import { SectionEyebrow } from '../../src/ui/SectionEyebrow';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { setUiCatalog } from '../../src/i18n/useT';

type Step = 0 | 1 | 2;

const STEP_TITLES = ['onboarding.step.appLanguage', 'onboarding.step.explainIn', 'onboarding.step.learning'] as const;

export default function OnboardingLanguagesScreen() {
  const t = useT();
  const router = useRouter();
  const { gutter } = useLayoutMetrics();
  const [step, setStep] = useState<Step>(0);
  const [appLanguage, setAppLanguage] = useState('fr');
  const [explanation, setExplanation] = useState('en');
  const [learning, setLearning] = useState('fr-FR');
  const [script, setScript] = useState('zh-CN');

  const advance = () => {
    if (step < 2) {
      setStep((step + 1) as Step);
      return;
    }
    setPreference('interfaceLocale', appLanguage);
    setPreference('explanationLocale', explanation);
    setPreference('learningLocale', learning === 'zh' ? script : learning);
    setUiCatalog(appLanguage);
    router.push('/onboarding/level');
  };

  const renderOptions = (options: LanguageOption[], selected: string, onSelect: (code: string) => void) => (
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
    <Shell contentBottomPadding={120}>
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
          <View style={styles.voiceRow}>
            <IconButton
              variant="ring"
              icon={<SpeakerGlyph size={16} color={colors.accent} />}
              accessibilityLabel={t('onboarding.a11y.playSample')}
              // Stub: the voice sample arrives with the audio pipeline (WS-4/5).
              onPress={() => undefined}
            />
            <Text role="ui" size={13} color="ink2">
              {t('onboarding.voiceSample')}
            </Text>
          </View>
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
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.md,
    backgroundColor: colors.canvas,
  },
});
