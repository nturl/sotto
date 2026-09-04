import { describe, expect, it } from 'vitest';
import type { BookSummary, ReadingProgress, SavedWord } from '@sotto/core';
import {
  filterByCategory,
  filterByLevel,
  searchBooks,
  selectBooksWithVocabulary,
  selectContinueBooks,
  selectDueWords,
  selectNewBooks,
  selectProgressPercent,
  selectRecommendedBooks,
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
