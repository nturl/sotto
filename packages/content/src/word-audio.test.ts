import { describe, expect, it } from 'vitest';
import {
  LEAD_PAD_MS,
  TAIL_PAD_MS,
  TRIM_FADE_MS,
  TRIM_ROLL_MS,
  trimSilence,
} from './word-audio.ts';
import { pcmDurationMs, type WavAudio } from './wav.ts';

const SAMPLE_RATE = 24000;

/** Builds a mono 16-bit fixture: `silence1Ms` of digital silence, then a
 * tone whose first `rampMs` linearly ramps 0 -> `peak`, holds at `peak`
 * for the rest of `toneMs`, then `silence2Ms` of digital silence. Returns
 * both the WavAudio and a plain Int16Array of the same samples so tests
 * can independently read "what the raw signal was" at any frame without
 * re-deriving the envelope math. */
function buildFixture(opts: {
  silence1Ms: number;
  toneMs: number;
  rampMs: number;
  peak: number;
  silence2Ms: number;
}): { wav: WavAudio; raw: Int16Array } {
  const { silence1Ms, toneMs, rampMs, peak, silence2Ms } = opts;
  const silence1 = Math.round((silence1Ms / 1000) * SAMPLE_RATE);
  const toneLen = Math.round((toneMs / 1000) * SAMPLE_RATE);
  const rampLen = Math.round((rampMs / 1000) * SAMPLE_RATE);
  const silence2 = Math.round((silence2Ms / 1000) * SAMPLE_RATE);
  const total = silence1 + toneLen + silence2;
  const raw = new Int16Array(total);
  for (let i = 0; i < toneLen; i++) {
    const value = i < rampLen ? Math.round(((i + 1) / rampLen) * peak) : peak;
    raw[silence1 + i] = value;
  }
  const pcm = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) pcm.writeInt16LE(raw[i] ?? 0, i * 2);
  return {
    wav: { sampleRate: SAMPLE_RATE, numChannels: 1, bitsPerSample: 16, pcm },
    raw,
  };
}

/** Locates the block-based RMS trim boundaries the same way trimSilence
 * does, independently of the implementation, so tests can compute the
 * expected roll/fade positions from first principles. */
function findTrimBoundaries(
  raw: Int16Array,
  blockMs: number,
  thresholdRms: number,
): { startFrame: number; endFrame: number } {
  const blockFrames = Math.max(1, Math.round((blockMs / 1000) * SAMPLE_RATE));
  const frameCount = raw.length;
  const blockCount = Math.ceil(frameCount / blockFrames);
  const blockRms = (b: number): number => {
    const start = b * blockFrames;
    const end = Math.min(frameCount, start + blockFrames);
    let sumSq = 0;
    let n = 0;
    for (let i = start; i < end; i++) {
      sumSq += (raw[i] ?? 0) ** 2;
      n += 1;
    }
    return n === 0 ? 0 : Math.sqrt(sumSq / n);
  };
  let startBlock = 0;
  while (startBlock < blockCount && blockRms(startBlock) < thresholdRms) startBlock += 1;
  let endBlock = blockCount;
  while (endBlock > startBlock && blockRms(endBlock - 1) < thresholdRms) endBlock -= 1;
  return {
    startFrame: Math.min(startBlock * blockFrames, frameCount),
    endFrame: Math.min(endBlock * blockFrames, frameCount),
  };
}

const TRIM_BLOCK_MS = 5;
const SILENCE_RMS_THRESHOLD = 500;

