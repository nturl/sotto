/**
 * `/onboarding/level` — kept as a redirect (run 7 lane C).
 *
 * The level is now step 2 of `/onboarding`, asked with a sample sentence per
 * row rather than a bare band. Kept as a forward rather than deleted so an
 * existing link or a browser history entry lands somewhere sensible.
 */
import { Redirect } from 'expo-router';

export default function OnboardingLevelRedirect() {
  return <Redirect href="/onboarding" />;
}
