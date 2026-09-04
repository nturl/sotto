/**
 * Data seam — the single place screens read library and preference state.
 *
 * WS-4 builds the zustand store (apps/client/src/state, CONTRACTS §4) with
 * selectors for rails (continue / recommended / new), search, category
 * filters and preferences. That module does not exist yet, and a static
 * import of a missing module would break the Metro bundle, so for now this
 * hook serves dev fixtures (src/ui/dev/fixtures.ts) and an in-memory
 * preferences snapshot. When the store lands, replace the bodies below with
 * the real selector calls — screens must not change.
 */
import { useSyncExternalStore } from 'react';
import { DAILY_BOOK, FIXTURE_BOOKS, type BookCategory, type BookLevel, type FixtureBook } from './dev/fixtures';

export type LibraryBook = FixtureBook;

export type Library = {
  books: LibraryBook[];
  daily: LibraryBook;
  continueReading: LibraryBook[];
  recommended: LibraryBook[];
  newReleases: LibraryBook[];
  byId: (id: string) => LibraryBook | undefined;
  byCategory: (category: BookCategory) => LibraryBook[];
  byLevel: (level: BookLevel) => LibraryBook[];
  search: (query: string) => LibraryBook[];
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function useLibrary(): Library {
  const books = FIXTURE_BOOKS;
  return {
    books,
    daily: DAILY_BOOK,
    continueReading: books.filter((book) => book.progress > 0),
    recommended: books.filter((book) => book.progress === 0 && !book.isNew),
    newReleases: books.filter((book) => book.isNew),
    byId: (id) => books.find((book) => book.id === id) ?? (id === DAILY_BOOK.id ? DAILY_BOOK : undefined),
    byCategory: (category) => books.filter((book) => book.categories.includes(category)),
    byLevel: (level) => books.filter((book) => book.level === level),
    search: (query) => {
      const needle = normalize(query.trim());
      if (!needle) return books;
      return books.filter(
        (book) => normalize(book.title).includes(needle) || normalize(book.author).includes(needle),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Preferences (SEAM: WS-4 preferences slice). Reactive in-memory snapshot so
// settings screens work today; the store replaces this wholesale.
// ---------------------------------------------------------------------------

export type Preferences = {
  interfaceLocale: string;
  explanationLocale: string;
  learningLocale: string;
  level: BookLevel;
  narrationSpeedLabel: 'normal';
  captionsEnabled: boolean;
  onboarded: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
  interfaceLocale: 'fr',
  explanationLocale: 'en',
  learningLocale: 'fr-FR',
  level: 'A1',
  narrationSpeedLabel: 'normal',
  captionsEnabled: true,
  onboarded: false,
};

let snapshot: Preferences = { ...DEFAULT_PREFERENCES };
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function setPreference<Key extends keyof Preferences>(key: Key, value: Preferences[Key]): void {
  snapshot = { ...snapshot, [key]: value };
  notify();
}

/** SEAM: WS-4 store reset (progress + vocabulary + session + preferences). */
export function resetAll(): void {
  snapshot = { ...DEFAULT_PREFERENCES };
  notify();
}
