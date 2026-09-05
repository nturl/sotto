/**
 * Finding 5 (adversarial review 3, HIGH): on a static web deploy,
 * `serverUrl()` (state/contentApi.ts) resolves to the page's own origin —
 * on a host like sotto-steel.vercel.app that means an import upload
 * leaves the device for a third-party host that never processes it,
 * contradicting docs/importing-books.md's "lives only in your device's
 * local storage" and "runs all of this against your own local model
 * stack". This is a pure, unit-testable predicate for "is it honest to
 * start a local import against this serverUrl right now" — kept separate
 * from app/import/index.tsx so it can be tested without any RN/Expo
 * dependency.
 */

const LOOPBACK_HOSTNAME_RE = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/;

/** Whether `url` points at a loopback host (the only host apps/server's
 * local import route can actually be reached at). */
export function isLoopbackServerUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return LOOPBACK_HOSTNAME_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Whether it is honest to start a *local* import against `serverUrl`:
 * either the URL is loopback (the local server is genuinely reachable at
 * that address), or the caller explicitly configured a non-default server
 * URL via EXPO_PUBLIC_SERVER_URL (a deliberate choice — e.g. a phone
 * pointed at a LAN dev machine — not the static-deploy fallback that
 * silently resolves to the page's own origin).
 */
export function canImportLocally(serverUrl: string, explicitlyConfigured: boolean): boolean {
  if (isLoopbackServerUrl(serverUrl)) return true;
  return explicitlyConfigured;
}
