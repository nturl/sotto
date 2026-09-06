/**
 * Energy VAD for the in-browser tutor — a direct port of the verified
 * fallback in apps/server/src/voice/vad.ts (same thresholds, same hangover
 * logic, same speech_start/speech_end semantics), with the Node/onnxruntime
 * Silero path dropped: Silero is unverified on this machine (see that
 * file's KNOWN ISSUE note) and onnxruntime-node cannot run in a browser
 * worker anyway.
 *
 * Kept pure and dependency-free so it can be unit-tested under vitest and
 * bundled into the worker unchanged.
 */

/**
 * `process()` internally re-chunks whatever it's given into fixed ~20 ms
 * evaluation windows before applying the threshold logic below. Found live
 * while diagnosing slice 5 (docs/evidence/browser-tutor-slice5-2026-09-05.log):
 * the server's vad.ts (and this file's own tests, and the class below) were
 * all written and verified assuming ~20 ms input frames, but the browser's
 * actual source — `WebAudioAdapter`'s AudioWorkletProcessor
 * (packages/voice/src/transports/web-audio.ts) — posts one message per audio
 * render quantum, roughly 2.7 ms of PCM16 at 16 kHz, about 8x finer. Feeding
 * that straight into a hard "any below-threshold frame zeroes the
 * accumulator" state machine makes it far more fragile than it was designed
 * for: ordinary voiced speech has brief near-zero-crossing dips several
 * times a second, and at 2.7 ms granularity those dips reset `aboveMs`
 * before it ever reaches `minSpeechMs`. Confirmed live: a session's first
 * utterance was detected (an unusually loud, not-yet-gain-settled capture
 * happened to stay continuously above threshold for long enough), but every
 * later utterance in the same session — measured with comfortably
 * above-threshold peak RMS the whole time — never fired `speech_start`
 * again, because the *sustained* run length at 2.7 ms resolution kept
 * getting cut short. Evaluating on ~20 ms windows (call `evaluate()` only
 * once enough samples have accumulated) restores the granularity this class
 * was actually tuned and tested against, independent of whatever cadence
 * the caller's frames happen to arrive at. `SpeechBuffer` is untouched — the
 * full-resolution audio still gets forwarded to STT unchanged; only the VAD
 * *decision* is now made on a coarser, more representative window.
 */

export type VadEventType = 'speech_start' | 'speech_end';

export interface VadEvent {
  type: VadEventType;
}

export interface EnergyVadOptions {
  /** 0..1 normalized RMS. */
  rmsThreshold?: number;
  /** Sustained speech before speech_start fires. */
  minSpeechMs?: number;
  /** Sustained silence before speech_end fires. */
  silenceEndMs?: number;
  sampleRate?: number;
}

const SAMPLE_RATE = 16000;

export function computeRms(frame: Int16Array): number {
  if (frame.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < frame.length; i++) {
    const normalized = frame[i]! / 32768;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / frame.length);
}

const EVAL_WINDOW_MS = 20;

export class EnergyVad {
  readonly backend = 'energy' as const;
  private readonly rmsThreshold: number;
  private readonly minSpeechMs: number;
  private readonly silenceEndMs: number;
  private readonly sampleRate: number;
  private readonly evalSamples: number;

  private speaking = false;
  private aboveMs = 0;
  private belowMs = 0;

  // Re-chunking buffer — see the class comment above.
  private pending: Int16Array[] = [];
  private pendingSamples = 0;

  constructor(opts: EnergyVadOptions = {}) {
    this.rmsThreshold = opts.rmsThreshold ?? 0.02;
    this.minSpeechMs = opts.minSpeechMs ?? 300;
    // BUGS-TUTOR-RUN5.md #4: 700ms cut off a learner's mid-sentence
    // thinking-pause and sent the fragment to STT as if it were a complete
    // utterance. 1000ms (see apps/server/src/voice/vad.ts, same tuning).
    this.silenceEndMs = opts.silenceEndMs ?? 1000;
    this.sampleRate = opts.sampleRate ?? SAMPLE_RATE;
    this.evalSamples = Math.max(1, Math.round((this.sampleRate * EVAL_WINDOW_MS) / 1000));
  }

