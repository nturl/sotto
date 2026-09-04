import { describe, expect, it } from 'vitest';
import { buildWavFile, parseWav, pcmDurationMs, silencePcm } from '../src/wav.ts';

describe('buildWavFile / parseWav round trip', () => {
  it('round-trips PCM data and format fields', () => {
    const pcm = Buffer.from(Array.from({ length: 200 }, (_, i) => i % 256));
    const wav = buildWavFile(pcm, 24000, 1, 16);
    const parsed = parseWav(wav);
    expect(parsed.sampleRate).toBe(24000);
    expect(parsed.numChannels).toBe(1);
    expect(parsed.bitsPerSample).toBe(16);
    expect(Buffer.compare(parsed.pcm, pcm)).toBe(0);
  });

  it('parses a streaming WAV whose data chunk size is 0xFFFFFFFF as "rest of buffer"', () => {
    // Simulate what Kokoro actually sends: a proper fmt chunk, then a data
    // chunk header with a bogus (streamed) size, with real PCM after it.
    const pcm = Buffer.from([1, 2, 3, 4, 5, 6]);
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(0xffffffff, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(24000, 24);
    header.writeUInt32LE(48000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(0xffffffff, 40);
    const buffer = Buffer.concat([header, pcm]);

    const parsed = parseWav(buffer);
    expect(parsed.sampleRate).toBe(24000);
    expect(Buffer.compare(parsed.pcm, pcm)).toBe(0);
  });

  it('rejects a non-RIFF buffer', () => {
    expect(() => parseWav(Buffer.from('not a wav file'))).toThrow();
  });
});

describe('silencePcm', () => {
  it('produces the right number of zeroed bytes for the duration', () => {
    const pcm = silencePcm(350, 24000, 1, 16);
    // 350ms @ 24000Hz, 1 channel, 16-bit = 2 bytes/sample
    expect(pcm.length).toBe(Math.round(0.35 * 24000) * 2);
    expect(pcm.every((b) => b === 0)).toBe(true);
  });

  it('returns an empty buffer for a non-positive duration', () => {
    expect(silencePcm(0, 24000, 1, 16).length).toBe(0);
    expect(silencePcm(-10, 24000, 1, 16).length).toBe(0);
  });
});

describe('pcmDurationMs', () => {
  it('computes duration from byte length and format', () => {
    const oneSecond = silencePcm(1000, 24000, 1, 16);
    expect(pcmDurationMs(oneSecond, 24000, 1, 16)).toBeCloseTo(1000, 0);
  });
});
