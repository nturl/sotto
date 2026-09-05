/**
 * Sentence splitting for imported paragraphs. Seed bundles (CONTRACTS §2a)
 * are authored pre-split into sentences by a content contributor; an
 * imported book has no such author, so this is the one genuinely new
 * tokenization-adjacent step the importer needs before it can reuse
 * @sotto/core's `tokenizeSentence` (which tokenizes a single sentence, not
 * a paragraph) and the gloss/translation pipeline (which works sentence by
 * sentence, matching the source-bundle grain).
 *
 * This used to be a backtracking regex (`[^.!?…]+(?:[.!?…]+(?=...)|$)`)
 * whose catastrophic-backtracking worst case is a long run of
 * non-terminator characters ending in a terminator that fails the
 * lookahead (e.g. no trailing whitespace) — quadratic-or-worse in the run
 * length, and reachable by an unauthenticated import upload (adversarial
 * review 3, finding 6). It is now a single forward scan with no
 * backtracking, linear in paragraph length.
 */
import type { Typography } from '@sotto/core';

const LATIN_TERMINATORS = new Set(['.', '!', '?', '…']);
const LATIN_CLOSERS = new Set(['"', "'", '’', '”', ')', ']']);
const CJK_TERMINATORS = new Set(['。', '！', '？', '…']);
const WHITESPACE_RE = /\s/u;

function isWhitespace(ch: string): boolean {
  return WHITESPACE_RE.test(ch);
}

/**
 * Scans `text` for maximal runs of non-terminator characters followed by a
 * terminator run. When `requireBoundary` is true (Latin-script text), a
 * terminator run only ends a sentence if — after skipping any closing
 * quotes/brackets — it is followed by whitespace or the end of the
 * string; otherwise the entire [run-start, terminator-run-end) span is
 * dropped and scanning resumes after it, matching the original regex's
 * documented behaviour (a terminator with no boundary after it, e.g. the
 * "." in "3.14", never closes a sentence and everything up to and
 * including it is discarded). CJK text (`requireBoundary: false`) has no
 * such lookahead — every terminator run always ends a sentence.
 */
function scan(
  text: string,
  terminators: Set<string>,
  closers: Set<string> | null,
  requireBoundary: boolean,
): string[] {
  const out: string[] = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    if (terminators.has(text[i] as string)) {
      // A match can never start on a terminator char (mirrors the regex's
      // `[^...]+` requiring >=1 non-terminator char first) — skip it.
      i += 1;
      continue;
    }
    const start = i;
    let k = i;
    while (k < n && !terminators.has(text[k] as string)) k += 1;

    if (k === n) {
      // Ran off the end with no terminator: matches via the `$` branch.
      const sentence = text.slice(start, n).trim();
      if (sentence.length > 0) out.push(sentence);
      i = n;
      break;
    }

    let termEnd = k;
    while (termEnd < n && terminators.has(text[termEnd] as string)) termEnd += 1;

    if (!requireBoundary) {
      const sentence = text.slice(start, termEnd).trim();
      if (sentence.length > 0) out.push(sentence);
      i = termEnd;
      continue;
    }

    // The closer/whitespace check is a zero-width lookahead in the
    // original regex: closing quotes/brackets are only *checked*, never
    // consumed into the match. So the match itself always ends at
    // `termEnd`, and any closers are picked up by the next scan.
    let c = termEnd;
    if (closers) {
      while (c < n && closers.has(text[c] as string)) c += 1;
    }
    const boundaryOk = c === n || isWhitespace(text[c] as string);

    if (boundaryOk) {
      const sentence = text.slice(start, termEnd).trim();
      if (sentence.length > 0) out.push(sentence);
      i = termEnd;
    } else {
      // The terminator run has no whitespace/end boundary after it (e.g.
      // a decimal point). Nothing between `start` and `termEnd` can ever
      // match — drop it and resume scanning after the terminator run.
      i = termEnd;
    }
  }

  return out;
}

/** Splits one paragraph of plain text into trimmed, non-empty sentences. */
export function splitSentences(paragraph: string, typography: Typography): string[] {
  const out =
    typography === 'cjk'
      ? scan(paragraph, CJK_TERMINATORS, null, false)
      : scan(paragraph, LATIN_TERMINATORS, LATIN_CLOSERS, true);
  return out.length > 0 ? out : [paragraph.trim()].filter((s) => s.length > 0);
}
