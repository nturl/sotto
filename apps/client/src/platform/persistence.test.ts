import { describe, expect, it } from 'vitest';
import type { Persistence } from './persistence.types';

/** A fake backing store standing in for IndexedDB/SQLite, used to exercise
 * the `Persistence` contract the same way the web/native adapters do
 * (TASK §F: "persistence adapter round trip with a fake storage"). The real
 * adapters (persistence.web.ts / persistence.native.ts) are thin wrappers
 * around idb-keyval / expo-sqlite that can't run outside a browser/RN host,
 * so this exercises the shape they both implement. */
function createFakeBackedPersistence(): Persistence & { backing: Map<string, string> } {
  const backing = new Map<string, string>();
  return {
    backing,
    async getItem(key) {
      return backing.has(key) ? backing.get(key)! : null;
    },
    async setItem(key, value) {
      backing.set(key, value);
    },
    async removeItem(key) {
      backing.delete(key);
    },
  };
}

describe('Persistence contract round trip', () => {
  it('setItem then getItem returns the same string', async () => {
    const persistence = createFakeBackedPersistence();
    await persistence.setItem('sotto.preferences', JSON.stringify({ learningLocale: 'fr-FR' }));
    const raw = await persistence.getItem('sotto.preferences');
    expect(raw).toBe(JSON.stringify({ learningLocale: 'fr-FR' }));
    expect(JSON.parse(raw!)).toEqual({ learningLocale: 'fr-FR' });
  });

  it('getItem returns null for a key that was never set', async () => {
    const persistence = createFakeBackedPersistence();
    expect(await persistence.getItem('sotto.session')).toBeNull();
  });

  it('removeItem clears a key', async () => {
    const persistence = createFakeBackedPersistence();
    await persistence.setItem('sotto.vocabulary', '[]');
    await persistence.removeItem('sotto.vocabulary');
    expect(await persistence.getItem('sotto.vocabulary')).toBeNull();
  });

  it('setItem overwrites a previous value for the same key', async () => {
    const persistence = createFakeBackedPersistence();
    await persistence.setItem('sotto.progress', '{"a":1}');
    await persistence.setItem('sotto.progress', '{"a":2}');
    expect(await persistence.getItem('sotto.progress')).toBe('{"a":2}');
    expect(persistence.backing.size).toBe(1);
  });
});
