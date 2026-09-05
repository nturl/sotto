import { describe, expect, it } from 'vitest';
import { computeRms, EnergyVad } from './vad.js';

const SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320; // 20ms @ 16kHz

function toneFrame(amplitude: number, samples = FRAME_SAMPLES): Int16Array {
  return new Int16Array(samples).fill(amplitude);
}

function silenceFrame(samples = FRAME_SAMPLES): Int16Array {
  return new Int16Array(samples).fill(0);
}

describe('computeRms', () => {
  it('is 0 for silence', () => {
    expect(computeRms(silenceFrame())).toBe(0);
  });

  it('equals amplitude/32768 for a constant-amplitude tone', () => {
    const rms = computeRms(toneFrame(16384));
    expect(rms).toBeCloseTo(0.5, 5);
  });

  it('is 0 for an empty frame', () => {
    expect(computeRms(new Int16Array(0))).toBe(0);
  });
});

describe('EnergyVad', () => {
  it('fires speech_start only after sustained energy above threshold for minSpeechMs', () => {
    const vad = new EnergyVad({
      sampleRate: SAMPLE_RATE,
      minSpeechMs: 300,
      silenceEndMs: 700,
      rmsThreshold: 0.02,
    });
    const framesFor300ms = 300 / 20; // 15 frames of 20ms

    let sawStart = false;
    for (let i = 0; i < framesFor300ms - 1; i++) {
      const events = vad.process(toneFrame(5000));
      expect(events).toEqual([]);
    }
    const finalEvents = vad.process(toneFrame(5000));
    sawStart = finalEvents.some((e) => e.type === 'speech_start');
    expect(sawStart).toBe(true);
  });

  it('does not fire speech_start on a brief blip shorter than minSpeechMs', () => {
    const vad = new EnergyVad({
      sampleRate: SAMPLE_RATE,
      minSpeechMs: 300,
      silenceEndMs: 700,
      rmsThreshold: 0.02,
    });
    // Only 5 loud frames (100ms) then silence — well short of the 300ms minimum.
    for (let i = 0; i < 5; i++) expect(vad.process(toneFrame(5000))).toEqual([]);
    for (let i = 0; i < 5; i++) expect(vad.process(silenceFrame())).toEqual([]);
  });

  it('fires speech_end after sustained silence for silenceEndMs', () => {
    const vad = new EnergyVad({
      sampleRate: SAMPLE_RATE,
      minSpeechMs: 300,
      silenceEndMs: 700,
      rmsThreshold: 0.02,
    });
    const framesFor300ms = 300 / 20;
    const framesFor700ms = 700 / 20;

    for (let i = 0; i < framesFor300ms; i++) vad.process(toneFrame(5000));

    let sawEnd = false;
    for (let i = 0; i < framesFor700ms - 1; i++) {
      const events = vad.process(silenceFrame());
      if (events.some((e) => e.type === 'speech_end')) sawEnd = true;
    }
    expect(sawEnd).toBe(false);
    const finalEvents = vad.process(silenceFrame());
    expect(finalEvents).toEqual([{ type: 'speech_end' }]);
  });

  it('reset() clears accumulated state', () => {
    const vad = new EnergyVad({ sampleRate: SAMPLE_RATE, minSpeechMs: 300, rmsThreshold: 0.02 });
    for (let i = 0; i < 14; i++) vad.process(toneFrame(5000)); // just under the 15-frame threshold
    vad.reset();
    // after reset, the counter restarts — one more loud frame must not fire speech_start.
    expect(vad.process(toneFrame(5000))).toEqual([]);
  });

  it('reports backend "energy"', () => {
    expect(new EnergyVad().backend).toBe('energy');
  });
});
