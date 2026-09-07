/**
 * The half-duplex gate's release rule (run 9 lane R, P1-3 / P1-4). The flag
 * used to lift when generation ended, which is seconds before the speakers
 * stop — exactly backwards for the bug it exists to prevent.
 */
import { describe, expect, it } from 'vitest';
import {
  announcesListening,
  DRAIN_SAFETY_MARGIN_MS,
  PlaybackWindow,
  releaseAfterMs,
} from '../src/browser-cascade/speaking-window.ts';

const RATE = 24000;
/** One second of PCM16 at Kokoro's rate. */
const ONE_SECOND_BYTES = RATE * 2;

describe('PlaybackWindow', () => {
  it('is empty before anything is queued', () => {
    expect(new PlaybackWindow().remainingMs(1000)).toBe(0);
  });

  it('counts one chunk as its own duration', () => {
    const w = new PlaybackWindow();
    w.enqueuePcm(ONE_SECOND_BYTES, RATE, 1000);
    expect(w.remainingMs(1000)).toBeCloseTo(1000, 6);
    expect(w.remainingMs(1500)).toBeCloseTo(500, 6);
    expect(w.remainingMs(2000)).toBe(0);
    expect(w.remainingMs(9000)).toBe(0);
  });

  it('appends a chunk that arrives while the queue is still playing', () => {
    const w = new PlaybackWindow();
    w.enqueuePcm(ONE_SECOND_BYTES, RATE, 1000);
    w.enqueuePcm(ONE_SECOND_BYTES, RATE, 1200);
    expect(w.remainingMs(1200)).toBeCloseTo(1800, 6);
  });

  it('starts a fresh queue when the previous one has already drained', () => {
    const w = new PlaybackWindow();
    w.enqueuePcm(ONE_SECOND_BYTES, RATE, 1000);
    w.enqueuePcm(ONE_SECOND_BYTES, RATE, 5000);
    expect(w.remainingMs(5000)).toBeCloseTo(1000, 6);
  });

  it('ignores empty or nonsensical chunks', () => {
    const w = new PlaybackWindow();
    w.enqueuePcm(0, RATE, 1000);
    w.enqueuePcm(ONE_SECOND_BYTES, 0, 1000);
    expect(w.remainingMs(1000)).toBe(0);
  });

  it('drops the queue on clear (a barge-in)', () => {
    const w = new PlaybackWindow();
    w.enqueuePcm(ONE_SECOND_BYTES, RATE, 1000);
    w.clear();
    expect(w.remainingMs(1000)).toBe(0);
  });
});

describe('releaseAfterMs', () => {
  it('releases immediately when nothing is queued', () => {
    expect(releaseAfterMs(0)).toBeNull();
  });

  it('holds for the queued duration plus the safety margin', () => {
    expect(releaseAfterMs(1400)).toBe(1400 + DRAIN_SAFETY_MARGIN_MS);
  });
});

describe('announcesListening', () => {
  it('announces when a generation was actually aborted', () => {
    expect(announcesListening({ hadAbort: true, draining: false })).toBe(true);
  });

  it('announces when the barge-in lands during the drain window', () => {
    // P1-4: no generation to abort, but the screen is showing SPEAKING and
    // the client has a flush timer armed for the rest of the audio. Only a
    // state event bumps the controller's epoch and cancels it.
    expect(announcesListening({ hadAbort: false, draining: true })).toBe(true);
  });

  it('stays silent when nothing was in flight at all', () => {
    expect(announcesListening({ hadAbort: false, draining: false })).toBe(false);
  });
});
