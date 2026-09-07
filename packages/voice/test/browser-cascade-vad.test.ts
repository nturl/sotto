/**
 * Energy VAD + pre-roll buffer for the in-browser tutor. Mirrors the server's
 * apps/server/src/voice/vad.test.ts so the port is provably equivalent.
 */
import { describe, expect, it } from 'vitest';
import {
  computeRms,
  EnergyVad,
  HALF_DUPLEX_THRESHOLD_SCALE,
  SpeechBuffer,
} from '../src/browser-cascade/vad.ts';

const SAMPLE_RATE = 16000;
const FRAME_SAMPLES = SAMPLE_RATE / 50; // 20 ms

function frame(amplitude: number): Int16Array {
  const out = new Int16Array(FRAME_SAMPLES);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.round(Math.sin((i / FRAME_SAMPLES) * Math.PI * 8) * amplitude * 32767);
  }
  return out;
}

const LOUD = frame(0.4);
const SILENT = new Int16Array(FRAME_SAMPLES);

describe('computeRms', () => {
  it('is 0 for silence and 0 for an empty frame', () => {
    expect(computeRms(SILENT)).toBe(0);
    expect(computeRms(new Int16Array(0))).toBe(0);
  });

  it('rises with amplitude', () => {
    expect(computeRms(frame(0.8))).toBeGreaterThan(computeRms(frame(0.1)));
  });
});

describe('EnergyVad', () => {
  it('fires speech_start only after minSpeechMs of sustained energy', () => {
    const vad = new EnergyVad({ minSpeechMs: 300, silenceEndMs: 700 });
    const events = [];
    for (let i = 0; i < 14; i++) events.push(...vad.process(LOUD));
    // 300 ms = 15 frames of 20 ms; 14 frames must not be enough.
    expect(events).toEqual([]);
    expect(vad.process(LOUD)).toEqual([{ type: 'speech_start' }]);
    expect(vad.isSpeaking).toBe(true);
  });

  it('fires speech_end only after silenceEndMs of sustained silence', () => {
    // Pinned explicitly (matches apps/server/src/voice/vad.test.ts's
    // convention) so this test keeps exercising the *mechanism* regardless
    // of what the default silenceEndMs happens to be tuned to.
    const vad = new EnergyVad({ silenceEndMs: 700 });
    for (let i = 0; i < 20; i++) vad.process(LOUD);
    const during = [];
    for (let i = 0; i < 34; i++) during.push(...vad.process(SILENT));
    expect(during).toEqual([]); // 680 ms
    expect(vad.process(SILENT)).toEqual([{ type: 'speech_end' }]);
    expect(vad.isSpeaking).toBe(false);
  });

  // BUGS-TUTOR-RUN5.md #4: a learner recalling a word mid-sentence pauses
  // longer than a fluent speaker; the old 700ms default cut the turn there,
  // sending "No me parece que..." to STT as a complete (and meaningless)
  // utterance. 1000ms gives more room for a thinking-pause without the
  // hangover itself waiting through it (case default; see also
  // apps/server/src/voice/vad.ts, which shares this tuning).
  it('defaults silenceEndMs to 1000ms so a learner mid-sentence pause does not end the turn', () => {
    const vad = new EnergyVad();
    for (let i = 0; i < 20; i++) vad.process(LOUD);
    const during = [];
    for (let i = 0; i < 49; i++) during.push(...vad.process(SILENT));
    expect(during).toEqual([]); // 980 ms — still mid-pause at the old 700ms default
    expect(vad.process(SILENT)).toEqual([{ type: 'speech_end' }]); // 1000 ms
  });

  it('a short blip does not open a turn (the counter resets on silence)', () => {
    const vad = new EnergyVad();
    for (let i = 0; i < 5; i++) vad.process(LOUD);
    for (let i = 0; i < 5; i++) vad.process(SILENT);
    const events = [];
    for (let i = 0; i < 14; i++) events.push(...vad.process(LOUD));
    expect(events).toEqual([]);
  });

  it('reset() clears speaking state', () => {
    const vad = new EnergyVad();
    for (let i = 0; i < 20; i++) vad.process(LOUD);
    vad.reset();
    expect(vad.isSpeaking).toBe(false);
  });
});

