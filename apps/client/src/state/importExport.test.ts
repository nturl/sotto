import { describe, expect, it } from 'vitest';
import { buildExport, parseImport } from '@sotto/core';
import type { Persistence } from '../platform/persistence.types';
import { createSottoStore, DEFAULT_PREFERENCES } from './createStore';

function fakePersistence(): Persistence {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}

describe('profile export/import (CONTRACTS §3, TASK §F)', () => {
  it('rejects a version-2 export file without touching the store', async () => {
    const { useStore, hydrate } = createSottoStore(fakePersistence());
    await hydrate();
    useStore.getState().setPreference('learningLocale', 'es-419');

    const result = parseImport({
      format: 'sotto-export',
      version: 2,
      exportedAt: new Date().toISOString(),
    });
    expect(result).toEqual({ ok: false, error: 'import.unsupportedVersion' });

    // The store is untouched — profile.tsx never calls replaceUserData on a
    // rejected parse.
    expect(useStore.getState().preferences.learningLocale).toBe('es-419');
  });

  it('rejects malformed JSON that fails the ExportFile schema', async () => {
    const result = parseImport({ format: 'sotto-export', version: 1 });
    expect(result).toEqual({ ok: false, error: 'import.invalid' });
  });

  it('round-trips a real export through buildExport -> parseImport -> replaceUserData', async () => {
    const persistence = fakePersistence();
    const a = createSottoStore(persistence);
    await a.hydrate();
    a.useStore.getState().setPreference('learningLocale', 'it-IT');
    a.useStore.getState().setProgress({
      bookId: 'it-libro',
      chapterId: 'it-libro-01',
      audioPositionMs: 0,
      percentComplete: 0.2,
      updatedAt: new Date().toISOString(),
    });

    const exportFile = buildExport({
      preferences: a.useStore.getState().preferences,
      progress: Object.values(a.useStore.getState().progress),
      savedWords: a.useStore.getState().savedWords,
      completedBooks: a.useStore.getState().completedBooks,
      sessions: [],
    });

    const parsed = parseImport(JSON.parse(JSON.stringify(exportFile)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const b = createSottoStore(fakePersistence());
    await b.hydrate();
    b.useStore.getState().setPreference('learningLocale', 'fr-FR'); // pre-existing state, should be overwritten
    b.useStore.getState().replaceUserData({
      preferences: parsed.data.preferences,
      progress: parsed.data.progress,
      savedWords: parsed.data.savedWords,
      completedBooks: parsed.data.completedBooks,
    });

    expect(b.useStore.getState().preferences).toEqual({
      ...DEFAULT_PREFERENCES,
      learningLocale: 'it-IT',
    });
    expect(b.useStore.getState().progress['it-libro']?.percentComplete).toBe(0.2);
  });
});
