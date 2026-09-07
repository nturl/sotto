import { describe, expect, it } from 'vitest';
import { getLanguage } from '@sotto/core';
import type { BookSummary, Pack, ReadingProgress, SavedWord } from '@sotto/core';
import {
  filterByCategory,
  filterByLevel,
  isFilterEmpty,
  resolvePacksBanner,
  searchBooks,
  selectBooksWithVocabulary,
  selectContinueBooks,
  selectDueWords,
  selectNewBooks,
  selectProgressPercent,
  selectRecommendedBooks,
  selectSavedWordsForLocale,
  selectVocabularyForBook,
} from './selectors';

function book(partial: Partial<BookSummary> & { bookId: string }): BookSummary {
  return {
    contentLocale: 'fr-FR',
    title: partial.title ?? partial.bookId,
    author: 'Author',
    level: 'A1',
    categories: ['tales'],
    estimatedMinutes: 10,
    localizedTitles: { en: partial.title ?? partial.bookId },
    premise: { en: 'premise' },
    reviewStatus: 'draft',
    cover: 'cover.svg',
    chapterCount: 1,
    ...partial,
  };
}

const BOOKS: BookSummary[] = [
  book({ bookId: 'a', title: 'Le Chat botté', author: 'Charles Perrault', level: 'A1' }),
  book({ bookId: 'b', title: 'Fables', author: 'Jean de la Fontaine', level: 'A1' }),
  book({ bookId: 'c', title: 'Château', author: 'Someone', level: 'A2' }),
];

describe('search/filter selectors', () => {
  it('search matches title case- and diacritic-insensitively', () => {
    expect(searchBooks(BOOKS, 'chateau').map((b) => b.bookId)).toEqual(['c']);
    expect(searchBooks(BOOKS, 'CHÂTEAU').map((b) => b.bookId)).toEqual(['c']);
    expect(searchBooks(BOOKS, 'fontaine').map((b) => b.bookId)).toEqual(['b']);
    expect(searchBooks(BOOKS, '').length).toBe(BOOKS.length);
  });

  it('filterByCategory and filterByLevel narrow the list', () => {
    expect(filterByCategory(BOOKS, 'tales').map((b) => b.bookId)).toEqual(['a', 'b', 'c']);
    expect(filterByLevel(BOOKS, 'A2').map((b) => b.bookId)).toEqual(['c']);
  });
});

