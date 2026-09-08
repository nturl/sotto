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

describe("pickDailyBook at the learner's level", () => {
  const jan1 = new Date(2026, 0, 1);
  const jan2 = new Date(2026, 0, 2);
  const jan3 = new Date(2026, 0, 3);

  it("offers a book at the learner's own level over any other", () => {
    const shelf = [
      { id: 'b1', level: 'B1' as const },
      { id: 'a1', level: 'A1' as const },
      { id: 'c1', level: 'C1' as const },
    ];
    // Level-blind, Jan 1 lands on 'a1' and Jan 2 on 'c1'; at A1 both days
    // stay on the one book the learner can actually read.
    expect(pickDailyBook(shelf, new Set(), jan1, 'A1')!.id).toBe('a1');
    expect(pickDailyBook(shelf, new Set(), jan2, 'A1')!.id).toBe('a1');
  });

  it('rotates within the level when several books sit at it', () => {
    const shelf = [
      { id: 'a1-one', level: 'A1' as const },
      { id: 'a1-two', level: 'A1' as const },
      { id: 'b2', level: 'B2' as const },
    ];
    expect(pickDailyBook(shelf, new Set(), jan1, 'A1')!.id).toBe('a1-two');
    expect(pickDailyBook(shelf, new Set(), jan2, 'A1')!.id).toBe('a1-one');
  });

  it('reaches one level easier before one level harder at equal distance', () => {
    // Level-blind, Jan 1 lands on 'a2'. Both are one step from A1, and the
    // easier one wins.
    const shelf = [
      { id: 'a0', level: 'A0' as const },
      { id: 'a2', level: 'A2' as const },
    ];
    expect(pickDailyBook(shelf, new Set(), jan1, 'A2')!.id).toBe('a2');
    expect(pickDailyBook(shelf, new Set(), jan1, 'A1')!.id).toBe('a0');
  });

  it('widens outward a step at a time rather than jumping to the far end', () => {
    // An A2 learner: B1 is one step harder, C1 is three. Level-blind, Jan 1
    // lands on 'c1'.
    const shelf = [
      { id: 'b1', level: 'B1' as const },
      { id: 'c1', level: 'C1' as const },
    ];
    expect(pickDailyBook(shelf, new Set(), jan1, 'A2')!.id).toBe('b1');
  });

  it('never offers an in-progress book just because it is at the right level', () => {
    const shelf = [
      { id: 'a1-one', level: 'A1' as const },
      { id: 'a1-two', level: 'A1' as const },
      { id: 'a2', level: 'A2' as const },
    ];
    // Level-blind, dropping 'a1-one' leaves two books and Jan 1 lands on
    // 'a2'; the level pool still has an A1 book to offer instead.
    expect(pickDailyBook(shelf, new Set(['a1-one']), jan1, 'A1')!.id).toBe('a1-two');
  });

  it('falls back to the whole shelf when every book is in progress', () => {
    const shelf = [
      { id: 'a1', level: 'A1' as const },
      { id: 'b2', level: 'B2' as const },
      { id: 'c1', level: 'C1' as const },
    ];
    // The last resort is the shelf as it stands, not the shelf filtered by
    // level again — that would pin an A1 learner to 'a1' forever.
    expect(pickDailyBook(shelf, new Set(['a1', 'b2', 'c1']), jan1, 'A1')!.id).toBe('b2');
  });

  it('falls back to every unstarted book when none of them carries a level', () => {
    const shelf = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(pickDailyBook(shelf, new Set(), jan1, 'A1')!.id).toBe('b');
  });

  it('keeps the same book all day and moves on the next one', () => {
    const shelf = [
      { id: 'a1-one', level: 'A1' as const },
      { id: 'b2', level: 'B2' as const },
      { id: 'a1-two', level: 'A1' as const },
      { id: 'c1', level: 'C1' as const },
    ];
    const morning = new Date(2026, 0, 3, 7, 5);
    const evening = new Date(2026, 0, 3, 23, 40);
    expect(pickDailyBook(shelf, new Set(), morning, 'A1')!.id).toBe('a1-two');
    expect(pickDailyBook(shelf, new Set(), evening, 'A1')!.id).toBe('a1-two');
    expect(pickDailyBook(shelf, new Set(), jan2, 'A1')!.id).toBe('a1-one');
    expect(pickDailyBook(shelf, new Set(), jan3, 'A1')!.id).toBe('a1-two');
  });
});
