import { describe, expect, it } from 'vitest';
import {
  CORE_CATEGORIES,
  composeRails,
  parseLibraryParams,
  paramsNeedRewrite,
  serializeLibraryParams,
  type LibraryFilters,
} from './libraryFilters';

type TestBook = { id: string; level: string; categories: string[] };

const book = (id: string, level: string, categories: string[]): TestBook =>
  ({ id, level, categories }) as TestBook;

// One hand-built list covering four core categories at three levels.
const BOOKS = [
  book('t1', 'A1', ['tales']),
  book('t2', 'A2', ['tales', 'folk']),
  book('f1', 'A2', ['fables']),
  book('f2', 'B1', ['fables']),
  book('v1', 'A2', ['adventure']),
  book('c1', 'B1', ['classics']),
] as never[];

const YOURS = [book('p1', 'A2', ['daily'])] as never[];

const ids = (books: readonly { id: string }[]) => books.map((b) => b.id);

describe('parseLibraryParams', () => {
  it('reads the legacy collection aliases', () => {
    expect(parseLibraryParams({ filter: 'voyage' })).toEqual({
      collection: 'adventure',
      level: undefined,
    });
    expect(parseLibraryParams({ filter: 'contes' })).toEqual({
      collection: 'tales',
      level: undefined,
    });
  });

  it('moves a legacy level in `filter` into `level`', () => {
    expect(parseLibraryParams({ filter: 'A2' })).toEqual({ collection: 'all', level: 'A2' });
  });

  it('keeps a valid collection and level together', () => {
    expect(parseLibraryParams({ filter: 'fables', level: 'B1' })).toEqual({
      collection: 'fables',
      level: 'B1',
    });
  });

  it('drops invalid values back to the defaults', () => {
    expect(parseLibraryParams({ filter: 'nonsense', level: 'Z9' })).toEqual({
      collection: 'all',
      level: undefined,
    });
    expect(parseLibraryParams({})).toEqual({ collection: 'all', level: undefined });
  });

  it('lets an explicit level param win over a legacy level in filter', () => {
    expect(parseLibraryParams({ filter: 'A2', level: 'B1' })).toEqual({
      collection: 'all',
      level: 'B1',
    });
  });
});

describe('serializeLibraryParams', () => {
  it('round trips every collection and level', () => {
    const cases: LibraryFilters[] = [
      { collection: 'all', level: undefined },
      { collection: 'all', level: 'A2' },
      { collection: 'yours', level: undefined },
      ...CORE_CATEGORIES.map((c) => ({ collection: c, level: 'B1' as const })),
    ];
    for (const filters of cases) {
      expect(parseLibraryParams(serializeLibraryParams(filters))).toEqual(filters);
    }
  });

  it('unsets the defaults instead of writing them', () => {
    expect(serializeLibraryParams({ collection: 'all', level: undefined })).toEqual({
      filter: undefined,
      level: undefined,
    });
  });
});

describe('paramsNeedRewrite', () => {
  it('is true for a legacy URL and false once it is canonical', () => {
    const raw = { filter: 'voyage' };
    const filters = parseLibraryParams(raw);
    expect(paramsNeedRewrite(raw, filters)).toBe(true);
    expect(paramsNeedRewrite(serializeLibraryParams(filters), filters)).toBe(false);
  });

  it('is true for a level smuggled in as a filter', () => {
    expect(paramsNeedRewrite({ filter: 'A2' }, parseLibraryParams({ filter: 'A2' }))).toBe(true);
  });

  it('is false for an already-canonical pair', () => {
    const raw = { filter: 'fables', level: 'A2' };
    expect(paramsNeedRewrite(raw, parseLibraryParams(raw))).toBe(false);
  });
});

describe('composeRails', () => {
  it('no filters: one shelf per non-empty core category, then All books', () => {
    const rails = composeRails({
      books: BOOKS,
      yourBooks: [],
      filters: { collection: 'all', level: undefined },
    });
    expect(rails.map((r) => r.key)).toEqual([
      'tales',
      'fables',
      'adventure',
      'classics',
      'folk',
      'all',
    ]);
    expect(rails.map((r) => r.seeAll)).toEqual([
      'tales',
      'fables',
      'adventure',
      'classics',
      'folk',
      undefined,
    ]);
    expect(ids(rails[0]!.books)).toEqual(['t1', 't2']);
    expect(ids(rails.at(-1)!.books)).toEqual(['t1', 't2', 'f1', 'f2', 'v1', 'c1']);
  });

  it('no filters: prepends the imports shelf when there are imports', () => {
    const rails = composeRails({
      books: BOOKS,
      yourBooks: YOURS,
      filters: { collection: 'all', level: undefined },
    });
    expect(rails[0]!.key).toBe('yours');
    expect(ids(rails[0]!.books)).toEqual(['p1']);
  });

  it('a collection filter gives exactly one shelf, with no See all', () => {
    const rails = composeRails({
      books: BOOKS,
      yourBooks: YOURS,
      filters: { collection: 'fables', level: undefined },
    });
    expect(rails).toHaveLength(1);
    expect(rails[0]!.key).toBe('fables');
    expect(rails[0]!.seeAll).toBeUndefined();
    expect(ids(rails[0]!.books)).toEqual(['f1', 'f2']);
  });

  it('a level filter restricts every shelf and hides the empty ones', () => {
    const rails = composeRails({
      books: BOOKS,
      yourBooks: [],
      filters: { collection: 'all', level: 'B1' },
    });
    expect(rails.map((r) => r.key)).toEqual(['fables', 'classics', 'all']);
    expect(ids(rails.at(-1)!.books)).toEqual(['f2', 'c1']);
  });

  it('both filters give one restricted shelf', () => {
    const rails = composeRails({
      books: BOOKS,
      yourBooks: [],
      filters: { collection: 'tales', level: 'A2' },
    });
    expect(rails).toHaveLength(1);
    expect(ids(rails[0]!.books)).toEqual(['t2']);
  });

  it('the imports collection is level-restricted too', () => {
    expect(
      ids(
        composeRails({
          books: BOOKS,
          yourBooks: YOURS,
          filters: { collection: 'yours', level: 'B1' },
        })[0]!.books,
      ),
    ).toEqual([]);
  });
});
