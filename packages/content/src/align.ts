/**
 * Aligns STT word timings to pack tokens (planning/CONTRACTS.md §2c).
 *
 * whisper.cpp's `verbose_json` "words" are actually sub-word (BPE) pieces:
 * a leading space marks the start of a new word, and a piece with no
 * leading space is a continuation of the previous one (e.g. "vieux" comes
 * back as " vie" + "ux"). The old greedy exact-match LCS compared those
 * fragments directly against whole pack tokens and only matched ~65-70%
 * of the time for FR/ES. The fix has three parts:
 *   1. merge the BPE fragments back into whole words using the
 *      leading-space convention,
 *   2. re-split merged words on the same elision/clitic boundaries the
 *      pack tokenizer uses (so "l'oiseau" lines up with pack tokens "l'"
 *      + "oiseau"), normalizing both straight and curly apostrophes first,
 *   3. run LCS over the resulting normalized word list, then make a
 *      second pass over the still-unmatched runs using a fuzzy
 *      (normalized Levenshtein) comparison to catch genuine ASR
 *      substitutions ("ces" heard as "ses", "intelligent" vs
 *      "intelligente") that exact matching can never close.
 */

export interface WhisperWord {
  word: string;
  start: number; // seconds
  end: number; // seconds
}

export interface TimeSpan {
  start: number; // seconds
  end: number; // seconds
}

export interface AlignmentStats {
  matched: number;
  total: number;
  method: string;
}

export const ALIGNMENT_METHOD = 'lcs+clitic-split+fuzzy-0.34';

/** Fuzzy-match threshold: normalized Levenshtein distance / max length. */
const FUZZY_THRESHOLD = 0.34;

// Same elision prefixes @sotto/core's tokenizer splits on (packages/core/src/tokenize.ts
// CLITIC_PREFIXES) — kept in sync by hand since align.ts must not import tokenizer
// internals that aren't exported. Covers FR/CA elisions ("l'", "d'", "qu'", ...) plus a
// few common IT ones ("dell'", "nell'", "sull'", "un'").
const CLITIC_PREFIXES = new Set([
  'l',
  'd',
  'j',
  'm',
  'n',
  's',
  't',
  'c',
  'qu',
  'jusqu',
  'lorsqu',
  'puisqu',
  'quoiqu',
  'un',
  'dell',
  'nell',
  'sull',
  'all',
  'quest',
]);

const STRAIGHT_APOSTROPHE = "'";
const CURLY_APOSTROPHE = '’';

function normalizeApostrophes(s: string): string {
  return s.split(CURLY_APOSTROPHE).join(STRAIGHT_APOSTROPHE);
}

