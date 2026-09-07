/**
 * Shape guards for what the in-browser 2B model actually says (run 9, lane B).
 *
 * The prompt has always asked for plain, short, spoken prose — but nothing
 * between the LLM stream and TTS ever CHECKED it. Noel's live Discuss turn
 * (planning/run9/PLAN.md) came back as a filler line ("Okay, let's see.")
 * followed by a five-line markdown list, and every one of those lines was
 * chunked into a "sentence" and spoken, dashes and asterisks included. A 2B
 * model does not reliably obey a prose instruction; a deterministic pass over
 * its output does.
 *
 * Two pieces, both pure so they can be unit-tested without a model:
 *
 * - `ReplyNormalizer` / `normalizeReplyText` — strip markdown list markers,
 *   headings, blockquotes, emphasis, emoji, collapse newlines to spaces, and
 *   drop a leading filler sentence.
 * - `ReplyBudget` — count the sentences the chunker emits and say when the
 *   per-mode cap is reached, so `llm-turn.ts` can stop speaking (and stop
 *   generating) rather than reading a five-line list aloud.
 *
 * The normalizer is STREAMING-safe, in the same sense as `markers.ts`'s
 * `safeReleaseIndex`: a line-start rule cannot be applied to a line whose
 * start has arrived but whose first word has not, so the tail of the buffer
 * is held back until it is decidable. Without that holdback, a delta ending
 * in "\n" followed by a delta of "-" releases the "-" as prose and the tutor
 * literally speaks "dash".
 */
import type { TutorMode } from '@sotto/core';

/**
 * A list bullet, an ordered-list number, a markdown heading or a blockquote
 * marker, at the start of a line. `•·` are the bullets kokoro-js
 * would otherwise try to pronounce; the dashes cover the en/em dash a model
 * sometimes uses as a bullet.
 */
const LINE_MARKER_RE = /^[ \t]*(?:[-*+•·–—]|\d{1,3}[.)]|#{1,6}|>)[ \t]+/;

/**
 * Emphasis and code punctuation, stripped everywhere rather than only in
 * matched pairs: a streamed reply routinely delivers the opening `**` in one
 * chunk and the closing one in another, so pair matching is not available at
 * the point the text has to be spoken, and a lone asterisk is never wanted in
 * speech anyway. `#` is NOT in this set — it only means "heading" at a line
 * start (handled above), and stripping it everywhere would mangle "#1".
 */
