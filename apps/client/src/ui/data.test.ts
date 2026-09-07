import { describe, expect, it } from 'vitest';
import type { BookSummary, UserPreferences } from '@sotto/core';
import { pickDailyBook, toLibraryBook } from './data';

function book(partial: Partial<BookSummary> & { bookId: string }): BookSummary {
  return {
    contentLocale: 'es-419',
    title: 'Alicia cae en la madriguera del conejo',
    author: 'Lewis Carroll',
    level: 'A1',
    categories: ['tales'],
    estimatedMinutes: 10,
    localizedTitles: {
      en: 'Alice Falls Down the Rabbit Hole',
      fr: 'Alice tombe dans le terrier du lapin',
      es: 'Alicia cae en la madriguera del conejo',
    },
    premise: { en: 'premise' },
    reviewStatus: 'draft',
    cover: 'cover.svg',
    chapterCount: 1,
    ...partial,
  };
}

function preferences(
  partial: Partial<UserPreferences> & { interfaceLocale: string },
): UserPreferences {
  return {
    explanationLocale: 'en',
    learningLocale: 'es-419',
    level: 'A1',
    immersionMode: false,
    defaultTutorMode: 'read_to_me',
    captionsEnabled: true,
    turnDetection: 'auto',
    correctionFrequency: 'normal',
    speakingPace: 'normal',
    narrationSpeed: 1,
    onboarded: true,
    ...partial,
  };
}

describe('toLibraryBook title localization', () => {
  it("uses the localized title for the interface locale, not the book's native title", () => {
    const summary = book({ bookId: 'es-alice-rabbit-hole' });
    const prefs = preferences({ interfaceLocale: 'fr' });

    const result = toLibraryBook(summary, prefs, 0);

    expect(result.title).toBe('Alice tombe dans le terrier du lapin');
  });

  it('falls back to English when the interface locale has no translation', () => {
    const summary = book({ bookId: 'es-alice-rabbit-hole' });
    const prefs = preferences({ interfaceLocale: 'zh-Hans' });

    const result = toLibraryBook(summary, prefs, 0);

    expect(result.title).toBe('Alice Falls Down the Rabbit Hole');
  });
});

describe('pickDailyBook', () => {
  const shelf = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  // dayOfYear() for these dates: Jan 1 -> 1, Jan 2 -> 2, Jan 3 -> 3.
  const jan1 = new Date(2026, 0, 1);
  const jan2 = new Date(2026, 0, 2);

  it('returns undefined for an empty shelf', () => {
    expect(pickDailyBook([], new Set(), jan1)).toBeUndefined();
  });

  it('rotates by day of year when nothing is in progress', () => {
    expect(pickDailyBook(shelf, new Set(), jan1)!.id).toBe('b');
    expect(pickDailyBook(shelf, new Set(), jan2)!.id).toBe('c');
  });

  it('never offers a book that is already on the continue rail', () => {
    // Jan 1 would otherwise land on 'b'.
    const daily = pickDailyBook(shelf, new Set(['b']), jan1);
    expect(daily!.id).not.toBe('b');
  });

  it('excludes every in-progress book while any other book exists', () => {
    const daily = pickDailyBook(shelf, new Set(['a', 'b']), jan1);
    expect(daily!.id).toBe('c');
  });

  it('falls back to the full shelf when every book is in progress', () => {
    const daily = pickDailyBook(shelf, new Set(['a', 'b', 'c']), jan1);
    expect(daily!.id).toBe('b');
  });
});