  reset(): void {
    this.speaking = false;
    this.aboveMs = 0;
    this.belowMs = 0;
    this.pending = [];
    this.pendingSamples = 0;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Pulls exactly `n` samples off `pending`, splitting the head chunk if it
   * straddles the boundary, and leaves the remainder queued for next time. */
  private drawChunk(n: number): Int16Array {
    const out = new Int16Array(n);
    let filled = 0;
    while (filled < n) {
      const head = this.pending[0]!;
      const need = n - filled;
      if (head.length <= need) {
        out.set(head, filled);
        filled += head.length;
        this.pending.shift();
      } else {
        out.set(head.subarray(0, need), filled);
        this.pending[0] = head.subarray(need);
        filled += need;
      }
    }
    this.pendingSamples -= n;
    return out;
  }

  process(frame: Int16Array): VadEvent[] {
    if (frame.length > 0) {
      this.pending.push(frame);
      this.pendingSamples += frame.length;
    }
    const events: VadEvent[] = [];
    while (this.pendingSamples >= this.evalSamples) {
      events.push(...this.evaluate(this.drawChunk(this.evalSamples)));
    }
    return events;
  }

  private evaluate(frame: Int16Array): VadEvent[] {
    const events: VadEvent[] = [];
    const rms = computeRms(frame);
    const frameMs = (frame.length / this.sampleRate) * 1000;

    if (rms >= this.rmsThreshold) {
      this.aboveMs += frameMs;
      this.belowMs = 0;
    } else {
      this.belowMs += frameMs;
      this.aboveMs = 0;
    }

    if (!this.speaking && this.aboveMs >= this.minSpeechMs) {
      this.speaking = true;
      events.push({ type: 'speech_start' });
    } else if (this.speaking && this.belowMs >= this.silenceEndMs) {
      this.speaking = false;
      events.push({ type: 'speech_end' });
    }

    return events;
  }
}

/**
 * Rolling pre-roll buffer. Same purpose and duration as the server's
 * PRE_BUFFER_MS (apps/server/src/voice/session.ts): the VAD's minSpeechMs
 * onset delay would otherwise clip the first word or two off every
 * utterance, which a live run actually did.
 */
export const PRE_BUFFER_MS = 1200;

export class SpeechBuffer {
  private pre: Int16Array[] = [];
  private preMs = 0;
  private speech: Int16Array[] = [];
  private capturing = false;

  constructor(
    private readonly sampleRate = SAMPLE_RATE,
    private readonly preBufferMs = PRE_BUFFER_MS,
  ) {}

  private ms(frame: Int16Array): number {
    return (frame.length / this.sampleRate) * 1000;
  }

  get isCapturing(): boolean {
    return this.capturing;
  }

  push(frame: Int16Array): void {
    if (this.capturing) {
      this.speech.push(frame);
      return;
    }
    this.pre.push(frame);
    this.preMs += this.ms(frame);
    while (this.preMs > this.preBufferMs && this.pre.length > 0) {
      this.preMs -= this.ms(this.pre.shift()!);
    }
  }

  /** Begin an utterance, seeded with whatever pre-roll we have. */
  start(): void {
    this.capturing = true;
    this.speech = [...this.pre];
  }

  /** End an utterance and return it as one contiguous buffer (null if empty). */
  end(): Int16Array | null {
    this.capturing = false;
    if (this.speech.length === 0) return null;
    const total = this.speech.reduce((n, f) => n + f.length, 0);
    const out = new Int16Array(total);
    let offset = 0;
    for (const f of this.speech) {
      out.set(f, offset);
      offset += f.length;
    }
    this.speech = [];
    this.pre = [];
    this.preMs = 0;
    return out;
  }

  clear(): void {
    this.capturing = false;
    this.speech = [];
    this.pre = [];
    this.preMs = 0;
  }
}
