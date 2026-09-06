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
import type { LoadStatus } from './types';

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

/**
 * Saved words restricted to books that belong to `locale`'s pack.
 *
 * Bug fix (verification row 24): `selectBooksWithVocabulary`/
 * `selectVocabularyForBook` alone resolve across every loaded pack, so
 * words saved while learning one locale kept showing in Vocabulary after
 * switching `preferences.learningLocale` to another. This only changes
 * what's displayed — saved words for the other locale stay in the store
 * untouched, and reappear if the learner switches back.
 */
export function selectSavedWordsForLocale(
  savedWords: SavedWord[],
  packs: Pack[],
  locale: string,
): SavedWord[] {
  const pack = selectPackForLocale(packs, locale);
  const bookIds = new Set((pack?.books ?? []).map((b) => b.bookId));
  return savedWords.filter((w) => bookIds.has(w.bookId));
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

/**
 * Run 7 card B, directive 4: Home and Library must show loading / error /
 * "no books for this locale+level" distinctly instead of all three
 * rendering as the same blank rail set. `bookCount` is the learner's
 * current-locale book total (`Library.books.length`), taken independent of
 * any Library filter chip — the filter-specific "no results" case is
 * `isFilterEmpty` below.
 */
export type PacksBanner =
  { kind: 'none' } | { kind: 'loading' } | { kind: 'error' } | { kind: 'emptyLevel' };

export function resolvePacksBanner(packsStatus: LoadStatus, bookCount: number): PacksBanner {
  if (packsStatus === 'idle' || packsStatus === 'loading') return { kind: 'loading' };
  if (packsStatus === 'error') return { kind: 'error' };
  if (bookCount === 0) return { kind: 'emptyLevel' };
  return { kind: 'none' };
}

/** True once a Library filter chip is selected and every rail it produced
 * came back empty — the "No books match this filter" state (card B,
 * directive 4), distinct from `resolvePacksBanner`'s locale-wide states. */
export function isFilterEmpty(rails: Array<{ books: unknown[] }>): boolean {
  return rails.length > 0 && rails.every((r) => r.books.length === 0);
}
