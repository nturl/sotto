/**
 * Data seam — the single place screens read library and preference state.
 *
 * WS-4: now backed by the real zustand store (apps/client/src/state,
 * CONTRACTS §4) instead of dev fixtures. `LibraryBook` keeps the exact
 * shape the WS-2 screens/components were built against (BookTile, Cover,
 * DailyStoryCard, library.tsx's category filter) so none of them had to
 * change: `cover` is still one of Cover.tsx's fixed illustrations and
 * `categories` is still the 3-value fixture taxonomy. Cover.tsx (owned by a
 * concurrent worker) only knows how to render those named illustrations,
 * not the packs' generated `cover.svg`, so real books are mapped onto a
 * deterministic illustration by hashing their id — a known simplification,
 * see the WS-4 report. `dev/fixtures.ts` stays for tests only.
 */
import { useEffect, useMemo } from 'react';
import type {
  BookCategory as CoreBookCategory,
  BookSummary,
  ReviewStatus,
  UserPreferences,
} from '@sotto/core';
import type { CoverArt } from './Cover';
import type { BookCategory, BookLevel } from './dev/fixtures';
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
  categories: BookCategory[];
  cover: CoverArt;
  /** Real pack cover (CONTRACTS §2b `books/<bookId>/cover.svg`), resolved
   * against the server. Passed to `Cover`'s `svgUrl` prop, which renders it
   * in place of the flat fixture illustration in `cover`. */
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
  byId: (id: string) => LibraryBook | undefined;
  byCategory: (category: BookCategory) => LibraryBook[];
  byLevel: (level: BookLevel) => LibraryBook[];
  search: (query: string) => LibraryBook[];
};

const COVER_ARTS: CoverArt[] = [
  'fox',
  'lantern',
  'river',
  'mountain',
  'dune',
  'night',
  'market',
  'sail',
];

function hashCover(bookId: string): CoverArt {
  let hash = 0;
  for (let i = 0; i < bookId.length; i += 1) hash = (hash * 31 + bookId.charCodeAt(i)) >>> 0;
  return COVER_ARTS[hash % COVER_ARTS.length]!;
}

function mapCategories(categories: CoreBookCategory[]): BookCategory[] {
  const mapped = new Set<BookCategory>();
  for (const c of categories) {
    if (c === 'fables') mapped.add('fables');
    else if (c === 'adventure') mapped.add('voyage');
    else mapped.add('contes');
  }
  return mapped.size ? [...mapped] : ['contes'];
}

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
    categories: mapCategories(summary.categories),
    cover: hashCover(summary.bookId),
    // Private (imported) books have no server-hosted cover asset — an
    // empty svgUrl makes Cover.tsx fall back to its own flat illustration
    // (picked deterministically from the bookId via `cover` above).
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
      seededBooks.length > 0
        ? seededBooks[dayOfYear(new Date()) % seededBooks.length]!
        : ({
            id: '',
            contentLocale: '',
            reviewStatus: 'draft',
            title: '',
            author: '',
            shortAuthor: '',
            level: 'A1',
            minutes: 0,
            categories: ['contes'],
            cover: 'market',
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
      byId: (id) => {
        const summary = allSummaries.find((b) => b.bookId === id);
        return summary ? toView(summary) : undefined;
      },
      byCategory: (category) =>
        filterByCategory(summaries, mapFixtureCategoryToCore(category)).map(toView),
      byLevel: (level) => filterByLevel(summaries, level).map(toView),
      search: (query) =>
        [...searchBooks(summaries, query), ...searchBooks(privateSummariesForLocale, query)].map(
          toView,
        ),
    };
  }, [packs, preferences, progress, completedBooks, privateBooks]);
}

/** Inverse of `mapCategories`: the library screen's chips only offer
 * 'fables' | 'voyage', both of which map onto exactly one core category. */
function mapFixtureCategoryToCore(category: BookCategory): CoreBookCategory {
  if (category === 'fables') return 'fables';
  if (category === 'voyage') return 'adventure';
  return 'tales';
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
