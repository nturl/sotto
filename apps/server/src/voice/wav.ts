/**
 * Minimal WAV (RIFF/PCM) header encoding for mono 16-bit PCM, so learner
 * speech segments captured as raw PCM16 frames can be POSTed to the STT
 * endpoint as a `.wav` file.
 */

export function encodeWav(pcm16: Uint8Array, sampleRate: number, channels = 1): Buffer {
  const dataSize = pcm16.byteLength;
  const blockAlign = channels * 2;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength)]);
}

/** Concatenates PCM16 frame buffers into one contiguous Uint8Array. */
export function concatPcm16(frames: Uint8Array[]): Uint8Array {
  const total = frames.reduce((n, f) => n + f.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const f of frames) {
    out.set(f, offset);
    offset += f.byteLength;
  }
  return out;
}
