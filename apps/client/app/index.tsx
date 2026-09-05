import { Redirect } from 'expo-router';
import { usePreferences } from '../src/ui/data';

export default function Index() {
  const preferences = usePreferences();
  return <Redirect href={preferences.onboarded ? '/(tabs)/home' : '/onboarding'} />;
}
