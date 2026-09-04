/**
 * Pure selectors over store state (CONTRACTS.md §4): rails, search, filters,
 * vocabulary-by-book, due reviews, progress percent. No React here — data.ts
 * (the UI seam) and screens call these directly on store snapshots.
 */
import { dueWords as coreDueWords } from '@sotto/core';
import type {
  BookCategory,
  BookLevel,
  BookSummary,
  Pack,
  ReadingProgress,
  SavedWord,
} from '@sotto/core';

export function selectPackForLocale(packs: Pack[], locale: string): Pack | undefined {
  return packs.find((p) => p.locale === locale);
}

function isStarted(progress: Record<string, ReadingProgress>, bookId: string): boolean {
  const p = progress[bookId];
  return !!p && p.percentComplete > 0;
}

function isCompleted(completedBooks: string[], bookId: string): boolean {
  return completedBooks.includes(bookId);
}

/** In-progress, not completed, most-recently-read first. */
export function selectContinueBooks(
  books: BookSummary[],
  progress: Record<string, ReadingProgress>,
  completedBooks: string[],
): BookSummary[] {
  return books
    .filter((b) => isStarted(progress, b.bookId) && !isCompleted(completedBooks, b.bookId))
    .sort((a, b) => {
      const at = progress[a.bookId]?.updatedAt ?? '';
      const bt = progress[b.bookId]?.updatedAt ?? '';
      return bt.localeCompare(at);
    });
}

/** Same level as the learner's, not started yet. */
export function selectRecommendedBooks(
  books: BookSummary[],
  progress: Record<string, ReadingProgress>,
  level: BookLevel,
): BookSummary[] {
  return books.filter((b) => b.level === level && !isStarted(progress, b.bookId));
}

/** Everything not already on the continue or recommended rail. */
export function selectNewBooks(
  books: BookSummary[],
  progress: Record<string, ReadingProgress>,
  level: BookLevel,
): BookSummary[] {
  const continueIds = new Set(selectContinueBooks(books, progress, []).map((b) => b.bookId));
  const recommendedIds = new Set(
    selectRecommendedBooks(books, progress, level).map((b) => b.bookId),
  );
  return books.filter((b) => !continueIds.has(b.bookId) && !recommendedIds.has(b.bookId));
}

export function normalizeSearchText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export function searchBooks(books: BookSummary[], query: string): BookSummary[] {
  const needle = normalizeSearchText(query.trim());
  if (!needle) return books;
  return books.filter((b) => {
    const haystacks = [b.title, b.author, ...Object.values(b.localizedTitles ?? {})];
    return haystacks.some((h) => normalizeSearchText(h).includes(needle));
  });
}

export function filterByCategory(books: BookSummary[], category: BookCategory): BookSummary[] {
  return books.filter((b) => b.categories.includes(category));
}

export function filterByLevel(books: BookSummary[], level: BookLevel): BookSummary[] {
  return books.filter((b) => b.level === level);
}

export function selectVocabularyForBook(savedWords: SavedWord[], bookId: string): SavedWord[] {
  return savedWords.filter((w) => w.bookId === bookId);
}

/** Books that have at least one saved word, most-recently-saved first. */
export function selectBooksWithVocabulary(savedWords: SavedWord[]): string[] {
  const byBook = new Map<string, string>();
  for (const w of savedWords) {
    const prev = byBook.get(w.bookId);
    if (!prev || w.savedAt > prev) byBook.set(w.bookId, w.savedAt);
  }
  return [...byBook.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([bookId]) => bookId);
}

export function selectDueWords(savedWords: SavedWord[], now: Date = new Date()): SavedWord[] {
  return coreDueWords(savedWords, now);
}

export function selectProgressPercent(
  progress: Record<string, ReadingProgress>,
  bookId: string,
): number {
  return progress[bookId]?.percentComplete ?? 0;
}
