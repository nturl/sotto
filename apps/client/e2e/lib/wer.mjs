/**
 * Word error rate, for the round-trip assertion in discuss-quality.mjs:
 * the tutor's spoken PCM is re-transcribed by Whisper in Node and scored
 * against the caption the screen showed. A low WER means the audio really
 * carries the words the caption claims; a high one means the listener heard
 * something else (Noel's "gibberish" report), which is exactly the failure
 * no existing probe in this repo could see — audible-probe.mjs only ever
 * counted that SAMPLES were scheduled, never that they were intelligible.
 *
 * Plain Node ESM (`.mjs`) rather than TypeScript on purpose: the e2e scripts
 * are run with bare `node`, apps/client has no vitest config that would make
 * a `.ts` helper importable from them, and eslint.config.js already treats
 * `apps/client/e2e/**\/*.mjs` as Node ESM. Vitest's default `include` picks
 * up `wer.test.mjs` next to this file.
 */

/**
 * Folds a transcript to the tokens a WER comparison should see: lowercase,
 * accents stripped, punctuation dropped, digits left alone. Whisper writes
 * "Gray husky dog." and a caption may say "gray husky dog" — a difference in
 * casing or a full stop is not a word error.
 */
export function normalizeForWer(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalized word tokens. `[]` for an empty or punctuation-only string. */
export function tokenize(text) {
  const norm = normalizeForWer(text);
  return norm ? norm.split(' ') : [];
}

/** Levenshtein distance over two arrays of tokens (not characters). */
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Word error rate of `hypothesis` against `reference`, plus the counts the
 * report prints. An empty reference scores 0 when the hypothesis is also
 * empty and 1 otherwise, so the caller never has to special-case it.
 */
export function wordErrorRate(reference, hypothesis) {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  if (ref.length === 0) return { wer: hyp.length === 0 ? 0 : 1, distance: hyp.length, refWords: 0 };
  const distance = editDistance(ref, hyp);
  return { wer: distance / ref.length, distance, refWords: ref.length };
}
