/**
 * Web Persistence adapter: idb-keyval (IndexedDB) — CONTRACTS.md §4.
 */
import { del, get, set } from 'idb-keyval';
import type { Persistence } from './persistence.types';

const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sotto-reading-data') : null;

export const persistence: Persistence = {
  subscribe(listener) {
    const message = (event: MessageEvent) => {
      if (typeof event.data === 'string') listener(event.data);
    };
    const focus = () => listener('sotto.vocabulary');
    channel?.addEventListener('message', message);
    window.addEventListener('focus', focus);
    return () => {
      channel?.removeEventListener('message', message);
      window.removeEventListener('focus', focus);
    };
  },
  async getItem(key) {
    const value = await get<string>(key);
    return value ?? null;
  },
  async setItem(key, value) {
    await set(key, value);
    channel?.postMessage(key);
  },
  async removeItem(key) {
    await del(key);
    channel?.postMessage(key);
  },
};
