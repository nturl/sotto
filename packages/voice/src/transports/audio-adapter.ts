/**
 * Platform-agnostic audio I/O contract that LocalCascadeProvider depends on.
 * Web (src/transports/web-audio.ts) and native each supply an implementation;
 * LocalCascadeProvider never touches microphone/speaker APIs directly.
 */
export interface AudioAdapter {
  /** Starts capturing the microphone and calls `onPcm16` with mono PCM16
   * little-endian frames at 16 kHz as they become available. */
  startCapture(onPcm16: (buf: ArrayBuffer) => void): Promise<void>;
  /** Stops microphone capture. Safe to call when not capturing. */
  stopCapture(): void;
  /** Queues raw mono PCM16 little-endian audio at the given sample rate for
   * playback (tutor speech is 24 kHz per planning/CONTRACTS.md §5b). */
  playPcm(buf: ArrayBuffer, sampleRate: number): void;
  /** Stops/clears any queued or in-progress playback immediately (barge-in). */
  stopPlayback(): void;
  /**
   * run7/F1: registers a listener called whenever playback is blocked — a
   * suspended `AudioContext` that a resume attempt could not clear, e.g. an
   * autoplay policy edge case (no user gesture on record) or the tab having
   * been backgrounded mid-turn (planning/run7/cards/F1-tutor-pipeline.md
   * directive 2). Optional: only `WebAudioAdapter` implements this today: a
   * native adapter has no autoplay policy to trip.
   */
  onPlaybackBlocked?(cb: () => void): void;
  /** Attempts to resume blocked playback — the action the UI calls from a
   * tap after a `playback_blocked` error event. Optional for the same
   * reason as `onPlaybackBlocked`. */
  resumePlayback?(): Promise<void>;
}
