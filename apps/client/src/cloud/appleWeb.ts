/**
 * "Sign in with Apple JS" — the web equivalent of `expo-apple-authentication`
 * (ACCOUNT.md §1: "Sign in with Apple ... the platform-supplied button").
 * Loads Apple's hosted `appleid.auth.js` once, then runs the popup flow and
 * resolves the `id_token` (the web analogue of native's `identityToken`) so
 * `app/account/index.tsx` can call `cloud.signInWithApple(token, 'web')`
 * with the same shape on every platform.
 *
 * Requires a Services ID (`EXPO_PUBLIC_APPLE_WEB_CLIENT_ID`) and a
 * registered redirect URI (`EXPO_PUBLIC_APPLE_WEB_REDIRECT_URI`) from an
 * Apple Developer account — neither exists yet (DECISIONS.md "Environment
 * state": no dev team configured), so this throws a clear, typed error
 * until docs/app-store.md's setup steps are done. Everything else
 * (script loading, the `AppleID.auth.init/signIn` call shape) is real and
 * ready to run the moment those two env vars are set.
 */
const SDK_URL =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

type AppleIdAuth = {
  init(config: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }): void;
  signIn(): Promise<{ authorization: { id_token: string; code: string } }>;
};

declare global {
  interface Window {
    AppleID?: { auth: AppleIdAuth };
  }
}

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) {
      reject(new Error('Apple Sign-In JS requires a DOM (web only).'));
      return;
    }
    const existing = doc.getElementById('appleid-signin-script');
    if (existing) {
      resolve();
      return;
    }
    const script = doc.createElement('script');
    script.id = 'appleid-signin-script';
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Apple Sign-In JS.'));
    doc.head.appendChild(script);
  });
  return sdkPromise;
}

export class AppleWebNotConfiguredError extends Error {
  constructor() {
    super('Apple Sign-In on web is not configured (see docs/app-store.md).');
    this.name = 'AppleWebNotConfiguredError';
  }
}

/** Resolves the id_token from a completed Apple Sign-In JS popup flow. */
export async function signInWithAppleWeb(): Promise<string> {
  const clientId = process.env.EXPO_PUBLIC_APPLE_WEB_CLIENT_ID;
  const redirectURI = process.env.EXPO_PUBLIC_APPLE_WEB_REDIRECT_URI;
  if (!clientId || !redirectURI) throw new AppleWebNotConfiguredError();

  await loadSdk();
  const win = globalThis as unknown as Window;
  if (!win.AppleID) throw new Error('Apple Sign-In JS did not initialize.');

  win.AppleID.auth.init({ clientId, scope: 'email name', redirectURI, usePopup: true });
  const res = await win.AppleID.auth.signIn();
  return res.authorization.id_token;
}
