/**
 * Web Persistence adapter: idb-keyval (IndexedDB) — CONTRACTS.md §4.
 */
import { del, get, set } from 'idb-keyval';
import type { Persistence } from './persistence.types';

export const persistence: Persistence = {
  async getItem(key) {
    const value = await get<string>(key);
    return value ?? null;
  },
  async setItem(key, value) {
    await set(key, value);
  },
  async removeItem(key) {
    await del(key);
  },
};
