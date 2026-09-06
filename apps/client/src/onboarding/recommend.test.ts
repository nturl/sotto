import { describe, expect, it } from 'vitest';
import type { BookLevel, BookSummary } from '@sotto/core';
import { recommendBook } from './recommend';

function book(bookId: string, level: BookLevel, estimatedMinutes = 10): BookSummary {
  return {
    bookId,
    contentLocale: 'fr-FR',
    title: bookId,
    author: 'x',
    level,
    categories: [],
    estimatedMinutes,
    localizedTitles: {},
    premise: {},
    reviewStatus: 'draft',
    cover: '',
    chapterCount: 1,
  } as BookSummary;
}

describe('recommendBook', () => {
  it('picks a book at the learner’s level when there is one', () => {
    const picked = recommendBook(
      [book('hard', 'C1'), book('right', 'A2'), book('easy', 'A0')],
      'A2',
    );
    expect(picked?.bookId).toBe('right');
  });

  it('prefers slightly easy over slightly hard', () => {
    const picked = recommendBook([book('harder', 'B1'), book('easier', 'A1')], 'A2');
    expect(picked?.bookId).toBe('easier');
  });

  it('takes something harder when there is nothing at or below the level', () => {
    expect(recommendBook([book('b2', 'B2'), book('c1', 'C1')], 'A1')?.bookId).toBe('b2');
  });

  it('breaks a tie on length — a first book should be finishable', () => {
    const picked = recommendBook([book('long', 'A1', 40), book('short', 'A1', 8)], 'A1');
    expect(picked?.bookId).toBe('short');
  });

  it('is stable when level and length both tie', () => {
    const books = [book('b', 'A1', 10), book('a', 'A1', 10)];
    expect(recommendBook(books, 'A1')?.bookId).toBe('a');
    expect(recommendBook([...books].reverse(), 'A1')?.bookId).toBe('a');
  });

  it('returns nothing for an empty shelf, so the screen can say so', () => {
    expect(recommendBook([], 'A1')).toBeUndefined();
  });
});