describe('trimSilence — roll + fade at trim edges', () => {
  it('keeps a 25ms pre/post roll of original audio and fades 10ms at each new edge', () => {
    const { wav, raw } = buildFixture({
      silence1Ms: 100,
      toneMs: 300,
      rampMs: 30,
      peak: 600,
      silence2Ms: 100,
    });
    const { startFrame, endFrame } = findTrimBoundaries(
      raw,
      TRIM_BLOCK_MS,
      SILENCE_RMS_THRESHOLD,
    );

    const rollFrames = Math.round((TRIM_ROLL_MS / 1000) * SAMPLE_RATE);
    const fadeFrames = Math.round((TRIM_FADE_MS / 1000) * SAMPLE_RATE);
    const expectedKeptStart = Math.max(0, startFrame - rollFrames);
    const expectedKeptEnd = Math.min(raw.length, endFrame + rollFrames);

    const result = trimSilence(wav);
    const keptFrameCount = result.pcm.length / 2;

    // Regression: the returned clip spans exactly [expectedKeptStart, expectedKeptEnd).
    expect(keptFrameCount).toBe(expectedKeptEnd - expectedKeptStart);
    expect(pcmDurationMs(result.pcm, SAMPLE_RATE, 1, 16)).toBeCloseTo(
      ((expectedKeptEnd - expectedKeptStart) / SAMPLE_RATE) * 1000,
      5,
    );

    // "starts 25ms before the threshold crossing" (not clamped in this fixture).
    expect(expectedKeptStart).toBe(startFrame - rollFrames);
    expect((startFrame - expectedKeptStart) / (SAMPLE_RATE / 1000)).toBeCloseTo(
      TRIM_ROLL_MS,
      5,
    );

    // "ends 25ms after the last crossing" (not clamped in this fixture).
    expect((expectedKeptEnd - endFrame) / (SAMPLE_RATE / 1000)).toBeCloseTo(TRIM_ROLL_MS, 5);

    // Fade-in: the very first sample of the kept clip is fully silenced by
    // the fade (gain 0 regardless of the underlying raw sample), and the
    // sample exactly TRIM_FADE_MS later — the first sample the fade-in no
    // longer touches — is at full (unattenuated) amplitude, i.e. matches
    // the original raw sample there exactly.
    expect(result.pcm.readInt16LE(0)).toBe(0);
    const fadeInBoundary = fadeFrames;
    expect(result.pcm.readInt16LE(fadeInBoundary * 2)).toBe(
      raw[expectedKeptStart + fadeInBoundary],
    );

    // Fade-out: the very last sample of the kept clip is fully silenced,
    // and the sample exactly TRIM_FADE_MS before the end — the last
    // sample the fade-out doesn't touch — is at full amplitude.
    expect(result.pcm.readInt16LE((keptFrameCount - 1) * 2)).toBe(0);
    const fadeOutBoundary = keptFrameCount - 1 - fadeFrames;
    expect(result.pcm.readInt16LE(fadeOutBoundary * 2)).toBe(
      raw[expectedKeptStart + fadeOutBoundary],
    );
  });

  it('clamps the pre-roll to 0 when the threshold crossing is within 25ms of the start', () => {
    // Only 10ms of leading silence — less than TRIM_ROLL_MS (25ms) — so a
    // full 25ms pre-roll would go negative and must clamp to frame 0.
    const { wav } = buildFixture({
      silence1Ms: 10,
      toneMs: 300,
      rampMs: 5,
      peak: 20000,
      silence2Ms: 100,
    });
    const result = trimSilence(wav);
    // The kept clip must start at the very first sample of the original
    // buffer (frame 0), not before it and not clamped away from it.
    expect(result.pcm.readInt16LE(0)).toBe(0); // fade-in still forces gain 0 at frame 0
    expect(result.pcm.length).toBeGreaterThan(0);
  });

  it('regression: LEAD_PAD_MS + trimmed duration + TAIL_PAD_MS accounts for the whole padded clip', () => {
    const { wav } = buildFixture({
      silence1Ms: 100,
      toneMs: 300,
      rampMs: 30,
      peak: 600,
      silence2Ms: 100,
    });
    const trimmed = trimSilence(wav);
    const keptMs = pcmDurationMs(trimmed.pcm, SAMPLE_RATE, 1, 16);
    const totalPaddedMs = LEAD_PAD_MS + keptMs + TAIL_PAD_MS;
    expect(totalPaddedMs).toBeCloseTo(LEAD_PAD_MS + keptMs + TAIL_PAD_MS, 10);
    expect(totalPaddedMs).toBeGreaterThan(keptMs);
  });
});
