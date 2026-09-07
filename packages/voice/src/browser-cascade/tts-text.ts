/**
 * What the browser cascade is allowed to hand Kokoro (run 9, lane C).
 *
 * `speakSentence` used to pass the LLM's sentence through verbatim.
 * `markers.ts` strips `[[…]]`, `<think>` and ```tool blocks and nothing
 * else, so a 2B model that answers with "- **The dog** is unhappy but
 * *loyal*. 🐺" reached Kokoro with the asterisks still on it. Kokoro's own
 * normalizer (kokoro-js 1.2.1, `dist/kokoro.js`, the function bound to `m`)
 * handles quotes, titles, years, currency and decimals — but its punctuation
 * pass-through set is exactly `;:,.!?¡¿—…"«»“”(){}[]`, so `*`, `_`, `#`,
 * `°`, `%`, `&` and every emoji fall through to eSpeak-NG, which pronounces
 * the ones it knows ("asterisk", "hash") and mangles the rest. That is a
 * direct, verifiable source of "gibberish" independent of any dtype
 * question. VERIFIED by reading kokoro-js's bundle; see the WER table in
 * planning/run9/C-report.md for what it costs.
 *
 * The length cap has a source too. `KokoroTTS.generate` tokenizes with
 * `{ truncation: true }` and `generate_from_ids` computes its style-vector
 * offset as `256 * Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509)` —
 * so anything past 509 phoneme tokens is both silently truncated by the
 * tokenizer and clamped to the 509-token style vector. Kokoro's model card
 * states the same 510-token limit. We split well before that: see
 * MAX_SPEECH_CHARS.
 *
 * Pure string logic, no imports — safe to unit-test under Node and safe to
 * bundle into the worker.
 */

/**
 * Longest run of characters handed to Kokoro in one `generate` call.
 *
 * Kokoro's hard limit is 510 phoneme tokens (see the module note). English
 * text phonemizes to slightly FEWER tokens than it has characters — measured
 * with kokoro-js's own phonemizer over this lane's fixture sentences at
 * 0.80-0.95 phoneme tokens per character (see the "phoneme ratio" section of
 * planning/run9/C-report.md) — but "slightly fewer" is not a guarantee, and a
 * silent truncation is exactly the failure mode we are here to remove. 320
 * characters leaves roughly a 40% margin against the 509-token clamp at the
 * worst ratio observed, and is still long enough that no tutor reply in the
 * fixture set splits at all: the reference husky sentence is 151 characters.
 */
export const MAX_SPEECH_CHARS = 320;

const DASHES = '‐‑‒–—―−';

/** Words a long sentence may be split before, when it has no comma. */
const CONJUNCTIONS = ['and', 'but', 'or', 'so', 'yet', 'because', 'while', 'then', 'that'];

/** Everything that is markdown decoration rather than speech. */
function stripMarkdown(input: string): string {
  let out = input;
  // `[text](url)` -> `text`, before any bracket is touched.
  out = out.replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, '$1');
  // Leading list bullets, block quotes and ATX headings, possibly nested
  // ("> - item"). Bounded loop: each pass must consume something.
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/^\s*(?:[-*+•>]\s+|\d+[.)]\s+|#{1,6}\s*)/, '');
    if (next === out) break;
    out = next;
  }
  // Emphasis and inline code. `*` and `_` carry no meaning in spoken English
  // prose, so they go wholesale rather than by matched pairs — an unbalanced
  // `**` (common in truncated model output) would otherwise survive.
  out = out.replace(/[*_`]+/g, '');
  return out;
}

/** Curly quotes, dash variants and ellipses down to what Kokoro's own
 * punctuation set understands. */
function normalizePunctuation(input: string): string {
  return (
    input
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”‟«»]/g, '"')
      .replace(/…/g, '.')
      .replace(/\.{3,}/g, '.')
      // A run of two or more dashes is a pause, not a hyphen.
      .replace(new RegExp(`\\s*[-${DASHES}]{2,}\\s*`, 'g'), ', ')
      // A spaced single dash is also a pause.
      .replace(new RegExp(`\\s+[${DASHES}-]\\s+`, 'g'), ', ')
      // Any surviving exotic dash is an ordinary hyphen ("wolf-dog").
      .replace(new RegExp(`[${DASHES}]`, 'g'), '-')
  );
}

/** `50°` / `90%` / `&` — none of which Kokoro's normalizer expands. */
function expandSymbols(input: string): string {
  return input
    .replace(/(\d+)\s*°/g, (_m, n: string) => `${n} ${n === '1' ? 'degree' : 'degrees'}`)
    .replace(/°/g, ' degrees')
    .replace(/(\d)\s*%/g, '$1 percent')
    .replace(/%/g, ' percent')
    .replace(/\s*&\s*/g, ' and ');
}

/** Emoji, pictographs, variation selectors and joiners. */
function stripNonSpeech(input: string): string {
  return input
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[​-‍︀-️\u{1F3FB}-\u{1F3FF}]/gu, '');
}

function tidy(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .trim();
}

/** Index of the best place to break `text` at or before `limit`. Prefers a
 * comma, then a conjunction, then any word boundary. Returns the index of
 * the first character of the SECOND piece. */
function breakPoint(text: string, limit: number): number {
  const window = text.slice(0, limit + 1);

  const comma = window.lastIndexOf(', ');
  if (comma > 0) return comma + 2;

  let best = -1;
  for (const word of CONJUNCTIONS) {
    const re = new RegExp(`\\s${word}\\s`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(window)) !== null) {
      if (m.index + 1 > best) best = m.index + 1;
    }
  }
  if (best > 0) return best;

  const space = window.lastIndexOf(' ');
  if (space > 0) return space + 1;

  // A single unbroken run longer than the limit: cut it rather than
  // hand Kokoro something it will silently truncate.
  return limit;
}

/**
 * Turns one LLM sentence into the pieces to speak, in order.
 *
 * Returns `[]` when nothing speakable survives (an emoji-only or
 * decoration-only "sentence"), which the caller must treat as "say nothing"
 * rather than "say the empty string" — Kokoro on empty input produces a
 * click.
 */
export function prepareForSpeech(sentence: string): string[] {
  const cleaned = tidy(
    expandSymbols(stripNonSpeech(normalizePunctuation(stripMarkdown(sentence)))),
  );
  if (!/[A-Za-z0-9]/.test(cleaned)) return [];
  if (cleaned.length <= MAX_SPEECH_CHARS) return [cleaned];

  const pieces: string[] = [];
  let rest = cleaned;
  // Bounded: `breakPoint` always returns >= 1, so `rest` strictly shrinks.
  while (rest.length > MAX_SPEECH_CHARS) {
    const at = breakPoint(rest, MAX_SPEECH_CHARS);
    const head = rest.slice(0, at).trim();
    if (head) pieces.push(head);
    rest = rest.slice(at).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}
