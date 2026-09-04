import { describe, expect, it } from 'vitest';
import { concatPcm16, encodeWav } from './wav.js';

describe('encodeWav', () => {
  it('writes a valid 44-byte RIFF/WAVE/PCM header for mono 16kHz', () => {
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]); // 4 samples, 16-bit
    const wav = encodeWav(pcm, 16000, 1);

    expect(wav.length).toBe(44 + pcm.byteLength);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.readUInt32LE(16)).toBe(16); // fmt chunk size
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // channels
    expect(wav.readUInt32LE(24)).toBe(16000); // sample rate
    expect(wav.readUInt16LE(32)).toBe(2); // block align (mono 16-bit)
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(pcm.byteLength);
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.byteLength);
  });

  it('appends the PCM payload unchanged after the header', () => {
    const pcm = new Uint8Array([10, 20, 30, 40]);
    const wav = encodeWav(pcm, 16000);
    expect([...wav.subarray(44)]).toEqual([10, 20, 30, 40]);
  });
});

describe('concatPcm16', () => {
  it('concatenates frame buffers in order', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4, 5]);
    const out = concatPcm16([a, b]);
    expect([...out]).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns an empty array for no frames', () => {
    expect(concatPcm16([]).byteLength).toBe(0);
  });
});
