import { useRouter } from 'expo-router';
import { setPreference, usePreferences } from '../../src/ui/data';
import { LanguageListScreen } from '../../src/ui/LanguageListScreen';
import { EXPLANATION_LANGUAGES } from '../../src/ui/languages';

export default function ExplanationLanguageScreen() {
  const router = useRouter();
  const preferences = usePreferences();
  return (
    <LanguageListScreen
      titleKey="onboarding.step.explainIn"
      options={EXPLANATION_LANGUAGES}
      selectedCode={preferences.explanationLocale}
      onSelect={(code) => {
        setPreference('explanationLocale', code);
        router.back();
      }}
    />
  );
}
