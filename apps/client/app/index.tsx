/**
 * `/` — the one decision every arrival passes through.
 *
 * It used to be `preferences.onboarded ? home : onboarding`, on both origins,
 * with no idea whether anyone was signed in. That is why "Sign in" on the
 * landing page felt like it jumped into the app: the link points at the paid
 * origin's root, and the root walked a stranger straight into onboarding
 * (run 7, ground truth 4). The rule now lives in `resolveRootDestination`,
 * where it is testable; a build with no CloudAdapter — the free origin, every
 * OSS build — keeps exactly the behaviour it has today.
 */
import { Redirect } from 'expo-router';
import { useCloud } from '../src/cloud/provider';
import { resolveRootDestination } from '../src/cloud/destination';
import { useMe } from '../src/cloud/useMe';
import { usePreferences } from '../src/ui/data';

export default function Index() {
  const preferences = usePreferences();
  const cloud = useCloud();
  const me = useMe();
  const destination = resolveRootDestination({
    cloudEnabled: cloud.enabled,
    me: me.status,
    onboarded: preferences.onboarded,
  });
  // Null means the account state is still loading and any answer would be a
  // guess that flashes the wrong screen. Render nothing for that beat.
  if (!destination) return null;
  return <Redirect href={destination} />;
}
