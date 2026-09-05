/**
 * Key storage on web (byokKey.ts).
 *
 * The repo's vitest run has no jsdom environment, so `localStorage` is
 * stubbed rather than provided by a DOM — the module reads
 * `globalThis.localStorage` at call time, so the stub exercises exactly the
 * branch a browser takes. The native branch (`expo-secure-store`) can't be
 * unit-tested here: importing an Expo native module outside an RN host
 * throws, which is why byokKey.ts loads it lazily and falls back to null.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BYOK_STORAGE_KEY,
  cachedByokKey,
  getByokKey,
  hasByokKey,
  maskKey,
  removeByokKey,
  setByokKey,
} from './byokKey';

function fakeLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

let storage: Storage;

beforeEach(() => {
  storage = fakeLocalStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(async () => {
  await removeByokKey();
  vi.unstubAllGlobals();
});

describe('byokKey (web)', () => {
  it('round-trips a key through localStorage under one clearly-named key', async () => {
    expect(await hasByokKey()).toBe(false);
    await setByokKey('sk-test-value');
    expect(storage.getItem(BYOK_STORAGE_KEY)).toBe('sk-test-value');
    expect(BYOK_STORAGE_KEY).toBe('sotto.byok.openaiKey');
    expect(await getByokKey()).toBe('sk-test-value');
    expect(await hasByokKey()).toBe(true);
  });

  it('trims a pasted key', async () => {
    await setByokKey('  sk-padded  \n');
    expect(await getByokKey()).toBe('sk-padded');
  });

  it('removes the key and clears the sync cache pickProvider reads', async () => {
    await setByokKey('sk-test-value');
    expect(cachedByokKey()).toBe('sk-test-value');
    await removeByokKey();
    expect(storage.getItem(BYOK_STORAGE_KEY)).toBeNull();
    expect(cachedByokKey()).toBeNull();
    expect(await hasByokKey()).toBe(false);
  });

  it('treats an empty/whitespace value as a removal, never storing it', async () => {
    await setByokKey('sk-test-value');
    await setByokKey('   ');
    expect(storage.getItem(BYOK_STORAGE_KEY)).toBeNull();
  });

  it('warms the sync cache on read, so pickProvider can build the provider', async () => {
    storage.setItem(BYOK_STORAGE_KEY, 'sk-from-a-previous-session');
    await getByokKey();
    expect(cachedByokKey()).toBe('sk-from-a-previous-session');
  });

  it('masks to the constant prefix only — no key-derived characters at all', () => {
    const masked = maskKey('sk-proj-0123456789abcdef');
    expect(masked).toBe('sk-••••••••');
    // Not even a tail: nothing after the constant `sk-` comes from the key.
    expect(masked.slice(3)).not.toMatch(/[0-9a-z]/i);
    expect(maskKey('short')).toBe('••••••••');
  });

  it('degrades to "no key" when storage access throws (blocked site data)', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage);
    expect(await getByokKey()).toBeNull();
    expect(await hasByokKey()).toBe(false);
  });
});
