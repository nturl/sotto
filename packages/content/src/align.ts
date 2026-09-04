/**
 * Aligns STT word timings to pack tokens by normalized sequence matching
 * (planning/CONTRACTS.md §2c): a diff/LCS match between the sentence's word
 * tokens and whisper's words, with unmatched tokens interpolated between
 * their nearest matched neighbours.
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

function normalizeForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics after NFD decomposition
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

/**
 * LCS-based alignment: returns, for each entry in `tokenTexts` (in order),
 * the matched whisper word's span, or undefined if it couldn't be matched.
 */
export function alignWordsLcs(
  tokenTexts: string[],
  whisperWords: WhisperWord[],
): (TimeSpan | undefined)[] {
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

  const matches: (TimeSpan | undefined)[] = new Array(n).fill(undefined);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] !== '' && a[i] === b[j]) {
      const w = whisperWords[j] as WhisperWord;
      matches[i] = { start: w.start, end: w.end };
      i += 1;
      j += 1;
    } else if (((dp[i + 1] as number[])[j] as number) >= ((dp[i] as number[])[j + 1] as number)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matches;
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

  return result;
}
