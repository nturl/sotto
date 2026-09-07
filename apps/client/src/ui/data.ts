/**
 * Data seam — the single place screens read library and preference state.
 *
 * WS-4: now backed by the real zustand store (apps/client/src/state,
 * CONTRACTS §4) instead of dev fixtures. `LibraryBook` keeps the exact
 * shape the WS-2 screens/components were built against.
 *
 * Run 8: the lossy 7 -> 3 category collapse and the `cover` field (a hash
 * of the bookId into eight flat illustrations) are both gone. `categories`
 * is now the pack's own seven-value taxonomy and covers are set from
 * metadata by `Cover`/`coverPaper`. `dev/fixtures.ts` stays for tests only.
 */
import { useEffect, useMemo } from 'react';
import type { BookCategory, BookSummary, ReviewStatus, UserPreferences } from '@sotto/core';
import type { BookLevel } from './dev/fixtures';
import { assetUrl } from '../state/contentApi';
import {
  filterByCategory,
  filterByLevel,
  searchBooks,
  selectContinueBooks,
  selectPackForLocale,
  selectProgressPercent,
  selectRecommendedBooks,
} from '../state/selectors';
import { useSottoStore } from '../state/store';
import type { LoadStatus } from '../state/types';

export type LibraryBook = {
  id: string;
  /** Pack locale this book was loaded from (CONTRACTS §2b `contentLocale`) —
   * needed to resolve per-book server assets (attribution.json, audio). */
  contentLocale: string;
  reviewStatus: ReviewStatus;
  title: string;
  author: string;
  shortAuthor: string;
  level: BookLevel;
  minutes: number;
  /** Run 8 PLAN decision 3: the pack's own seven-value taxonomy, no longer
   * collapsed into the three fixture values. It drives Library's collection
   * links and, through `coverPaper`, the book's paper colour. */
  categories: BookCategory[];
  /** Real pack cover (CONTRACTS §2b `books/<bookId>/cover.svg`), resolved
   * against the server. `Cover` reads it only as the fallback for a book
   * with no title, since covers are now set from metadata. */
  svgUrl: string;
  progress: number;
  isNew: boolean;
  synopsis: string;
  /** R3-I: set for a book imported by the reader (private:true, see
   * @sotto/core's Book/BookSummary). Not yet consumed by BookTile — see
   * the importer report for why the "Votre livre" caption (IMPORT.md §6)
   * wasn't added in this lane. */
  private?: boolean;
};

export type Library = {
  books: LibraryBook[];
  daily: LibraryBook;
  continueReading: LibraryBook[];
  recommended: LibraryBook[];
  newReleases: LibraryBook[];
  /** R3-I: private (imported) books for the current learning locale, most
   * recently added first — a new rail on Home/Library, per
   * planning/design/IMPORT.md. */
  yourBooks: LibraryBook[];
  /** Run 8 PLAN decision 6: the book the reader is currently in — the most
   * recently updated progress that is not completed, which is exactly the
   * head of `continueReading` (`selectContinueBooks` sorts by `updatedAt`
   * descending and drops completed books). `null` when nothing is open.
   * Rails pass it as `ribbonBookId`; exactly one tile in the app wears the
   * coral ribbon. */
  currentBookId: string | null;
  byId: (id: string) => LibraryBook | undefined;
  byCategory: (category: BookCategory) => LibraryBook[];
  byLevel: (level: BookLevel) => LibraryBook[];
  search: (query: string) => LibraryBook[];
  /** Run 7 card B, directive 4: lets Home/Library tell "still loading" and
   * "the fetch failed" apart from "there just aren't any books" instead of
   * all three rendering as the same blank rail set. Feed to
   * `selectors.ts`'s `resolvePacksBanner` alongside `books.length`. */
  packsStatus: LoadStatus;
  /** Re-runs `loadPacks()` from an `'error'` state (the store's own guard
   * only skips a call while `'loading'`/`'ready'`, so this is safe to call
   * again after a failure) — wired to the error banner's Retry button. */
  retryPacks: () => void;
};

