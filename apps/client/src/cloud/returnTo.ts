/**
 * Where a sign-in link should land (run 7 lane C). The client half of
 * sotto-cloud's `src/auth/returnTo.ts`, deliberately the same rule written
 * twice rather than one rule trusted from one side: the server refuses an
 * off-origin destination outright (400), and this refuses to send one, so a
 * stray `?returnTo=` in the address bar quietly becomes the default instead
 * of failing the learner's send.
 */

/** The completion screen. It is the only screen that knows whether this
 * learner has onboarded, so it is where the choice between `/onboarding` and
 * home is made — see `resolveSignedInDestination`. */
export const DEFAULT_RETURN_TO = '/account/magic';

const MAX_LENGTH = 512;

/** Whitespace and C0/C1 controls; a browser strips CR, LF and TAB from a URL
 * before resolving it, so a value containing one is not the value that would
 * actually be followed. */
function hasUnsafeCharacter(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * Returns the path unchanged when it can only resolve against this origin,
 * and null otherwise. Accepts the array shape expo-router hands back for a
 * repeated query parameter.
 */
export function safeReturnPath(raw: string | string[] | undefined | null): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_LENGTH) return null;
  if (value[0] !== '/') return null;
  // `//host` and `/\host` are both "same scheme, different host" to a browser.
  if (value[1] === '/' || value[1] === '\\') return null;
  if (value.includes('\\')) return null;
  if (hasUnsafeCharacter(value)) return null;
  if (/^\/%2f/i.test(value) || /^\/%5c/i.test(value)) return null;
  return value;
}

/** What to send as `returnTo` when asking for a sign-in link. */
export function signInReturnTo(raw: string | string[] | undefined | null): string {
  return safeReturnPath(raw) ?? DEFAULT_RETURN_TO;
}
