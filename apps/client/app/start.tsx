/**
 * `/start` — the landing page's "Try a sample".
 *
 * Deliberately NOT the same as `/` any more (run 7 lane C, CONFIRM 23). `/`
 * offers a stranger an account first; this is the other door, the one that
 * says "read something now, no account". So it goes straight to onboarding
 * whatever the account state is, on either origin.
 *
 * A guest who comes through here and signs in later keeps everything: it is
 * the same origin and the same IndexedDB, and signing in never touches the
 * store (sotto-cloud `docs/accounts-and-guest-data.md`).
 */
import { Redirect } from 'expo-router';
import { usePreferences } from '../src/ui/data';

export default function Start() {
  const preferences = usePreferences();
  return <Redirect href={preferences.onboarded ? '/(tabs)/home' : '/onboarding'} />;
}
