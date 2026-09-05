/**
 * Where the learner's own OpenAI key lives (lane R4-B2, docs/byok.md).
 *
 * Rules this module exists to enforce, all of them from the R4-B2 task card:
 *  - The key is stored ON THIS DEVICE ONLY. Web: `localStorage` under one
 *    clearly-named key. Native: `expo-secure-store` (the Keychain/Keystore),
 *    never AsyncStorage.
 *  - It is NEVER put in the Zustand persisted store. That store is exported
 *    by Profile > Export and synced/imported wholesale (packages/core's
 *    export.ts); a credential must not ride along in a file the learner
 *    emails to themselves.
 *  - It is NEVER logged. Nothing here prints, and callers get the value back
 *    only to put it in an `Authorization` header.
 *
 * Platform split is by feature detection rather than the repo's usual
 * `.web.ts`/`.native.ts` pair, so the module can be unit-tested directly
 * under vitest/jsdom (which has `localStorage` and no Expo host) without a
 * Metro-style resolver. `expo-secure-store` is imported lazily for the same
 * reason `persistence.native.ts` lazy-loads its store: importing an Expo
 * native module outside a real RN host throws.
 */

/** The one storage key. Named so it is obvious in devtools what it holds. */
export const BYOK_STORAGE_KEY = 'sotto.byok.openaiKey';

type SecureStoreLike = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

function webStorage(): Storage | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    return storage ?? null;
  } catch {
    // Safari in a blocked-storage context throws on the property access.
    return null;
  }
}

let secureStorePromise: Promise<SecureStoreLike | null> | undefined;

function loadSecureStore(): Promise<SecureStoreLike | null> {
  if (!secureStorePromise) {
    secureStorePromise = import('expo-secure-store')
      .then((mod) => mod as unknown as SecureStoreLike)
      .catch(() => null);
  }
  return secureStorePromise;
}

/**
 * Last value `getByokKey`/`setByokKey` saw, so `pickProvider`
 * (sessionManager.ts) — which is synchronous and cannot await native secure
 * storage — can build the provider. The availability gate always calls
 * `hasByokKey()` before a session is started, so this is warm by then; when
 * it isn't (the key was removed mid-session), `pickProvider` says so rather
 * than guessing. In memory only, cleared on `removeByokKey`.
 */
let cached: string | null = null;

/** The cached key, if `getByokKey()` has run since the app loaded. */
export function cachedByokKey(): string | null {
  return cached;
}

/** The stored key, or null. Callers must not log or persist the result. */
export async function getByokKey(): Promise<string | null> {
  const storage = webStorage();
  if (storage) {
    try {
      cached = storage.getItem(BYOK_STORAGE_KEY);
      return cached;
    } catch {
      return null;
    }
  }
  const secure = await loadSecureStore();
  if (!secure) return null;
  try {
    cached = await secure.getItemAsync(BYOK_STORAGE_KEY);
    return cached;
  } catch {
    return null;
  }
}

/** Stores the key on this device. Trims surrounding whitespace, which is
 * the single most common paste error; stores nothing else. */
export async function setByokKey(key: string): Promise<void> {
  const value = key.trim();
  if (!value) return removeByokKey();
  cached = value;
  const storage = webStorage();
  if (storage) {
    // A browser with site data blocked throws on write as well as on read.
    try {
      storage.setItem(BYOK_STORAGE_KEY, value);
    } catch {
      // The in-memory `cached` value still carries this session.
    }
    return;
  }
  const secure = await loadSecureStore();
  await secure?.setItemAsync(BYOK_STORAGE_KEY, value);
}

export async function removeByokKey(): Promise<void> {
  cached = null;
  const storage = webStorage();
  if (storage) {
    try {
      storage.removeItem(BYOK_STORAGE_KEY);
    } catch {
      // Nothing was stored to begin with — see setByokKey.
    }
    return;
  }
  const secure = await loadSecureStore();
  await secure?.deleteItemAsync(BYOK_STORAGE_KEY);
}

/** Whether a key is stored — the availability gate's whole question. Reads
 * the value but returns only a boolean, so nothing else has to touch it. */
export async function hasByokKey(): Promise<boolean> {
  return !!(await getByokKey());
}

/**
 * For display: `sk-••••••••`. Never render the raw key, and deliberately not
 * a tail either — the usual "last four characters" affordance exists to tell
 * several stored credentials apart, and there is only ever one key here, so
 * those characters would buy nothing and would leak into screenshots,
 * support threads and evidence logs. Only the constant `sk-` prefix (or the
 * first three characters of whatever was pasted) survives.
 */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 3)}••••••••`;
}