function normalizeForMatch(s: string): string {
  return normalizeApostrophes(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics after NFD decomposition
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

/**
 * Merges whisper.cpp's BPE-fragment "words" back into whole words: a
 * fragment starting with whitespace begins a new word, one without
 * continues the previous word. Keeps the earliest start / latest end of
 * the pieces it merges.
 */
export function mergeSubwordFragments(words: WhisperWord[]): WhisperWord[] {
  const merged: WhisperWord[] = [];
  for (const w of words) {
    const startsNew = merged.length === 0 || /^\s/.test(w.word);
    if (startsNew) {
      merged.push({ word: w.word.trim(), start: w.start, end: w.end });
    } else {
      const last = merged[merged.length - 1] as WhisperWord;
      last.word += w.word;
      last.end = w.end;
    }
  }
  return merged;
}

/**
 * Re-splits merged words on elision apostrophes when the part before the
 * apostrophe is a recognized clitic (mirrors the pack tokenizer), so a
 * whisper word like "l'oiseau" lines up with the pack's separate "l'" and
 * "oiseau" tokens. Splits the merged span's time proportionally to each
 * piece's character length.
 */
export function splitClitics(words: WhisperWord[]): WhisperWord[] {
  const out: WhisperWord[] = [];
  for (const w of words) {
    const normalizedWord = normalizeApostrophes(w.word);
    const apIdx = normalizedWord.indexOf(STRAIGHT_APOSTROPHE);
    const prefix = apIdx === -1 ? '' : normalizedWord.slice(0, apIdx).toLowerCase();
    if (apIdx === -1 || apIdx === normalizedWord.length - 1 || !CLITIC_PREFIXES.has(prefix)) {
      out.push(w);
      continue;
    }
    const clitic = normalizedWord.slice(0, apIdx + 1);
    const rest = normalizedWord.slice(apIdx + 1);
    const duration = w.end - w.start;
    const splitAt = w.start + (duration * clitic.length) / normalizedWord.length;
    out.push({ word: clitic, start: w.start, end: splitAt });
    out.push({ word: rest, start: splitAt, end: w.end });
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const curr = new Array<number>(m + 1);
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] as number) + 1,
        (curr[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    prev = curr;
  }
  return prev[m] as number;
}

/** Normalized Levenshtein distance in [0, 1]: raw distance / longer length. */
function normalizedLevenshtein(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return levenshtein(a, b) / maxLen;
}

/**
 * LCS-based exact alignment: returns, for each entry in `tokenTexts` (in
 * order), the index into `whisperWords` it matched, or -1 if unmatched.
 * Every returned index is used at most once and indices are strictly
 * increasing across matched tokens (so downstream code can treat gaps
 * between them as bounded search windows).
 */
function alignIndicesLcs(tokenTexts: string[], whisperWords: WhisperWord[]): number[] {
  const a = tokenTexts.map(normalizeForMatch);
  const b = whisperWords.map((w) => normalizeForMatch(w.word));
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = dp[i] as number[];
      if (a[i] !== '' && a[i] === b[j]) {
        row[j] = ((dp[i + 1] as number[])[j + 1] as number) + 1;
      } else {
        row[j] = Math.max(
          (dp[i + 1] as number[])[j] as number,
          (dp[i] as number[])[j + 1] as number,
        );
      }
    }
  }

  const matchedIdx: number[] = new Array(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] !== '' && a[i] === b[j]) {
      matchedIdx[i] = j;
      i += 1;
      j += 1;
    } else if (((dp[i + 1] as number[])[j] as number) >= ((dp[i] as number[])[j + 1] as number)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matchedIdx;
}

/**
 * LCS-based alignment: returns, for each entry in `tokenTexts` (in order),
 * the matched whisper word's span, or undefined if it couldn't be matched.
 * Exported for the existing unit tests / narrate.ts's simple path.
 */
export function alignWordsLcs(
  tokenTexts: string[],
  whisperWords: WhisperWord[],
): (TimeSpan | undefined)[] {
  const matchedIdx = alignIndicesLcs(tokenTexts, whisperWords);
  return matchedIdx.map((j) => {
    if (j === -1) return undefined;
    const w = whisperWords[j] as WhisperWord;
    return { start: w.start, end: w.end };
  });
}

/**
 * Second pass over exact-LCS results: for each maximal run of consecutive
 * unmatched tokens, tries pairing them positionally against the whisper
 * words that fall in the same gap (bounded by the previous and next
 * matched anchors), accepting a pair whose normalized Levenshtein distance
 * is within FUZZY_THRESHOLD.
 */
