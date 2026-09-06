/**
 * The one book onboarding ends on (run 7 lane C).
 *
 * "Finish with a recommendation and the library" — so the last screen has to
 * name a book, not a shelf. Exact level first, then the nearest level below
 * (a book that is slightly easy is a good first book; one that is too hard is
 * where people stop), then the nearest above, then anything at all. Shortest
 * first within a level, because the goal of the first book is finishing it.
 */
import type { BookLevel, BookSummary } from '@sotto/core';

const LEVEL_ORDER: readonly BookLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'];

function rank(level: BookLevel, target: BookLevel): number {
  const at = LEVEL_ORDER.indexOf(level);
  const want = LEVEL_ORDER.indexOf(target);
  if (at === -1 || want === -1) return 100;
  // Easier than asked for is a smaller penalty than harder.
  return at <= want ? want - at : (at - want) * 3;
}

export function recommendBook(
  books: readonly BookSummary[],
  level: BookLevel,
): BookSummary | undefined {
  return [...books].sort((a, b) => {
    const byLevel = rank(a.level, level) - rank(b.level, level);
    if (byLevel !== 0) return byLevel;
    const byLength = (a.estimatedMinutes ?? 0) - (b.estimatedMinutes ?? 0);
    if (byLength !== 0) return byLength;
    return a.bookId.localeCompare(b.bookId);
  })[0];
}
