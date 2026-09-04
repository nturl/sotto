import { describe, expect, it } from 'vitest';
import { buildExport, parseImport, type ExportState } from './export.ts';
import { initialReview } from './review.ts';

const NOW = new Date('2026-09-04T12:00:00.000Z');

function makeState(): ExportState {
  return {
    preferences: {
      interfaceLocale: 'en',
      explanationLocale: 'en',
      learningLocale: 'fr-FR',
      level: 'A1',
      immersionMode: false,
      defaultTutorMode: 'read_to_me',
      captionsEnabled: true,
      turnDetection: 'auto',
      correctionFrequency: 'normal',
      speakingPace: 'normal',
      narrationSpeed: 1,
      onboarded: true,
    },
    progress: [
      {
        bookId: 'fr-petit-chaperon-rouge',
        chapterId: 'fr-petit-chaperon-rouge-01',
        audioPositionMs: 0,
        percentComplete: 0.5,
        updatedAt: NOW.toISOString(),
      },
    ],
    savedWords: [
      {
        id: 'w1',
        bookId: 'fr-petit-chaperon-rouge',
        chapterId: 'fr-petit-chaperon-rouge-01',
        tokenId: 'b1.s1.t1',
        sentenceId: 'b1.s1',
        sourceLocale: 'fr-FR',
        explanationLocale: 'en',
        sourceWord: 'renard',
        normalizedWord: 'renard',
        translation: 'fox',
        contextSentence: 'Le petit renard sort de sa tanière.',
        savedAt: NOW.toISOString(),
        review: initialReview(NOW),
      },
    ],
    completedBooks: [],
    sessions: [],
  };
}

describe('buildExport / parseImport round trip', () => {
  it('builds a valid export file that parseImport accepts', () => {
    const file = buildExport(makeState(), NOW);
    expect(file.format).toBe('sotto-export');
    expect(file.version).toBe(1);
    expect(file.exportedAt).toBe(NOW.toISOString());

    const result = parseImport(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(file);
    }
  });

  it('rejects version > 1 with the import.unsupportedVersion message key', () => {
    const file = buildExport(makeState(), NOW);
    const result = parseImport({ ...file, version: 2 });
    expect(result).toEqual({ ok: false, error: 'import.unsupportedVersion' });
  });

  it('rejects malformed payloads without throwing', () => {
    const result = parseImport({ not: 'an export file' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-object input without throwing', () => {
    expect(parseImport(null).ok).toBe(false);
    expect(parseImport('nope').ok).toBe(false);
    expect(parseImport(42).ok).toBe(false);
  });
});
