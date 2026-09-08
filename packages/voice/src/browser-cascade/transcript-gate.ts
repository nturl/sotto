/**
 * The single gate between Whisper and the LLM in the browser cascade
 * (run 9 lane A).
 *
 * Why it exists: in run 8's live session the learner held push-to-talk and
 * asked about the gray husky dog; the transcript that reached the LLM was
 * the single word "you". "you" is Whisper's stock output on silence or a
 * near-silent segment — it is one of a small set of phrases the model was
 * trained toward by subtitle data (the others here: "thank you", "thanks
 * for watching", "[music]", "Subtitles by ...") and it emits them
 * confidently, with no low-confidence signal a caller could use. The tutor
 * then answered a question nobody had asked, at length. There is no repair
 * for that downstream: the only fix is to never hand it over.
 *
 * Before this module the worker's only filter was `isDegenerateTranscript`
 * (stt-fallback.ts), which catches the "de de de de..." decoder collapse
 * and nothing else — by construction it ignores anything under four words,
 * so every single-word hallucination sailed through. That check is folded
 * in here so there is ONE gate with one verdict vocabulary, rather than two
 * half-filters in two modules. stt-fallback.ts keeps its own copy for its
 * own separate job (deciding whether WebGPU STT has gone bad), which is a
 * different question about the same string.
 *
 * Pure: no ML, no DOM, no worker globals. worker.ts is the only caller.
 */

/**
 * What the learner sees when a turn is rejected. English only for now.
 *
 * It lives here as a constant rather than being built at the call site so
 * that lane D (or whoever wires the client's i18n to the worker) has one
 * place to map to a translation key — the worker itself has no i18n table,
 * and inventing one for a single string would be worse than this. See
 * planning/run9/A-report.md.
 */
export const NOT_CAUGHT_CAPTION = "I didn't catch that. Could you say it again?";

/**
 * Shorter than this and there is not enough audio for Whisper to have heard
 * a word, whatever it returns. Chosen against the human floor rather than a
 * model property: the shortest real one-syllable answers ("no", "sí") run
 * 200-300 ms of voiced audio, and a push-to-talk press that releases inside
 * a quarter second is a mis-tap, not an utterance.
 */
export const MIN_SEGMENT_MS = 250;

/**
 * The energy at which the VAD is willing to call a window speech —
 * deliberately the same 0.02 as `EnergyVad`'s default `rmsThreshold`,
 * because the question this gate asks ("was there ever any speech in this
 * segment?") is the same question the VAD asks per window, just applied
 * once to the whole segment via its PEAK. Mean RMS is the wrong statistic
 * here: a real utterance arrives wrapped in 1.2 s of pre-roll and 1 s of
 * end-of-speech hangover, so its mean is dragged far below its peak.
 *
 * Kept in step with the VAD by intent, not by import: this module stays
 * dependency-free so it can be reasoned about (and tested) as pure string +
 * number logic. The vad.test.ts / transcript-gate.test.ts pair both pin
 * 0.02, so a drift shows up as a failing test rather than silently.
 */
export const SPEECH_RMS_THRESHOLD = 0.02;

/**
 * Below this there was no acoustic event at all — not quiet speech, not
 * distant speech, nothing but the noise floor of a muted or unplugged
 * input. Whatever Whisper returned for such a segment is fabricated.
 * A quarter of the speech threshold: comfortably under any real voice,
 * comfortably over digital-zero-plus-dither.
 */
export const SILENT_RMS_THRESHOLD = 0.005;

export interface SegmentStats {
  durationMs: number;
  /** RMS over the whole segment. */
  meanRms: number;
  /** Loudest ~20 ms window — the statistic the gate actually uses. */
  peakRms: number;
}

const RMS_WINDOW_MS = 20;

/**
 * Measures a captured PCM16 segment. Lives here (rather than in worker.ts)
 * so the numbers the gate consumes are produced by tested code.
 */
export function measureSegment(segment: Int16Array, sampleRate = 16000): SegmentStats {
  if (segment.length === 0) return { durationMs: 0, meanRms: 0, peakRms: 0 };

  const durationMs = (segment.length / sampleRate) * 1000;
  const windowSamples = Math.max(1, Math.round((sampleRate * RMS_WINDOW_MS) / 1000));

  let totalSquares = 0;
  let peakRms = 0;
  let windowSquares = 0;
  let windowCount = 0;

  for (let i = 0; i < segment.length; i++) {
    const normalized = segment[i]! / 32768;
    const square = normalized * normalized;
    totalSquares += square;
    windowSquares += square;
    windowCount++;
    if (windowCount === windowSamples) {
      const rms = Math.sqrt(windowSquares / windowCount);
      if (rms > peakRms) peakRms = rms;
      windowSquares = 0;
      windowCount = 0;
    }
  }
  // Trailing partial window — measured too, so a short segment (which may
  // be nothing but a partial window) is never reported as silent.
  if (windowCount > 0) {
    const rms = Math.sqrt(windowSquares / windowCount);
    if (rms > peakRms) peakRms = rms;
  }

  return {
    durationMs,
    meanRms: Math.sqrt(totalSquares / segment.length),
    peakRms,
  };
}