describe('rail selectors', () => {
  const progress: Record<string, ReadingProgress> = {
    a: {
      bookId: 'a',
      chapterId: 'a-01',
      audioPositionMs: 0,
      percentComplete: 0.5,
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  };

  it('continue = in-progress, most recent first; recommended = same level, not started; new = the rest', () => {
    const continuing = selectContinueBooks(BOOKS, progress, []);
    expect(continuing.map((b) => b.bookId)).toEqual(['a']);

    const recommended = selectRecommendedBooks(BOOKS, progress, 'A1');
    expect(recommended.map((b) => b.bookId)).toEqual(['b']);

    const fresh = selectNewBooks(BOOKS, progress, 'A1');
    expect(fresh.map((b) => b.bookId)).toEqual(['c']);
  });

  it('a completed book drops off the continue rail', () => {
    const continuing = selectContinueBooks(BOOKS, progress, ['a']);
    expect(continuing).toEqual([]);
  });

  it('selectProgressPercent defaults to 0 for an unseen book', () => {
    expect(selectProgressPercent(progress, 'a')).toBe(0.5);
    expect(selectProgressPercent(progress, 'z')).toBe(0);
  });
});

function word(partial: Partial<SavedWord> & { id: string; bookId: string }): SavedWord {
  return {
    chapterId: 'ch1',
    tokenId: 't1',
    sentenceId: 's1',
    sourceLocale: 'fr-FR',
    explanationLocale: 'en',
    sourceWord: 'mot',
    normalizedWord: 'mot',
    translation: 'word',
    contextSentence: 'Un mot.',
    savedAt: '2026-09-01T00:00:00.000Z',
    review: { ease: 2.5, intervalDays: 0, dueAt: '2020-01-01T00:00:00.000Z', reps: 0, lapses: 0 },
    ...partial,
  };
}

describe('vocabulary selectors', () => {
  const words = [
    word({ id: '1', bookId: 'a', savedAt: '2026-09-01T00:00:00.000Z' }),
    word({ id: '2', bookId: 'b', savedAt: '2026-09-03T00:00:00.000Z' }),
    word({ id: '3', bookId: 'a', savedAt: '2026-09-02T00:00:00.000Z' }),
  ];

  it('selectVocabularyForBook scopes to one book', () => {
    expect(selectVocabularyForBook(words, 'a').map((w) => w.id)).toEqual(['1', '3']);
  });

  it('selectBooksWithVocabulary orders books by most-recently-saved', () => {
    expect(selectBooksWithVocabulary(words)).toEqual(['b', 'a']);
  });

  it('selectDueWords uses the core scheduler due date', () => {
    const notDue = word({
      id: '4',
      bookId: 'a',
      review: { ease: 2.5, intervalDays: 5, dueAt: '2099-01-01T00:00:00.000Z', reps: 1, lapses: 0 },
    });
    const due = selectDueWords([...words, notDue], new Date('2026-09-04T00:00:00.000Z'));
    expect(due.map((w) => w.id).sort()).toEqual(['1', '2', '3']);
  });
});

function pack(partial: Partial<Pack> & { locale: string; books: BookSummary[] }): Pack {
  return {
    schemaVersion: 1,
    language: getLanguage(partial.locale),
    generatedAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  };
}

describe('selectSavedWordsForLocale (verification row 24)', () => {
  const frPack = pack({ locale: 'fr-FR', books: [book({ bookId: 'a' }), book({ bookId: 'b' })] });
  const esPack = pack({ locale: 'es-ES', books: [book({ bookId: 'z' })] });
  const packs = [frPack, esPack];

  const words = [
    word({ id: '1', bookId: 'a', savedAt: '2026-09-01T00:00:00.000Z' }),
    word({ id: '2', bookId: 'z', savedAt: '2026-09-02T00:00:00.000Z' }),
  ];

  it('keeps only words whose book belongs to the given locale pack', () => {
    expect(selectSavedWordsForLocale(words, packs, 'fr-FR').map((w) => w.id)).toEqual(['1']);
    expect(selectSavedWordsForLocale(words, packs, 'es-ES').map((w) => w.id)).toEqual(['2']);
  });

  it("switching locale back restores the other locale's words untouched", () => {
    const frWords = selectSavedWordsForLocale(words, packs, 'fr-FR');
    const esWords = selectSavedWordsForLocale(words, packs, 'es-ES');
    // Neither call mutates the shared `words` array — both locales' words
    // are still there in the underlying store data.
    expect(words.map((w) => w.id)).toEqual(['1', '2']);
    expect(frWords).not.toContain(words[1]);
    expect(esWords).not.toContain(words[0]);
  });

  it('an unknown locale (no matching pack) yields no words', () => {
    expect(selectSavedWordsForLocale(words, packs, 'de-DE')).toEqual([]);
  });
});

describe('resolvePacksBanner (Home/Library loading/error/empty states)', () => {
  it('idle and loading both read as "loading" (packs not resolved yet)', () => {
    expect(resolvePacksBanner('idle', 0)).toEqual({ kind: 'loading' });
    expect(resolvePacksBanner('loading', 0)).toEqual({ kind: 'loading' });
  });

  it('a failed fetch reads as "error", regardless of stale book count', () => {
    expect(resolvePacksBanner('error', 0)).toEqual({ kind: 'error' });
    expect(resolvePacksBanner('error', 5)).toEqual({ kind: 'error' });
  });

  it('ready with zero books for the locale+level reads as "emptyLevel"', () => {
    expect(resolvePacksBanner('ready', 0)).toEqual({ kind: 'emptyLevel' });
  });

  it('ready with books reads as "none" — normal render', () => {
    expect(resolvePacksBanner('ready', 3)).toEqual({ kind: 'none' });
  });
});

describe('isFilterEmpty (Library filter-yields-nothing state)', () => {
  it('is false when there are no rails to judge (nothing selected yet)', () => {
    expect(isFilterEmpty([])).toBe(false);
  });

  it('is false when at least one rail has books', () => {
    expect(isFilterEmpty([{ books: [] }, { books: [book({ bookId: 'a' })] }])).toBe(false);
  });

  it('is true when every rail is empty', () => {
    expect(isFilterEmpty([{ books: [] }, { books: [] }])).toBe(true);
  });
});

describe('selectRecommendedBooks level fallback', () => {
  const shelf = [
    book({ bookId: 'a0', level: 'A0' }),
    book({ bookId: 'a1', level: 'A1' }),
    book({ bookId: 'a2', level: 'A2' }),
    book({ bookId: 'b1', level: 'B1' }),
    book({ bookId: 'c1', level: 'C1' }),
  ];
  const none: Record<string, ReadingProgress> = {};
  const started = (bookId: string): Record<string, ReadingProgress> => ({
    [bookId]: {
      bookId,
      chapterId: `${bookId}-01`,
      audioPositionMs: 0,
      percentComplete: 0.3,
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  });

  it('prefers the exact level and never mixes neighbours in', () => {
    expect(selectRecommendedBooks(shelf, none, 'A2').map((b) => b.bookId)).toEqual(['a2']);
  });

  it('falls back to +/-1 when the exact level is all started', () => {
    const result = selectRecommendedBooks(shelf, started('a2'), 'A2');
    expect(result.map((b) => b.bookId).sort()).toEqual(['a1', 'b1']);
  });

  it('reaches +/-2 only when +/-1 is empty too', () => {
    const sparse = [book({ bookId: 'a0', level: 'A0' }), book({ bookId: 'b1', level: 'B1' })];
    expect(selectRecommendedBooks(sparse, none, 'A2').map((b) => b.bookId)).toEqual(['b1']);
    const farther = [book({ bookId: 'c1', level: 'C1' })];
    expect(selectRecommendedBooks(farther, none, 'B1').map((b) => b.bookId)).toEqual(['c1']);
  });

  it('never recommends a started book, at any distance', () => {
    const only = [book({ bookId: 'b1', level: 'B1' })];
    expect(selectRecommendedBooks(only, started('b1'), 'A2')).toEqual([]);
  });

  it('returns nothing when no book is within two levels', () => {
    const far = [book({ bookId: 'c1', level: 'C1' })];
    expect(selectRecommendedBooks(far, none, 'A0')).toEqual([]);
  });
});
