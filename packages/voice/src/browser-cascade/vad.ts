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

export class EnergyVad {
  readonly backend = 'energy' as const;
  private readonly rmsThreshold: number;
  private readonly minSpeechMs: number;
  private readonly silenceEndMs: number;
  private readonly sampleRate: number;

  private speaking = false;
  private aboveMs = 0;
  private belowMs = 0;

  constructor(opts: EnergyVadOptions = {}) {
    this.rmsThreshold = opts.rmsThreshold ?? 0.02;
    this.minSpeechMs = opts.minSpeechMs ?? 300;
    this.silenceEndMs = opts.silenceEndMs ?? 700;
    this.sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  }

  reset(): void {
    this.speaking = false;
    this.aboveMs = 0;
    this.belowMs = 0;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  process(frame: Int16Array): VadEvent[] {
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
