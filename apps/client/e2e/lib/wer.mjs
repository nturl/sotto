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

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/**
 * Spells a whole number 0-999 the way a TTS voice says it, so a digit in
 * one side of the comparison and a word in the other are the same token.
 * Anything larger is left as digits: past 999 the readings diverge
 * ("nineteen hundred" / "one thousand nine hundred") and guessing wrong
 * would invent errors rather than remove them.
 */
function spellNumber(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    const rest = n % 10;
    return rest ? `${tens} ${ONES[rest]}` : tens;
  }
  if (n < 1000) {
    const hundreds = `${ONES[Math.floor(n / 100)]} hundred`;
    const rest = n % 100;
    return rest ? `${hundreds} ${spellNumber(rest)}` : hundreds;
  }
  return null;
}

/**
 * Folds a transcript to the tokens a WER comparison should see: lowercase,
 * accents stripped, punctuation dropped, whole numbers 0-999 spelled out.
 * Whisper writes "Gray husky dog." and a caption may say "gray husky dog" —
 * a difference in casing or a full stop is not a word error.
 *
 * Numerals are folded because they are an ORTHOGRAPHY difference, not an
 * audio one: Kokoro says "fifty" for "50", Whisper writes back whichever it
 * feels like, and lane C measured 0.188 on a single sentence from that
 * alone. Against a 0.35 gate a two-number reply could fail on spelling
 * while sounding perfect (run 9 lane R, P2).
 */
export function normalizeForWer(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\b\d+\b/g, (digits) => {
      const n = Number(digits);
      const spelled = Number.isSafeInteger(n) ? spellNumber(n) : null;
      return spelled ?? digits;
    })
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
