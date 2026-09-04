import { useRouter } from 'expo-router';
import { setUiCatalog } from '../../src/i18n/useT';
import { setPreference, usePreferences } from '../../src/ui/data';
import { LanguageListScreen } from '../../src/ui/LanguageListScreen';
import { APP_LANGUAGES } from '../../src/ui/languages';

export default function AppLanguageScreen() {
  const router = useRouter();
  const preferences = usePreferences();
  return (
    <LanguageListScreen
      titleKey="onboarding.step.appLanguage"
      options={APP_LANGUAGES}
      selectedCode={preferences.interfaceLocale}
      onSelect={(code) => {
        setPreference('interfaceLocale', code);
        setUiCatalog(code);
        router.back();
      }}
    />
  );
}