export type TranscriptVerdict = 'ok' | 'hallucination' | 'too_short' | 'silent';

export interface TranscriptClassification {
  verdict: TranscriptVerdict;
  /** Short machine-ish tag for the `stt_rejected` metric detail. */
  reason: string;
}

export interface TranscriptContext {
  /** Length of the captured segment. */
  durationMs: number;
  /** The segment's PEAK RMS — see `SPEECH_RMS_THRESHOLD`. */
  rms: number;
  /**
   * The learner's learning locale (worker.ts passes
   * `payload.learner.learningLocale`). Used as the segmentation hint for
   * `countWords` — a Chinese or Japanese transcript carries no spaces, so
   * splitting on ' ' would count an entire sentence as one word and hand
   * every zh/ja turn to the short-and-quiet rule below (run 9 lane R,
   * P1-1). It is NOT used to pick stock-phrase lists: those are still
   * English-only, because inventing per-locale ones without a recording set
   * to check them against would be guessing.
   */
  locale?: string;
}

/**
 * Whisper's stock silence output, normalized (lowercase, punctuation and
 * bracketing stripped, whitespace collapsed). Every entry here is a phrase
 * the model emits ON SILENCE with high confidence AND which no learner
 * plausibly offers as their whole turn — so these are rejected at any
 * energy. "you" is the run-8 failure itself; the subtitle-corpus phrases
 * and the bracketed sound tags are never speech.
 */
const STOCK_HALLUCINATIONS = new Set([
  'you',
  'thanks for watching',
  'thank you for watching',
  'thanks for watching and see you next time',
  'bye bye',
  'goodbye',
  'hmm',
  'mm',
  'mhm',
  'uh',
  'um',
  'ah',
  'oh',
  'music',
  'blank audio',
  'silence',
  'applause',
  'inaudible',
]);

/**
 * Phrases Whisper also emits on silence, but which are ORDINARY ANSWERS to
 * the questions this tutor is pushed to ask ("shall we go on?"). Rejecting
 * them unconditionally, as run 9 lane A did, left the learner with no
 * escape: answering "Okay" again produced the same re-ask, forever (lane R,
 * P1-8). They are rejected only when the segment never reached speech
 * energy — the ambiguous case the gate exists for. At a normal speaking
 * level they pass, because at that level the learner really did say them.
 */
const QUIET_ONLY_HALLUCINATIONS = new Set(['okay', 'ok', 'bye', 'thanks', 'thank you']);

/**
 * Attribution boilerplate Whisper picked up from subtitle corpora. Matched
 * as a prefix because the tail varies ("by the Amara.org community", "by
 * Steamteam", a channel name).
 */
const STOCK_PREFIXES = ['subtitles by', 'subtitles', 'subs by', 'transcription by', 'amara org'];

/**
 * Strips case, punctuation and subtitle bracketing so "[MUSIC]", "(Music)"
 * and "music." all collapse onto one key. Unicode-aware so accented and
 * CJK transcripts survive: only marks and punctuation go, letters stay.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scripts written without inter-word spaces. Han, hiragana, katakana and the
 * CJK compatibility block: enough to cover the zh-CN / zh-TW packs that ship
 * today and Japanese if it ever does.
 */
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

/**
 * Splits a normalized transcript into "words" for the length rules below.
 *
 * Splitting on ' ' is right for every space-delimited script and wrong for
 * Chinese and Japanese, where a whole sentence normalizes to ONE token —
 * which made `words.length <= 2` true for every zh turn of any length, so a
 * zh learner on a quiet mic lost every turn to "I didn't catch that" (run 9
 * lane R, P1-1). Where the text contains CJK we segment instead:
 * `Intl.Segmenter` when the runtime has it (every browser that can run
 * WebGPU does; `locale` is passed straight through as its hint), and
 * otherwise one CJK character = one word, which is the same order of
 * magnitude and is all these rules need.
 */
