/**
 * The mono line under a book tile (run 8 PLAN decision 5) — it replaced the
 * 3px progress track. React-Native-free so `progressLabel.test.ts` can load
 * it under this repo's plain `vitest run` (see `railView.ts`).
 *
 * There is no page model anywhere in the content pipeline: `BookSummary`
 * carries `estimatedMinutes` and `ReadingProgress` carries a 0..1
 * `percentComplete` (VERIFIED: the reader writes
 * `Math.min(1, chapterIndex * perChapter + fraction * perChapter)`), so
 * "one page is one minute of reading" is the bridge that turns those two
 * into something a reader can say out loud. That equivalence is a CONFIRM
 * for Noel, recorded in FINAL.md.
 */
export type ProgressLabel =
  { kind: 'page'; page: number; pages: number } | { kind: 'minutes'; minutes: number };

export function progressLabel({
  minutes,
  progress,
}: {
  minutes: number;
  /** 0..1 fraction, `LibraryBook.progress`. */
  progress: number;
}): ProgressLabel {
  if (progress > 0 && progress < 1) {
    const pages = Math.max(1, Math.round(minutes));
    const page = Math.min(Math.max(1, 1 + Math.floor(progress * pages)), pages);
    return { kind: 'page', page, pages };
  }
  return { kind: 'minutes', minutes: Math.max(0, Math.round(minutes)) };
}
