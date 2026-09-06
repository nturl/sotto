/**
 * `/profile` → `/settings` (run 7, lane E: the Settings hub moved from
 * `app/profile.tsx` to `app/settings/index.tsx`). Kept as a redirect so any
 * existing link, bookmark, or nav-rail entry that still points at `/profile`
 * (this lane does not own the nav components that might reference it) keeps
 * working rather than 404ing.
 */
import { Redirect } from 'expo-router';

export default function ProfileRedirectScreen() {
  return <Redirect href="/settings" />;
}