function shortAuthorName(author: string): string {
  const parts = author.trim().split(/\s+/);
  if (parts.length < 2) return author;
  const last = parts[parts.length - 1]!;
  return `${parts[0]!.charAt(0)}. ${last}`;
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

/**
 * Today's story (mockup frame 1): a book to *start*, so it is never one the
 * learner is already part-way through — the spread and the Continue-reading
 * shelf carried the same book before this. Excluding the in-progress set can
 * empty the pool on a one-book shelf, so we fall back to the whole shelf
 * rather than render nothing.
 */
export function pickDailyBook<T extends { id: string }>(
  books: readonly T[],
  continueIds: ReadonlySet<string>,
  date: Date,
): T | undefined {
  if (books.length === 0) return undefined;
  const unstarted = books.filter((b) => !continueIds.has(b.id));
  const pool = unstarted.length > 0 ? unstarted : books;
  return pool[dayOfYear(date) % pool.length];
}

/** Re-export so `state/*.test.ts` and screens can both reach it without
 * duplicating the seam's book-summary -> LibraryBook mapping. */
export function toLibraryBook(
  summary: BookSummary,
  preferences: UserPreferences,
  progress: number,
): LibraryBook {
  const synopsis =
    summary.premise[preferences.explanationLocale] ??
    summary.premise.en ??
    Object.values(summary.premise)[0] ??
    '';
  return {
    id: summary.bookId,
    contentLocale: summary.contentLocale,
    reviewStatus: summary.reviewStatus,
    title:
      summary.localizedTitles[preferences.interfaceLocale] ??
      summary.localizedTitles.en ??
      summary.title,
    author: summary.author,
    shortAuthor: shortAuthorName(summary.author),
    level: summary.level,
    minutes: summary.estimatedMinutes,
    categories: summary.categories.length > 0 ? [...summary.categories] : ['tales'],
    // Private (imported) books have no server-hosted cover asset. Their
    // cover is set from metadata like every other book's, so an empty
    // svgUrl costs nothing.
    svgUrl: summary.private
      ? ''
      : assetUrl(summary.contentLocale, summary.bookId, summary.cover || 'cover.svg'),
    progress,
    isNew: progress === 0,
    synopsis,
    private: summary.private,
  };
}

export function useLibrary(): Library {
  const packs = useSottoStore((s) => s.packs);
  const packsStatus = useSottoStore((s) => s.packsStatus);
  const loadPacks = useSottoStore((s) => s.loadPacks);
  const preferences = useSottoStore((s) => s.preferences);
  const progress = useSottoStore((s) => s.progress);
  const completedBooks = useSottoStore((s) => s.completedBooks);
  const privateBooks = useSottoStore((s) => s.privateBooks);

  useEffect(() => {
    if (packsStatus === 'idle') void loadPacks();
  }, [packsStatus, loadPacks]);

  return useMemo<Library>(() => {
    const pack = selectPackForLocale(packs, preferences.learningLocale);
    const summaries = pack?.books ?? [];
    const allSummaries = [...packs.flatMap((p) => p.books), ...privateBooks];

    const toView = (s: BookSummary) =>
      toLibraryBook(s, preferences, selectProgressPercent(progress, s.bookId));

    const seededBooks = summaries.map(toView);
    const continueReading = selectContinueBooks(summaries, progress, completedBooks).map(toView);
    const recommended = selectRecommendedBooks(summaries, progress, preferences.level).map(toView);
    const continueIds = new Set(continueReading.map((b) => b.id));
    const recommendedIds = new Set(recommended.map((b) => b.id));
    const newReleases = seededBooks.filter(
      (b) => !continueIds.has(b.id) && !recommendedIds.has(b.id),
    );

    // R3-I: private books scoped to the current learning locale, most
    // recently added first — `privateBooks` is stored append-order, so
    // reversing gives newest-first without needing a savedAt field.
    const yourBooks = privateBooks
      .filter((b) => b.contentLocale === preferences.learningLocale)
      .slice()
      .reverse()
      .map(toView);

    // The flat `books` list feeds search/byId/etc across the whole learning
    // locale, seeded content plus private imports (LEDGER: "includes
    // private books in books").
    const books = [...seededBooks, ...yourBooks];

    const daily =
      pickDailyBook(seededBooks, continueIds, new Date()) ??
      ({
        id: '',
        contentLocale: '',
        reviewStatus: 'draft',
        title: '',
        author: '',
        shortAuthor: '',
        level: 'A1',
        minutes: 0,
        categories: ['tales'],
        svgUrl: '',
        progress: 0,
        isNew: false,
        synopsis: '',
      } satisfies LibraryBook);

    const privateSummariesForLocale = privateBooks.filter(
      (b) => b.contentLocale === preferences.learningLocale,
    );

    return {
      books,
      daily,
      continueReading,
      recommended,
      newReleases,
      yourBooks,
      currentBookId: continueReading[0]?.id ?? null,
      byId: (id) => {
        const summary = allSummaries.find((b) => b.bookId === id);
        return summary ? toView(summary) : undefined;
      },
      byCategory: (category) => filterByCategory(summaries, category).map(toView),
      byLevel: (level) => filterByLevel(summaries, level).map(toView),
      search: (query) =>
        [...searchBooks(summaries, query), ...searchBooks(privateSummariesForLocale, query)].map(
          toView,
        ),
      packsStatus,
      retryPacks: loadPacks,
    };
  }, [packs, packsStatus, loadPacks, preferences, progress, completedBooks, privateBooks]);
}

/** Resolves a book's asset (cover, audio) path against the server, for
 * screens/components that need the URL rather than the fixture illustration
 * (the reader's narration transport). */
export function bookAssetUrl(bookId: string, relativePath: string, locale: string): string {
  return assetUrl(locale, bookId, relativePath);
}

// ---------------------------------------------------------------------------
// Preferences (SEAM: real preferences slice, backed by the zustand store).
// ---------------------------------------------------------------------------

export type { UserPreferences as Preferences };

export function usePreferences(): UserPreferences {
  return useSottoStore((s) => s.preferences);
}

export function setPreference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K],
): void {
  useSottoStore.getState().setPreference(key, value);
}

export function setPreferences(partial: Partial<UserPreferences>): void {
  useSottoStore.getState().setPreferences(partial);
}

/** SEAM: store reset (progress + vocabulary + session + preferences). */
export function resetAll(): void {
  useSottoStore.getState().resetAll();
}
