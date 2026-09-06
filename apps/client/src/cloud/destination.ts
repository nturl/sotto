/**
 * Where a learner should be sent, given what we know about them (run 7 lane
 * C). Pure, because these two decisions are the whole of the "Sign in jumped
 * straight into the app" complaint (recording 1) and they should be provable
 * without mounting a screen.
 *
 * Before this run `app/index.tsx` redirected on the local `onboarded` flag
 * alone, so on the paid origin a stranger who clicked "Sign in" on the
 * landing page landed in onboarding with no account anywhere in sight. The
 * account state has to take part — but only where accounts exist, so a build
 * with no CloudAdapter (the free origin, every OSS build) keeps the exact
 * behaviour it has today.
 */
import { DEFAULT_RETURN_TO, safeReturnPath } from './returnTo';

/** The subset of `MeState['status']` this decision depends on. */
export type MeStatus = 'no-cloud' | 'loading' | 'signed-out' | 'signed-in';

export const HOME = '/(tabs)/home';
export const ONBOARDING = '/onboarding';
/** The create-account framing, as opposed to the returning-user one. */
export const CREATE_ACCOUNT = '/account?intent=start';

export interface RootDestinationInput {
  cloudEnabled: boolean;
  me: MeStatus;
  onboarded: boolean;
}

/**
 * The destination for `/`. Null means "not yet" — the account state is still
 * loading and any answer now would be a guess that flashes the wrong screen.
 */
export function resolveRootDestination({
  cloudEnabled,
  me,
  onboarded,
}: RootDestinationInput): string | null {
  if (onboarded) return HOME;
  // No accounts here: onboarding is the only thing a first visit can do.
  if (!cloudEnabled || me === 'no-cloud') return ONBOARDING;
  if (me === 'loading') return null;
  // Signed out and never set up: this is a stranger on the paid origin, and
  // the honest first screen is the one that offers them an account.
  if (me === 'signed-out') return CREATE_ACCOUNT;
  return ONBOARDING;
}

export interface SignedInDestinationInput {
  onboarded: boolean;
  returnTo?: string | string[] | null;
}

/**
 * Where a freshly signed-in learner goes. The server cannot decide this:
 * "onboarded" is a local preference, not an account fact, which is why the
 * magic link's default destination is the completion screen rather than a
 * final one.
 */
export function resolveSignedInDestination({
  onboarded,
  returnTo,
}: SignedInDestinationInput): string {
  const explicit = safeReturnPath(returnTo ?? null);
  // Sending the completion screen back to itself would loop forever.
  if (explicit && explicit !== DEFAULT_RETURN_TO) return explicit;
  return onboarded ? HOME : ONBOARDING;
}
