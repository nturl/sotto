import { useRouter } from 'expo-router';
import { setPreference, usePreferences } from '../../src/ui/data';
import { LanguageListScreen } from '../../src/ui/LanguageListScreen';
import { LEARNING_LANGUAGES } from '../../src/ui/languages';

export default function LearningLanguageScreen() {
  const router = useRouter();
  const preferences = usePreferences();
  return (
    <LanguageListScreen
      titleKey="onboarding.step.learning"
      options={LEARNING_LANGUAGES}
      selectedCode={preferences.learningLocale}
      onSelect={(code) => {
        setPreference('learningLocale', code);
        router.back();
      }}
    />
  );
}
