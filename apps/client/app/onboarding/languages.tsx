/**
 * `/onboarding/languages` — kept as a redirect (run 7 lane C).
 *
 * This used to be the "full wizard" escape from the fast path: three in-screen
 * language steps that then pushed `/onboarding/level`. Onboarding asks the
 * learning language itself (run 10: it is step 1 of 2), and Settings owns the
 * other two, so there is nothing separate to escape to.
 *
 * The route stays because links to it exist in the wild (and in a browser's
 * history); it forwards rather than 404s.
 */
import { Redirect } from 'expo-router';

export default function OnboardingLanguagesRedirect() {
  return <Redirect href="/onboarding" />;
}
