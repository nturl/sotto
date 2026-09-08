/**
 * Minimal 16-bit mono WAV read/write, for the tutor audio discuss-quality.mjs
 * lifts out of the page. The browser hands us Int16 PCM at Kokoro's native
 * 24 kHz (protocol.ts's TUTOR_SAMPLE_RATE); this writes exactly that with a
 * 44-byte canonical header, so the file is playable in QuickTime and
 * readable by the Node-side Whisper round trip without a transcode step.
 *
 * Deliberately not ffmpeg: the point of the round trip is to score the
 * SAMPLES the app actually scheduled, and every extra encode/decode hop is
 * another place for the evidence to change under us.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Writes `int16` (mono) as a WAV at `sampleRate`. Returns the byte length. */
export function writeWavInt16(filePath, int16, sampleRate) {
  const dataBytes = int16.length * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format: PCM
  header.writeUInt16LE(1, 22); // channels: mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  const body = Buffer.from(int16.buffer, int16.byteOffset, dataBytes);
  writeFileSync(filePath, Buffer.concat([header, body]));
  return 44 + dataBytes;
}

/**
 * Reads a 16-bit PCM WAV into `{ samples: Float32Array, sampleRate }`, the
 * shape @huggingface/transformers' whisper pipeline wants. Walks the chunk
 * list rather than assuming a 44-byte header, because `afconvert` emits a
 * FLLR padding chunk before `data`.
 */
export function readWavAsFloat32(filePath) {
  const buf = readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${filePath} is not a RIFF/WAVE file`);
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 1;
  let bitsPerSample = 16;
  let data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bitsPerSample = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(body + size, buf.length));
      break;
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  if (!data) throw new Error(`${filePath} has no data chunk`);
  if (bitsPerSample !== 16) throw new Error(`${filePath} is ${bitsPerSample}-bit; expected 16`);
  const total = Math.floor(data.length / 2);
  const frames = Math.floor(total / channels);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    // Mono-mix by taking channel 0; every file this handles is already mono.
    out[i] = data.readInt16LE(i * channels * 2) / 32768;
  }
  return { samples: out, sampleRate };
}

/**
 * Linear-interpolation resample, for feeding Kokoro's 24 kHz output to a
 * Whisper pipeline that assumes 16 kHz. Good enough for a transcription
 * round trip (whisper's own front end is a 25 ms mel window; a fractional
 * sample of interpolation error is far below its resolution) and it keeps
 * the round trip free of an ffmpeg hop.
 */
export function resample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = samples[idx] ?? 0;
    const b = samples[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Peak-normalized RMS and peak of a Float32 signal, plus a NaN check. */
export function signalStats(samples) {
  let sumSquares = 0;
  let peak = 0;
  let nanCount = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (!Number.isFinite(v)) {
      nanCount++;
      continue;
    }
    sumSquares += v * v;
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
  }
  const counted = samples.length - nanCount;
  return {
    rms: counted > 0 ? Math.sqrt(sumSquares / counted) : 0,
    peak,
    nanCount,
    samples: samples.length,
  };
}
