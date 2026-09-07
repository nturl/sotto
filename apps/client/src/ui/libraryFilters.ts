/**
 * Library filter grammar and rail composition — the RN-free half of
 * `app/(tabs)/library.tsx`.
 *
 * RECON §7 / risk 9: any module that imports `react-native`, even
 * transitively, fails to parse under the repo's bare `vitest run`. So the
 * decisions the Library screen makes — what the URL means, which shelves
 * exist and in what order — live here, next to their test, exactly the way
 * `railView.ts` and `navRows.ts` do for Rail and TabBar.
 *
 * Run 8 PLAN decision 9: `?filter=` keeps its run-7 grammar for collections
 * (now the seven core categories), `?level=` is new, and three legacy shapes
 * are read and rewritten — `voyage` -> `adventure`, `contes` -> `tales`, and
 * a level value sitting in `filter` -> `level`.
 */
import { BOOK_LEVELS, type BookCategory, type BookLevel } from '@sotto/core';

/** The seven core categories, in the order the Library stacks their
 * shelves and lists their collection links. */
export const CORE_CATEGORIES: readonly BookCategory[] = [
  'tales',
  'fables',
  'adventure',
  'classics',
  'folk',
  'idioms',
  'daily',
] as const;

export const LEVELS: readonly BookLevel[] = [...BOOK_LEVELS];

/**
 * A collection link's value. `all` is "Everything" (no `?filter=`);
 * `yours` is the imported-books shelf.
 *
 * DEVIATION from PLAN decision 9, recorded in the lane C report: the plan
 * fixes the grammar at `all|<the seven categories>`, but the mockup's
 * collection row also carries a "Your books" link when imports exist, and a
 * link that writes nothing to the URL would not survive a reload like every
 * other one in the row. `yours` is that one extra value.
 */
export type Collection = 'all' | BookCategory | 'yours';

export type LibraryFilters = {
  collection: Collection;
  level: BookLevel | undefined;
};

export type LibraryParams = { filter?: string; level?: string };

/** Run-7 URLs (and any link still in the wild) that must keep working. */
const LEGACY_COLLECTIONS: Record<string, BookCategory> = {
  voyage: 'adventure',
  contes: 'tales',
};

const COLLECTIONS = new Set<string>(['all', 'yours', ...CORE_CATEGORIES]);
const LEVEL_SET = new Set<string>(LEVELS);

function asLevel(value: unknown): BookLevel | undefined {
  return typeof value === 'string' && LEVEL_SET.has(value) ? (value as BookLevel) : undefined;
}

function asCollection(value: unknown): Collection | undefined {
  if (typeof value !== 'string') return undefined;
  const aliased = LEGACY_COLLECTIONS[value] ?? value;
  return COLLECTIONS.has(aliased) ? (aliased as Collection) : undefined;
}

/** URL -> state. Anything unrecognised falls back to the default (no
 * collection, no level) rather than throwing or sticking. */
export function parseLibraryParams(raw: LibraryParams): LibraryFilters {
  return {
    collection: asCollection(raw.filter) ?? 'all',
    // An explicit `?level=` wins; otherwise a legacy level sitting in
    // `?filter=` is promoted into it.
    level: asLevel(raw.level) ?? asLevel(raw.filter),
  };
}

/** State -> URL. Defaults are written as `undefined` so `router.setParams`
 * removes them from the address bar instead of pinning `filter=all`. */
export function serializeLibraryParams(filters: LibraryFilters): {
  filter: string | undefined;
  level: string | undefined;
} {
  return {
    filter: filters.collection === 'all' ? undefined : filters.collection,
    level: filters.level ?? undefined,
  };
}

/** True when the address bar is showing something other than the canonical
 * spelling of the state it parsed to — a legacy alias, a level in `filter`,
 * or a value that was thrown away as invalid. The screen answers this with
 * one `router.setParams`. */
export function paramsNeedRewrite(raw: LibraryParams, filters: LibraryFilters): boolean {
  const canonical = serializeLibraryParams(filters);
  const same = (a: string | undefined, b: string | undefined) => (a || undefined) === b;
  return !same(raw.filter, canonical.filter) || !same(raw.level, canonical.level);
}

/** The shape a rail needs from a book to be filtered. `LibraryBook`
 * satisfies it; so does a two-field literal in a test. */
export type FilterableBook = { level: BookLevel; categories: BookCategory[] };

export type RailSpec<T> = {
  /** `yours` | one of the seven | `all` — the screen turns this into a title. */
  key: Collection;
  books: T[];
  /** Present only on a category shelf in the unfiltered view; pressing it
   * sets `?filter=<key>` and keeps the current level. */
  seeAll?: BookCategory;
};

/**
 * The four cases from the card, in one place:
 *
 * - no filters -> one shelf per core category that has books, in
 *   `CORE_CATEGORIES` order, then "All books" with no See all (and the
 *   imports shelf prepended when there are imports, as in run 7);
 * - a collection -> that one shelf, no See all;
 * - a level -> every shelf restricted to it, the empty ones dropped,
 *   including the "All books" shelf;
 * - both -> one restricted shelf.
 */
export function composeRails<T extends FilterableBook>(args: {
  books: T[];
  yourBooks: T[];
  filters: LibraryFilters;
}): Array<RailSpec<T>> {
  const { filters } = args;
  const atLevel = (books: T[]) =>
    filters.level === undefined ? books : books.filter((b) => b.level === filters.level);
  const pool = atLevel(args.books);

  if (filters.collection === 'yours') {
    return [{ key: 'yours', books: atLevel(args.yourBooks) }];
  }
  if (filters.collection !== 'all') {
    const category = filters.collection;
    return [{ key: category, books: pool.filter((b) => b.categories.includes(category)) }];
  }

  const rails: Array<RailSpec<T>> = [];
  const imports = atLevel(args.yourBooks);
  if (imports.length > 0) rails.push({ key: 'yours', books: imports });
  for (const category of CORE_CATEGORIES) {
    const books = pool.filter((b) => b.categories.includes(category));
    if (books.length > 0) rails.push({ key: category, books, seeAll: category });
  }
  rails.push({ key: 'all', books: pool });
  return rails;
}
