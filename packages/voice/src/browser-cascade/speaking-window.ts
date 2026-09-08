/**
 * When the tutor stops speaking — for the half-duplex gate (run 9 lane R,
 * P1-3 and P1-4).
 *
 * `worker.ts` raises the VAD's threshold by `HALF_DUPLEX_THRESHOLD_SCALE`
 * while the tutor's voice is coming out of the speakers, because the energy
 * VAD hears that voice back through the mic and was barging the tutor in on
 * itself (BUGS-TUTOR-RUN5 #3). Until this module existed the flag was
 * cleared when GENERATION ended, not when PLAYBACK ended — and the two are
 * seconds apart: lane D measured `speaking` at t+18.1s and `listening` at
 * t+25.3s with ~1.4 s of audio still queued. So the gate was raised while
 * the tutor talked and lowered for the drain, which is the half of the
 * window with the worst echo-to-attention ratio: nobody has started
 * answering yet, and the speaker is still loud.
 *
 * The main thread knows when the queue drains (it schedules the audio), so
 * the provider now posts `playback_drained` and the worker holds the flag
 * until that message arrives. A message can be lost — the page can be
 * hidden, the adapter can fail, a worker can be spawned by a harness that
 * never sends it — so the hold also has a safety timeout of the queued
 * duration. `PlaybackWindow` is the worker's own copy of that arithmetic,
 * kept here rather than imported from apps/client (a worker cannot reach
 * into the app) and identical to `createPlaybackTracker` there.
 *
 * Pure: no worker globals, no timers, no ML. worker.ts owns the setTimeout.
 */

const BYTES_PER_PCM16_SAMPLE = 2;

/**
 * Slack added to the safety timeout. The worker's own arithmetic is over
 * the PCM it posted, which is a lower bound on when the main thread will
 * actually finish playing it (the AudioContext schedules from the moment
 * the chunk lands, after transfer and decode). Half a second is enough to
 * stop the timeout racing a `playback_drained` that is merely in flight,
 * and short enough that a lost message costs the learner nothing they would
 * notice.
 */
export const DRAIN_SAFETY_MARGIN_MS = 500;

/** Milliseconds of tutor audio the worker has handed to the main thread. */
export class PlaybackWindow {
  private endAt = 0;

  /** Mirrors one `audio` message: PCM16 of `byteLength` at `sampleRate`. */
  enqueuePcm(byteLength: number, sampleRate: number, now: number): void {
    if (byteLength <= 0 || sampleRate <= 0) return;
    const durationMs = (byteLength / BYTES_PER_PCM16_SAMPLE / sampleRate) * 1000;
    if (!Number.isFinite(durationMs)) return;
    this.endAt = Math.max(now, this.endAt) + durationMs;
  }

  /** A barge-in, or a drain the main thread has confirmed. */
  clear(): void {
    this.endAt = 0;
  }

  remainingMs(now: number): number {
    return Math.max(0, this.endAt - now);
  }
}

/**
 * How long to keep the speaking flag after generation ends. `null` means
 * "release it now" — nothing is queued, so there is nothing to leak into
 * the mic.
 */
export function releaseAfterMs(remainingMs: number): number | null {
  return remainingMs > 0 ? remainingMs + DRAIN_SAFETY_MARGIN_MS : null;
}

/**
 * Whether a barge-in must announce `listening`.
 *
 * Before this, `interruptSession` posted a state event only when it had an
 * in-flight generation to abort. A barge-in during the DRAIN window has
 * none — generation finished seconds ago — so the worker went quiet, the
 * client's `holdSpeaking` timer stayed armed for the original duration, and
 * the screen sat in SPEAKING with the speakers silent and the mic live
 * (lane R, P1-4). A state event is also what bumps the controller's epoch,
 * which is what cancels that stale timer.
 */
export function announcesListening(opts: { hadAbort: boolean; draining: boolean }): boolean {
  return opts.hadAbort || opts.draining;
}
