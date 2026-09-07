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
  /** Reserved: no rule is locale-dependent yet, and inventing per-locale
   * stock-phrase lists without a recording set to check them against would
   * be guessing. Accepted now so worker.ts's call site does not change when
   * one lands. */
  locale?: string;
}

/**
 * Whisper's stock silence output, normalized (lowercase, punctuation and
 * bracketing stripped, whitespace collapsed). Every entry is a phrase the
 * model emits ON SILENCE with high confidence; none of them carry enough
 * meaning as a learner turn to be worth the risk of passing through. A
 * learner who genuinely says only "okay" loses that turn to one re-ask,
 * which is a far cheaper error than a fabricated question answered as fact.
 */
const STOCK_HALLUCINATIONS = new Set([
  'you',
  'thank you',
  'thanks',
  'thanks for watching',
  'thank you for watching',
  'thanks for watching and see you next time',
  'bye',
  'bye bye',
  'goodbye',
  'okay',
  'ok',
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
  { durationMs, rms }: TranscriptContext,
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
  // words is itself evidence that something was said.
  if (words.length <= 2 && rms < SPEECH_RMS_THRESHOLD) {
    return { verdict: 'hallucination', reason: `short_quiet_rms_${rms.toFixed(4)}` };
  }

  return { verdict: 'ok', reason: 'ok' };
}