function fuzzyFillIndices(
  tokenTexts: string[],
  whisperWords: WhisperWord[],
  matchedIdx: number[],
): number[] {
  const a = tokenTexts.map(normalizeForMatch);
  const b = whisperWords.map((w) => normalizeForMatch(w.word));
  const result = [...matchedIdx];
  const n = result.length;
  const m = whisperWords.length;
  const used = new Set(matchedIdx.filter((j) => j !== -1));

  let i = 0;
  while (i < n) {
    if (result[i] !== -1) {
      i += 1;
      continue;
    }
    let runEnd = i;
    while (runEnd < n - 1 && result[runEnd + 1] === -1) runEnd += 1;

    // Bound the search window to the whisper indices strictly between the
    // previous and next matched anchors (or the whole array at the ends).
    let lo = 0;
    for (let p = i - 1; p >= 0; p--) {
      if (result[p] !== -1) {
        lo = (result[p] as number) + 1;
        break;
      }
    }
    let hi = m;
    for (let q = runEnd + 1; q < n; q++) {
      if (result[q] !== -1) {
        hi = result[q] as number;
        break;
      }
    }
    const gapIdx: number[] = [];
    for (let k = lo; k < hi; k++) {
      if (!used.has(k)) gapIdx.push(k);
    }

    const runLength = runEnd - i + 1;
    for (let pos = 0; pos < runLength && pos < gapIdx.length; pos++) {
      const tokenIdx = i + pos;
      const whisperIdx = gapIdx[pos] as number;
      const ta = a[tokenIdx] as string;
      const tb = b[whisperIdx] as string;
      if (ta === '' || tb === '') continue;
      if (normalizedLevenshtein(ta, tb) <= FUZZY_THRESHOLD) {
        result[tokenIdx] = whisperIdx;
        used.add(whisperIdx);
      }
    }

    i = runEnd + 1;
  }

  return result;
}

/**
 * Full pipeline: merges STT sub-word fragments into whole words, re-splits
 * elisions to match the pack tokenizer, runs exact LCS, then fuzzy-fills
 * remaining gaps. Returns the per-token matches plus summary stats.
 */
export function alignWords(
  tokenTexts: string[],
  rawWhisperWords: WhisperWord[],
): { matches: (TimeSpan | undefined)[]; stats: AlignmentStats } {
  const words = splitClitics(mergeSubwordFragments(rawWhisperWords)).filter(
    (w) => normalizeForMatch(w.word) !== '',
  );
  const exact = alignIndicesLcs(tokenTexts, words);
  const filled = fuzzyFillIndices(tokenTexts, words, exact);
  const matches = filled.map((j) => {
    if (j === -1) return undefined;
    const w = words[j] as WhisperWord;
    return { start: w.start, end: w.end };
  });
  const matched = matches.filter((m) => m !== undefined).length;
  return {
    matches,
    stats: { matched, total: tokenTexts.length, method: ALIGNMENT_METHOD },
  };
}

/**
 * Fills in unmatched slots by splitting the gap between their nearest
 * matched (or sentence-boundary) neighbours evenly across the run of
 * consecutive unmatched entries.
 */
export function interpolateTimings(
  matches: (TimeSpan | undefined)[],
  sentenceDurationSec: number,
): TimeSpan[] {
  const n = matches.length;
  const result: TimeSpan[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const m = matches[i];
    if (m) {
      result[i] = m;
      continue;
    }

    let prevEnd = 0;
    for (let p = i - 1; p >= 0; p--) {
      const pm = matches[p];
      if (pm) {
        prevEnd = pm.end;
        break;
      }
    }
    let nextStart = sentenceDurationSec;
    for (let q = i + 1; q < n; q++) {
      const qm = matches[q];
      if (qm) {
        nextStart = qm.start;
        break;
      }
    }

    let runStart = i;
    while (runStart > 0 && !matches[runStart - 1]) runStart -= 1;
    let runEnd = i;
    while (runEnd < n - 1 && !matches[runEnd + 1]) runEnd += 1;
    const runLength = runEnd - runStart + 1;
    const slot = Math.max(0, nextStart - prevEnd) / runLength;
    const posInRun = i - runStart;
    result[i] = { start: prevEnd + slot * posInRun, end: prevEnd + slot * (posInRun + 1) };
  }

  // Enforce monotonic, non-overlapping timings — a fuzzy match can, in rare
  // cases, land slightly out of order relative to an interpolated or
  // adjacent matched neighbour; clamp forward so every span starts at or
  // after the previous one's end.
  for (let i = 1; i < n; i++) {
    const prev = result[i - 1] as TimeSpan;
    const cur = result[i] as TimeSpan;
    if (cur.start < prev.end) {
      const shift = prev.end - cur.start;
      cur.start += shift;
      if (cur.end < cur.start) cur.end = cur.start;
    }
  }

  return result;
}