export function countWords(normalized: string, locale?: string): number {
  if (!normalized) return 0;
  const spaced = normalized.split(' ').filter(Boolean);
  if (!CJK_RE.test(normalized)) return spaced.length;

  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity?: string },
      ) => { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };
    }
  ).Segmenter;
  if (typeof Segmenter === 'function') {
    try {
      const segmenter = new Segmenter(locale || 'zh', { granularity: 'word' });
      let n = 0;
      for (const part of segmenter.segment(normalized)) if (part.isWordLike) n++;
      if (n > 0) return n;
    } catch {
      // Fall through to the character count below.
    }
  }
  // One CJK character per word; runs of non-CJK stay whole.
  const chars = normalized.match(
    /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|[^\s\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/gu,
  );
  return chars ? chars.length : spaced.length;
}

/**
 * How much of a captured segment the learner actually spoke.
 *
 * A push-to-talk press seeds the segment with up to `PTT_PRE_ROLL_MS` of
 * rolling pre-roll (vad.ts `SpeechBuffer.start`), so measuring the seeded
 * segment made a 50 ms mis-tap look like 350 ms of speech: it cleared
 * `MIN_SEGMENT_MS`, ran Whisper over 300 ms of room tone and came back with
 * a stock hallucination, which then got the re-ask caption a fumbled button
 * must never get (run 9 lane R, P1-2). The seed is not speech, so it does
 * not count toward the too-short test.
 */
export function spokenDurationMs(
  segmentSamples: number,
  sampleRate: number,
  seededPreRollMs = 0,
): number {
  if (sampleRate <= 0) return 0;
  return Math.max(0, (segmentSamples / sampleRate) * 1000 - seededPreRollMs);
}

/**
 * The "de de de de..." decoder collapse. Same rule as
 * `isDegenerateTranscript` in stt-fallback.ts, restated here rather than
 * imported so this module stays the self-contained gate (that one is
 * retained for the separate WebGPU-health decision it feeds).
 */
function isDegenerate(words: string[]): boolean {
  if (words.length < 4) return false;
  const uniq = new Set(words);
  if (uniq.size <= 2) return true;
  if (words.length >= 6 && uniq.size / words.length < 0.3) return true;
  return false;
}

/**
 * The gate. Order matters and is deliberate: capture problems are decided
 * before content problems, so a clipped push-to-talk press is reported as
 * `too_short` (which the caller drops silently — the learner knows they
 * fumbled the button) rather than as a hallucination (which prompts them to
 * repeat a thing they never said).
 */
export function classifyTranscript(
  text: string,
  { durationMs, rms, locale }: TranscriptContext,
): TranscriptClassification {
  if (durationMs < MIN_SEGMENT_MS) {
    return { verdict: 'too_short', reason: `duration_${Math.round(durationMs)}ms` };
  }

  const normalized = normalize(text);
  if (!normalized) {
    // Includes the pure-punctuation cases (".", "…") once normalize() has
    // stripped them: nothing was said either way.
    return { verdict: text.trim() ? 'hallucination' : 'silent', reason: 'no_words' };
  }

  if (rms < SILENT_RMS_THRESHOLD) {
    return { verdict: 'silent', reason: `rms_${rms.toFixed(4)}` };
  }

  if (STOCK_HALLUCINATIONS.has(normalized)) {
    return { verdict: 'hallucination', reason: `stock_${normalized.replace(/ /g, '_')}` };
  }
  if (QUIET_ONLY_HALLUCINATIONS.has(normalized) && rms < SPEECH_RMS_THRESHOLD) {
    return { verdict: 'hallucination', reason: `quiet_stock_${normalized.replace(/ /g, '_')}` };
  }
  if (STOCK_PREFIXES.some((p) => normalized.startsWith(p))) {
    return { verdict: 'hallucination', reason: 'stock_subtitle_credit' };
  }

  const words = normalized.split(' ');
  if (isDegenerate(words)) {
    return { verdict: 'hallucination', reason: 'degenerate_repetition' };
  }

  // A short transcript from a segment that never reached speech energy is
  // the ambiguous case this gate is really for. Longer transcripts are
  // spared: a distant-but-real sentence is still a sentence, and enough
  // words is itself evidence that something was said. `countWords` is what
  // makes "short" mean the same thing in a script with no spaces.
  if (countWords(normalized, locale) <= 2 && rms < SPEECH_RMS_THRESHOLD) {
    return { verdict: 'hallucination', reason: `short_quiet_rms_${rms.toFixed(4)}` };
  }

  return { verdict: 'ok', reason: 'ok' };
}
