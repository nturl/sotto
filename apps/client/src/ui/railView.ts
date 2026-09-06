/**
 * Pure decision behind `Rail`'s empty-state rendering (run-7 card B,
 * directive 4: "Rail renders a titled empty line instead of null when its
 * parent asks for it"). Split out of `Rail.tsx` because that module imports
 * `react-native`, which this repo's plain `vitest run` can't parse (no RN
 * transform configured — see `navRows.ts`'s comment for the same issue) —
 * keeping the branching here is what makes `Rail.test.ts` possible.
 */
import type { LibraryBook } from './data';

export type RailViewState =
  { kind: 'hidden' } | { kind: 'empty'; label: string } | { kind: 'content'; books: LibraryBook[] };

/** `books.length > 0` renders normally; otherwise an `emptyLabel` renders a
 * titled empty line, and no `emptyLabel` keeps the old "hide when empty"
 * behaviour (e.g. Home's "Resume" rail, which is normal — not an error —
 * when nobody has started a book yet). */
export function resolveRailView(books: LibraryBook[], emptyLabel?: string): RailViewState {
  if (books.length > 0) return { kind: 'content', books };
  if (emptyLabel) return { kind: 'empty', label: emptyLabel };
  return { kind: 'hidden' };
}
