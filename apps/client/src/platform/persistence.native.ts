/**
 * Native Persistence adapter: expo-sqlite kv-store — CONTRACTS.md §4.
 *
 * Loads `expo-sqlite/kv-store` lazily (on first actual read/write) rather
 * than at module import time: that module registers a native Expo module,
 * which throws outside a real RN/Expo host (e.g. under vitest — see
 * platform/persistence.test.ts, which exercises the shared `Persistence`
 * contract against a fake instead of this file directly). Falling back to
 * an in-memory Map on failure means an accidental import from a non-native
 * context degrades instead of crashing.
 */
import type { Persistence } from './persistence.types';

type KvStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

let storagePromise: Promise<KvStorage | null> | undefined;

function loadStorage(): Promise<KvStorage | null> {
  if (!storagePromise) {
    storagePromise = import('expo-sqlite/kv-store')
      .then((mod) => (mod as { default?: KvStorage }).default ?? (mod as unknown as KvStorage))
      .catch(() => null);
  }
  return storagePromise;
}

const memoryFallback = new Map<string, string>();

export const persistence: Persistence = {
  async getItem(key) {
    const storage = await loadStorage();
    if (!storage) return memoryFallback.get(key) ?? null;
    return storage.getItem(key);
  },
  async setItem(key, value) {
    const storage = await loadStorage();
    if (!storage) {
      memoryFallback.set(key, value);
      return;
    }
    await storage.setItem(key, value);
  },
  async removeItem(key) {
    const storage = await loadStorage();
    if (!storage) {
      memoryFallback.delete(key);
      return;
    }
    await storage.removeItem(key);
  },
};
