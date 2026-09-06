/**
 * `/onboarding/level` — kept as a redirect (run 7 lane C).
 *
 * The level is now step 3 of `/onboarding`, with the "not sure?" helper that
 * this screen never had. Kept as a forward rather than deleted so an existing
 * link or a browser history entry lands somewhere sensible.
 */
import { Redirect } from 'expo-router';

export default function OnboardingLevelRedirect() {
  return <Redirect href="/onboarding" />;
}
