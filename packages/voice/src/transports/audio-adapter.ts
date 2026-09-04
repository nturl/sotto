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
}
