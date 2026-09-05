/**
 * The STT/LLM-contention safety net (planning/BROWSER-TUTOR.md, "Open
 * issue" note; root-caused and fixed in
 * docs/evidence/browser-tutor-stt-regression-2026-09-05.log).
 *
 * Root cause: once the ~1.1 GB Qwen3 WebLLM engine is also resident on the
 * same WebGPU device, whisper's WebGPU execution can regress from ~1s to
 * ~20s and emit a degenerate repeated-token transcript ("de de de de...").
 * This is GPU memory/scheduling pressure, not a code bug in the pipeline
 * construction (the whisper pipeline is already created once and reused —
 * see `sttPipeline` in worker.ts — and STT/LLM inference never run
 * concurrently: `transcribeSegment` awaits the whisper call fully before
 * `runTutorTurn` ever touches the LLM).
 *
 * The realistic deployment condition (a stranger's laptop/phone with
 * nothing else on the GPU) is clean — see the evidence log's experiment
 * (c). The failure mode only reproduces when something else (this
 * developer machine's native llama-server, or a phone under real memory
 * pressure) is also holding GPU memory. Rather than gate correctness on
 * that being true, this module gives every session a fallback: if WebGPU
 * STT is ever too slow or produces a degenerate transcript, switch that
 * session to wasm for the rest of its life. wasm is slower per-call but
 * immune to the WebGPU contention that causes the regression.
 *
 * Pure logic only — no ML calls — so it can be unit-tested with fake
 * timings and fake transcripts (see stt-fallback.test.ts). worker.ts is the
 * only caller that wires this to a real whisper pipeline reload.
 */

/** Above this, a WebGPU STT call is treated as failed even if it eventually
 * returns something — matches this document's ">20s per-turn" escalation
 * threshold, with headroom below it so the fallback engages before a
 * learner would call the app broken. */
export const STT_LATENCY_FALLBACK_MS = 8000;

/**
 * Detects the "de de de de..." failure mode: a transcript that is mostly
 * one or two tokens repeated, rather than real speech. Real short
 * utterances ("no", "sí", "cigarra") are 1-3 words and never trip this;
 * genuine repeated words in real speech ("no no no, espera") are rare and
 * short enough not to cross the length threshold below.
 */
export function isDegenerateTranscript(text: string): boolean {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;

  const uniq = new Set(words);
  // Almost the whole transcript is one or two distinct tokens repeated.
  if (uniq.size <= 2) return true;
  // General repetition: on a longer transcript, well under a third of the
  // words are actually distinct.
  if (words.length >= 6 && uniq.size / words.length < 0.3) return true;
  return false;
}

export interface SttAttempt {
  /** Wall-clock time the transcription call itself took. */
  ms: number;
  text: string;
}

/**
 * Session-scoped: once WebGPU STT is judged unreliable, stay on wasm for
 * the rest of the session rather than re-testing WebGPU every utterance.
 */
export class SttFallbackTracker {
  private fellBack = false;
  private noted = false;

  /**
   * Call after every STT attempt. Returns true exactly once, the first
   * attempt that trips the fallback — the caller (worker.ts) reloads the
   * pipeline on wasm when this returns true.
   */
  shouldFallback(device: 'webgpu' | 'wasm', attempt: SttAttempt): boolean {
    if (this.fellBack || device !== 'webgpu') return false;
    const slow = attempt.ms > STT_LATENCY_FALLBACK_MS;
    const degenerate = isDegenerateTranscript(attempt.text);
    if (slow || degenerate) {
      this.fellBack = true;
      return true;
    }
    return false;
  }

  get hasFallenBack(): boolean {
    return this.fellBack;
  }

  /** The one-time caption-side note for the learner. Returns null every
   * time after the first call, so worker.ts can call it unconditionally
   * right after a `shouldFallback() === true` and post it at most once. */
  consumeNote(): string | null {
    if (!this.fellBack || this.noted) return null;
    this.noted = true;
    return 'Switching to a slower but more reliable speech recognizer for this session.';
  }
}