describe('SpeechBuffer', () => {
  it('keeps at most preBufferMs of pre-roll and prepends it to the utterance', () => {
    const buf = new SpeechBuffer(SAMPLE_RATE, 100); // 100 ms = 5 frames
    for (let i = 0; i < 20; i++) buf.push(LOUD);
    buf.start();
    buf.push(LOUD);
    const segment = buf.end();
    // 5 frames of pre-roll + 1 captured frame.
    expect(segment?.length).toBe(FRAME_SAMPLES * 6);
  });

  it('returns null when nothing was captured', () => {
    const buf = new SpeechBuffer(SAMPLE_RATE, 100);
    buf.start();
    expect(buf.end()).toBeNull();
  });

  it('clear() drops both the pre-roll and the in-flight utterance', () => {
    const buf = new SpeechBuffer(SAMPLE_RATE, 1000);
    for (let i = 0; i < 5; i++) buf.push(LOUD);
    buf.start();
    buf.push(LOUD);
    buf.clear();
    expect(buf.isCapturing).toBe(false);
    buf.start();
    expect(buf.end()).toBeNull();
  });
});

// ---- run 9 lane A: half-duplex + push-to-talk pre-roll ----

describe('EnergyVad half-duplex gate (BUGS-TUTOR-RUN5.md #3)', () => {
  // The tutor's own voice coming back through a laptop speaker was firing
  // speech_start and barging the tutor in on itself. While the worker is in
  // `speaking`, the bar to open a turn goes up.
  const NEAR_THRESHOLD = frame(0.03); // rms ~0.021: just over the 0.02 default

  it('defaults to a scale of 1 (unchanged behaviour when not speaking)', () => {
    const vad = new EnergyVad();
    const events = [];
    for (let i = 0; i < 16; i++) events.push(...vad.process(NEAR_THRESHOLD));
    expect(events).toEqual([{ type: 'speech_start' }]);
  });

  it('a scaled threshold ignores leakage that would otherwise open a turn', () => {
    const vad = new EnergyVad();
    vad.setThresholdScale(HALF_DUPLEX_THRESHOLD_SCALE);
    const events = [];
    for (let i = 0; i < 50; i++) events.push(...vad.process(NEAR_THRESHOLD));
    expect(events).toEqual([]);
  });

  it('barge-in by a real voice still works while scaled', () => {
    const vad = new EnergyVad();
    vad.setThresholdScale(HALF_DUPLEX_THRESHOLD_SCALE);
    const events = [];
    for (let i = 0; i < 16; i++) events.push(...vad.process(LOUD));
    expect(events).toEqual([{ type: 'speech_start' }]);
  });

  it('restoring the scale to 1 restores the normal threshold', () => {
    const vad = new EnergyVad();
    vad.setThresholdScale(HALF_DUPLEX_THRESHOLD_SCALE);
    for (let i = 0; i < 20; i++) vad.process(NEAR_THRESHOLD);
    vad.setThresholdScale(1);
    const events = [];
    for (let i = 0; i < 16; i++) events.push(...vad.process(NEAR_THRESHOLD));
    expect(events).toEqual([{ type: 'speech_start' }]);
  });

  it('changing the scale mid-run does not leave a stale sustained-speech count', () => {
    const vad = new EnergyVad();
    for (let i = 0; i < 14; i++) vad.process(NEAR_THRESHOLD); // 280ms, nearly there
    vad.setThresholdScale(HALF_DUPLEX_THRESHOLD_SCALE);
    const events = [];
    for (let i = 0; i < 5; i++) events.push(...vad.process(NEAR_THRESHOLD));
    expect(events).toEqual([]);
  });
});

describe('SpeechBuffer.start() pre-roll cap (push-to-talk)', () => {
  it('keeps the pre-roll by default, so the first syllable is not clipped', () => {
    const buf = new SpeechBuffer(SAMPLE_RATE, 1000);
    for (let i = 0; i < 10; i++) buf.push(LOUD); // 200ms of pre-roll
    buf.start();
    buf.push(LOUD);
    expect(buf.end()?.length).toBe(FRAME_SAMPLES * 11);
  });

  it('caps the pre-roll to the given number of ms when asked', () => {
    const buf = new SpeechBuffer(SAMPLE_RATE, 1200);
    for (let i = 0; i < 40; i++) buf.push(LOUD); // 800ms of pre-roll
    buf.start(300); // PTT: only the run-up to the press is wanted
    buf.push(LOUD);
    // 300ms = 15 frames of pre-roll + 1 captured frame.
    expect(buf.end()?.length).toBe(FRAME_SAMPLES * 16);
  });

  it('a cap larger than the available pre-roll keeps all of it', () => {
    const buf = new SpeechBuffer(SAMPLE_RATE, 1200);
    for (let i = 0; i < 4; i++) buf.push(LOUD); // 80ms
    buf.start(300);
    expect(buf.end()?.length).toBe(FRAME_SAMPLES * 4);
  });

  it('a cap of 0 drops the pre-roll entirely', () => {
    const buf = new SpeechBuffer(SAMPLE_RATE, 1200);
    for (let i = 0; i < 10; i++) buf.push(LOUD);
    buf.start(0);
    expect(buf.end()).toBeNull();
  });
});