const EMPHASIS_RE = /[*_`~]/g;

/**
 * Emoji, pictographs, flag pairs, the variation selector, the ZWJ that joins
 * a family emoji and the keycap combiner. Kokoro turns these into noise or
 * into a spoken word ("sparkles"), neither of which belongs in a tutor turn.
 */
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u200D|\u20E3/gu;

/** Skin-tone modifiers, which are not Extended_Pictographic on their own. */
const SKIN_TONE_RE = /[\u{1F3FB}-\u{1F3FF}]/gu;

/**
 * Openers the 2B model prepends before actually answering. Noel's transcript
 * opened with the first of these as its own spoken caption line. Matched only
 * as a COMPLETE leading sentence (the terminal full stop is part of the
 * pattern), so "Okay is not a word in the passage." is left alone.
 */
const FILLER_SENTENCES = [
  "okay, let's see.",
  "ok, let's see.",
  "alright, let's see.",
  "let's see.",
  'great question.',
  'good question.',
  'okay.',
  'ok.',
  'alright.',
  'sure.',
  'well.',
];

/** Longest filler + a margin: past this many characters with no sentence end,
 * no filler can still be matched, so the buffer can be released. */
const FILLER_LOOKAHEAD = 24;

/** Curly apostrophes and the like, folded so the filler list matches. */
function foldApostrophes(s: string): string {
  return s.replace(/[‘’ʼ]/g, "'");
}

/** Strips as many leading filler sentences as are actually there (a model
 * that says "Okay." sometimes says "Okay. Let's see." too). */
function stripLeadingFiller(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) {
    const lead = out.replace(/^\s+/, '');
    const probe = foldApostrophes(lead).toLowerCase();
    const hit = FILLER_SENTENCES.find((f) => probe.startsWith(f));
    if (!hit) break;
    out = lead.slice(hit.length);
  }
  return out;
}

/**
 * How much of `buf` can be normalized and released now. Everything after the
 * last newline is held back while it could still turn into a line marker —
 * i.e. while it is only whitespace and marker punctuation. As soon as a real
 * word character arrives the line is decidable and the whole buffer goes.
 */
function normalizeReleaseIndex(buf: string): number {
  // A trailing lone high surrogate is half an emoji whose other half has not
  // arrived; released now, neither half would ever match EMOJI_RE and the
  // pair would reassemble downstream as an unstripped emoji.
  const lastCode = buf.charCodeAt(buf.length - 1);
  const surrogateSafe = lastCode >= 0xd800 && lastCode <= 0xdbff ? buf.length - 1 : buf.length;

  const nl = buf.lastIndexOf('\n');
  if (nl === -1) return surrogateSafe;
  const tail = buf.slice(nl + 1);
  if (tail.length > FILLER_LOOKAHEAD) return surrogateSafe;
  return /^[ \t\-*+•·–—>#\d.)]*$/.test(tail) ? nl : surrogateSafe;
}

/**
 * Stateful, streaming version of `normalizeReplyText`. One instance per
 * engine turn (like `SentenceChunker`): `push` each cleaned delta and feed
 * whatever it returns to the chunker, then `flush` at end of stream.
 */
export class ReplyNormalizer {
  private buf = '';
  private atLineStart = true;
  private fillerResolved = false;

  push(delta: string): string {
    this.buf += delta;
    if (!this.fillerResolved) {
      const lead = this.buf.replace(/^\s+/, '');
      // Decidable once a sentence has actually ended, or once the buffer is
      // longer than any filler could be.
      if (!/[.!?…]/.test(lead) && lead.length <= FILLER_LOOKAHEAD) return '';
      this.buf = stripLeadingFiller(this.buf);
      this.fillerResolved = true;
    }
    const idx = normalizeReleaseIndex(this.buf);
    if (idx <= 0) return '';
    const release = this.buf.slice(0, idx);
    this.buf = this.buf.slice(idx);
    return this.normalize(release);
  }

  /** End of stream: release whatever is still held back. */
  flush(): string {
    if (!this.fillerResolved) {
      this.buf = stripLeadingFiller(this.buf);
      this.fillerResolved = true;
    }
    const rest = this.buf;
    this.buf = '';
    return rest ? this.normalize(rest) : '';
  }

  private normalize(input: string): string {
    const lines = input.split('\n');
    let out = '';
    for (let i = 0; i < lines.length; i++) {
      const isLineStart = i === 0 ? this.atLineStart : true;
      const line = isLineStart ? lines[i]!.replace(LINE_MARKER_RE, '') : lines[i]!;
      out += i === 0 ? line : ` ${line}`;
    }
    this.atLineStart = input.endsWith('\n');
    return out
      .replace(EMOJI_RE, '')
      .replace(SKIN_TONE_RE, '')
      .replace(EMPHASIS_RE, '')
      .replace(/[ \t]{2,}/g, ' ');
  }
}

/**
 * Whole-string convenience over `ReplyNormalizer` — same rules, for a reply
 * that is already complete (tests, and any caller that is not streaming).
 */
export function normalizeReplyText(text: string): string {
  const n = new ReplyNormalizer();
  return `${n.push(text)}${n.flush()}`.replace(/\s+/g, ' ').trim();
}

/**
 * Spoken-sentence caps. `discuss` gets three rather than the prompt's two so
 * the contract's "two sentences that answer, then one question" fits exactly;
 * `read_to_me` reads the passage aloud and cannot be capped at all; the two
 * feedback modes get the prompt's two.
 */
export const SENTENCE_CAPS: Record<TutorMode, number | null> = {
  discuss: 3,
  read_to_me: null,
  read_with_me: 2,
  pronunciation: 2,
};

export function sentenceCapForMode(mode: TutorMode | undefined): number | null {
  return mode ? SENTENCE_CAPS[mode] : null;
}

/**
 * The generation ceiling per mode. 400 tokens is roughly a five-line list —
 * exactly what Noel got — and a 2B model fills whatever room it is given, so
 * the conversational modes get a ceiling that cannot hold one. `read_to_me`
 * keeps 400 because it may have to read several passage sentences verbatim.
 *
 * 240, not the 160 run 9 lane B first set: this budget also has to hold the
 * tool call. Qwen3.5-2B rejects OpenAI-shaped `tools` outright
 * (`llm_tools_unsupported`, observed live by lanes A and E and again in the
 * acceptance run), so worker.ts falls back to asking for a fenced ```tool
 * JSON block in the reply itself — inside this same ceiling. A block cut
 * off before its closing fence does not parse, so the tool silently never
 * runs while the prose has already promised it (run 9 lane R, P1-6). Three
 * sentences plus a block needs roughly 110 tokens; 240 leaves margin
 * without being anywhere near the five-line list 400 allowed.
 */
export function maxTokensForMode(mode: TutorMode | undefined): number {
  return mode === 'read_to_me' || mode === undefined ? 400 : 240;
}

/** Counts spoken sentences against the per-mode cap. */
export class ReplyBudget {
  private spoken = 0;

  constructor(private readonly cap: number | null) {}

  static forMode(mode: TutorMode | undefined): ReplyBudget {
    return new ReplyBudget(sentenceCapForMode(mode));
  }

  get reached(): boolean {
    return this.cap !== null && this.spoken >= this.cap;
  }

  get count(): number {
    return this.spoken;
  }

  /** Records one sentence about to be spoken; false when the cap is already
   * reached and this sentence (and everything after it) must be dropped. */
  take(): boolean {
    if (this.reached) return false;
    this.spoken += 1;
    return true;
  }
}
