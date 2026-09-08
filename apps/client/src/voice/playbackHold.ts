/**
 * Holding `speaking` until the speakers actually stop (run 9 lane D
 * directive 3, PLAN.md diagnosis 4).
 *
 * The tutor turn runner posts `state: listening` when *generation* ends,
 * not when *playback* ends. The run-9 baseline of `voice-live.mjs` shows
 * the gap plainly: `speaking` at t+18.1s, `listening` at t+25.3s — but the
 * final tutor sentence was still queued in the AudioContext when the label
 * flipped, so for a couple of seconds the screen claimed it was listening
 * while the learner could still hear the tutor.
 *
 * `web-audio.ts` already computes exactly this (`playbackQueueEndAt`) but
 * keeps it private and exposes no drain callback, and its `AudioAdapter`
 * contract has no "utterance finished" hook. Rather than change that
 * shared contract, the same arithmetic is done here from the PCM the
 * provider forwards, and applied as a pure rule at the event layer.
 */
import type { VoiceState } from '@sotto/voice';

const BYTES_PER_PCM16_SAMPLE = 2;

export interface PlaybackTracker {
  /** Mirrors one `AudioAdapter.playPcm(buf, sampleRate)` call. `now` is the
   * moment the chunk was handed over (ms). */
  enqueue(byteLength: number, sampleRate: number, now: number): void;
  /** A barge-in / `stopPlayback()` — the queue is dropped, not drained. */
  clear(): void;
  /** Milliseconds of tutor audio still queued at `now` (never negative). */
  remainingMs(now: number): number;
}

export function createPlaybackTracker(): PlaybackTracker {
  let queueEndAt = 0;
  return {
    enqueue(byteLength, sampleRate, now) {
      if (byteLength <= 0 || sampleRate <= 0) return;
      const durationMs = (byteLength / BYTES_PER_PCM16_SAMPLE / sampleRate) * 1000;
      queueEndAt = Math.max(now, queueEndAt) + durationMs;
    },
    clear() {
      queueEndAt = 0;
    },
    remainingMs(now) {
      return Math.max(0, queueEndAt - now);
    },
  };
}

export interface SpeakingHold {
  /** The state to publish now. */
  state: VoiceState;
  /** When non-null, re-publish the original state after this many ms — the
   * queue is expected to have drained by then. */
  flushInMs: number | null;
}

/**
 * The only state ever held back is `listening`, and only while audio is
 * still queued. Everything else — `error`, `ended`, a `limit`, a `muted`
 * the learner just asked for — must land immediately: delaying those would
 * hide a real failure behind a label that says the tutor is still talking.
 */
export function holdSpeaking(next: VoiceState, remainingMs: number): SpeakingHold {
  if (next === 'listening' && remainingMs > 0) return { state: 'speaking', flushInMs: remainingMs };
  return { state: next, flushInMs: null };
}
