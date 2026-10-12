/**
 * The text half of the Paradee voice (worker.ts's `loadTts`): eSpeak
 * phonemes -> misaki phonemes -> Paradee token ids. ML-free, so it is
 * unit-testable and safe to import anywhere.
 *
 * Paradee (sahilmahendrakar/Paradee-8M-v1.0, Apache-2.0) is an 8M-parameter
 * distillation of Kokoro-82M's `af_heart`, the voice this tutor already
 * speaks with: 9 MB of int8 weights against Kokoro's 310 MB fp32, and it
 * runs on the CPU (onnxruntime-web wasm), so it no longer needs WebGPU or
 * competes with the LLM for the GPU.
 *
 * kokoro-js still does the text -> eSpeak phonemes step. Paradee only ever
 * saw misaki's spelling of those phonemes in training ("I" for aɪ, "O" for
 * oʊ, "T" for a flap, no length marks), and fed raw eSpeak it mumbles: its
 * author measured Whisper WER 31% raw against ~2% converted.
 */

/** Paradee's sample rate (config.json `sample_rate`). */
export const PARADEE_SAMPLE_RATE = 24_000;

/** The text side has 512 positions, two of which are the pad tokens. */
export const PARADEE_MAX_PHONEMES = 510;

/**
 * Port of Paradee's `web/misaki.js` (github.com/sahilmahendrakar/paradee,
 * Apache-2.0), itself misaki's EspeakFallback table for American English,
 * adapted to the untied diphthongs kokoro-js emits. Order matters: the
 * multi-character rows must run before the single-character ones they
 * contain.
 */
const ESPEAK_TO_MISAKI: ReadonlyArray<readonly [string, string]> = [
  ['ʔˌn̩', 'ʔn'],
  ['ʔn̩', 'ʔn'],
  ['aɪ', 'I'],
  ['aʊ', 'W'],
  ['dʒ', 'ʤ'],
  ['eɪ', 'A'],
  ['e', 'A'],
  ['tʃ', 'ʧ'],
  ['ɔɪ', 'Y'],
  ['ʲo', 'jo'],
  ['ʲə', 'jə'],
  ['ʲ', ''],
  ['ɚ', 'əɹ'],
  ['r', 'ɹ'],
  ['x', 'k'],
  ['ç', 'k'],
  ['ɬ', 'l'],
  ['̃', ''],
];

const WORD_BOUNDARY = String.raw`[\s;:,.!?—…"“”()]|$`;

export function toMisaki(espeak: string): string {
  let ps = espeak;
  for (const [from, to] of ESPEAK_TO_MISAKI) ps = ps.split(from).join(to);
  // Syllabic consonants: eSpeak's combining mark after, misaki's ᵊ before.
  ps = ps.replace(/(\S)̩/gu, 'ᵊ$1').replace(/̩/g, '');
  // misaki writes a word-final syllabic l as ᵊl (naval -> nˈAvᵊl).
  ps = ps.replace(new RegExp(`əl(?=${WORD_BOUNDARY})`, 'gu'), 'ᵊl');
  // misaki's table maps ɐ to ə, but its lexicon keeps ɐ for the article "a".
  ps = ps.replace(new RegExp(`ɐ(?!${WORD_BOUNDARY})`, 'gu'), 'ə');
  ps = ps
    .split('oʊ')
    .join('O')
    .split('ɜːɹ')
    .join('ɜɹ')
    .split('ɜː')
    .join('ɜɹ')
    .split('ɪə')
    .join('iə')
    .split('ː')
    .join('')
    .split('o')
    .join('ɔ');
  return ps.split('ɾ').join('T').split('ʔ').join('t');
}

/** Kokoro's phoneme vocabulary, as Paradee's config.json ships it. */
const VOCAB: Readonly<Record<string, number>> = {
  ';': 1,
  ':': 2,
  ',': 3,
  '.': 4,
  '!': 5,
  '?': 6,
  '—': 9,
  '…': 10,
  '"': 11,
  '(': 12,
  ')': 13,
  '“': 14,
  '”': 15,
  ' ': 16,
  '̃': 17,
  ʣ: 18,
  ʥ: 19,
  ʦ: 20,
  ʨ: 21,
  ᵝ: 22,
  'ꭧ': 23,
  A: 24,
  I: 25,
  O: 31,
  Q: 33,
  S: 35,
  T: 36,
  W: 39,
  Y: 41,
  ᵊ: 42,
  a: 43,
  b: 44,
  c: 45,
  d: 46,
  e: 47,
  f: 48,
  h: 50,
  i: 51,
  j: 52,
  k: 53,
  l: 54,
  m: 55,
  n: 56,
  o: 57,
  p: 58,
  q: 59,
  r: 60,
  s: 61,
  t: 62,
  u: 63,
  v: 64,
  w: 65,
  x: 66,
  y: 67,
  z: 68,
  ɑ: 69,
  ɐ: 70,
  ɒ: 71,
  æ: 72,
  β: 75,
  ɔ: 76,
  ɕ: 77,
  ç: 78,
  ɖ: 80,
  ð: 81,
  ʤ: 82,
  ə: 83,
  ɚ: 85,
  ɛ: 86,
  ɜ: 87,
  ɟ: 90,
  ɡ: 92,
  ɥ: 99,
  ɨ: 101,
  ɪ: 102,
  ʝ: 103,
  ɯ: 110,
  ɰ: 111,
  ŋ: 112,
  ɳ: 113,
  ɲ: 114,
  ɴ: 115,
  ø: 116,
  ɸ: 118,
  θ: 119,
  œ: 120,
  ɹ: 123,
  ɾ: 125,
  ɻ: 126,
  ʁ: 128,
  ɽ: 129,
  ʂ: 130,
  ʃ: 131,
  ʈ: 132,
  ʧ: 133,
  ʊ: 135,
  ʋ: 136,
  ʌ: 138,
  ɣ: 139,
  ɤ: 140,
  χ: 142,
  ʎ: 143,
  ʒ: 147,
  ʔ: 148,
  ˈ: 156,
  ˌ: 157,
  ː: 158,
  ʰ: 162,
  ʲ: 164,
  '↓': 169,
  '→': 171,
  '↗': 172,
  '↘': 173,
  ᵻ: 177,
};

/**
 * misaki phonemes -> `[0, ...ids, 0]`, the shape Kokoro's tokenizer.json
 * template produces. Characters outside the vocabulary are dropped (as both
 * Kokoro's tokenizer and Paradee's Python package do), and the sequence is
 * cut to the model's 510 phoneme positions.
 */
export function paradeeIds(misaki: string): number[] {
  const ids: number[] = [];
  for (const ch of misaki) {
    const id = VOCAB[ch];
    if (id !== undefined) ids.push(id);
    if (ids.length === PARADEE_MAX_PHONEMES) break;
  }
  return [0, ...ids, 0];
}
