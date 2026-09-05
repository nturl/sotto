/**
 * Shared size limits for the import pipeline (adversarial review 3,
 * finding 6): an unauthenticated upload with no cap on paragraph size,
 * total characters, or chapter count can turn one request into an
 * effectively unbounded amount of CPU/LLM/TTS work on the local server.
 */

/** A single paragraph longer than this is hard-split (on whitespace where
 * possible) before sentence splitting/tokenization ever sees it, so no
 * downstream step has to process an arbitrarily large single unit. */
export const MAX_PARAGRAPH_CHARS = 20_000;

/** Total characters across every parsed paragraph. Enforced in
 * importBook() before any model call, and again in apps/server's import
 * route so an oversized upload is rejected with a clear error before the
 * parser even runs. */
export const MAX_IMPORT_CHARS = 600_000;

/** A parsed document with more chapters than this is refused — no single
 * book needs tens of thousands of chapters, and each chapter dispatches
 * its own LLM/TTS batches. */
export const MAX_CHAPTERS = 400;

/** Hard-splits a paragraph above MAX_PARAGRAPH_CHARS into chunks at or
 * under the limit, preferring a whitespace boundary near the cut point so
 * words aren't sliced in half when reasonably avoidable. */
export function hardSplitParagraph(paragraph: string, maxChars = MAX_PARAGRAPH_CHARS): string[] {
  if (paragraph.length <= maxChars) return [paragraph];
  const out: string[] = [];
  let start = 0;
  const n = paragraph.length;
  while (start < n) {
    let end = Math.min(start + maxChars, n);
    if (end < n) {
      // Look back a short distance for a whitespace boundary so we don't
      // split mid-word when a natural break is nearby.
      const lookback = Math.max(start, end - 200);
      let cut = -1;
      for (let i = end; i > lookback; i -= 1) {
        if (/\s/.test(paragraph[i - 1] as string)) {
          cut = i;
          break;
        }
      }
      if (cut > start) end = cut;
    }
    const piece = paragraph.slice(start, end).trim();
    if (piece.length > 0) out.push(piece);
    start = end;
  }
  return out;
}

/** Applies hardSplitParagraph across a whole paragraph list. */
export function hardSplitParagraphs(paragraphs: string[], maxChars = MAX_PARAGRAPH_CHARS): string[] {
  return paragraphs.flatMap((p) => hardSplitParagraph(p, maxChars));
}

/** EPUB zip-bomb guards (adversarial review 3, finding 7): a 25MB archive
 * at a 1000:1 compression ratio would otherwise attempt ~25GB of
 * allocation, synchronously, before any content is even looked at. */
export const EPUB_MAX_ENTRIES = 2_000;
/** Cumulative decompressed bytes are refused once they exceed this many
 * times the archive's own (compressed) byte size. */
export const EPUB_INFLATION_RATIO = 10;
