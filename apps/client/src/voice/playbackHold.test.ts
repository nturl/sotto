/**
 * Run 9 lane D directive 3 (PLAN.md diagnosis 4): the screen said
 * `listening` the moment generation ended while the speakers were still
 * playing the tutor's audio — the label and the audio disagreed for
 * several seconds (voice-live baseline: `speaking` 18.1s -> `listening`
 * 25.3s, with the last tutor sentence still queued). These are the two
 * pure pieces: a queue-drain tracker fed by the PCM the provider forwards
 * to the audio adapter, and the hold rule the event layer applies.
 */
import { describe, expect, it } from 'vitest';
import { createPlaybackTracker, holdSpeaking } from './playbackHold';

describe('createPlaybackTracker', () => {
  it('reports nothing queued before any audio', () => {
    const tracker = createPlaybackTracker();
    expect(tracker.remainingMs(0)).toBe(0);
  });

  it('queues one PCM16 chunk for its own duration', () => {
    const tracker = createPlaybackTracker();
    // 24000 mono PCM16 samples at 24 kHz = 1.0s = 48000 bytes.
    tracker.enqueue(48_000, 24_000, 1_000);
    expect(tracker.remainingMs(1_000)).toBe(1_000);
    expect(tracker.remainingMs(1_500)).toBe(500);
    expect(tracker.remainingMs(2_000)).toBe(0);
    expect(tracker.remainingMs(9_999)).toBe(0);
  });

  it('appends a chunk that arrives while the previous one is still playing', () => {
    const tracker = createPlaybackTracker();
    tracker.enqueue(48_000, 24_000, 1_000);
    tracker.enqueue(48_000, 24_000, 1_200);
    expect(tracker.remainingMs(1_200)).toBe(1_800);
  });

  it('starts a fresh queue for a chunk that arrives after the last one drained', () => {
    const tracker = createPlaybackTracker();
    tracker.enqueue(48_000, 24_000, 1_000);
    tracker.enqueue(48_000, 24_000, 5_000);
    expect(tracker.remainingMs(5_000)).toBe(1_000);
  });

  it('drops the whole queue on a barge-in', () => {
    const tracker = createPlaybackTracker();
    tracker.enqueue(48_000, 24_000, 1_000);
    tracker.clear();
    expect(tracker.remainingMs(1_100)).toBe(0);
  });
});

describe('holdSpeaking', () => {
  it('holds `listening` back while tutor audio is still queued', () => {
    expect(holdSpeaking('listening', 1_800)).toEqual({ state: 'speaking', flushInMs: 1_800 });
  });

  it('lets `listening` through once the queue has drained', () => {
    expect(holdSpeaking('listening', 0)).toEqual({ state: 'listening', flushInMs: null });
  });

  it('never delays any other state — an error or a limit must land at once', () => {
    expect(holdSpeaking('error', 5_000)).toEqual({ state: 'error', flushInMs: null });
    expect(holdSpeaking('ended', 5_000)).toEqual({ state: 'ended', flushInMs: null });
    expect(holdSpeaking('speaking', 5_000)).toEqual({ state: 'speaking', flushInMs: null });
    expect(holdSpeaking('muted', 5_000)).toEqual({ state: 'muted', flushInMs: null });
  });
});
