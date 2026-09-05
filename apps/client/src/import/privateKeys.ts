/**
 * Storage key builders for private (imported) books (planning/LEDGER.md
 * "R3-I Importer"): shared by createStore.ts and the platform-specific
 * audio storage helpers so every caller derives the same keys.
 */
export const PRIVATE_INDEX_KEY = 'sotto.private.index';

export function privateBookKey(bookId: string): string {
  return `sotto.private.book.${bookId}`;
}

export function privateChapterKey(bookId: string, chapterId: string): string {
  return `sotto.private.chapter.${bookId}.${chapterId}`;
}

export function privateAudioKey(bookId: string, file: string): string {
  return `sotto.private.audio.${bookId}.${file}`;
}
