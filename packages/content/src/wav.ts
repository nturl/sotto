/**
 * Minimal WAV (RIFF/PCM) read/write helpers for narration. Kokoro streams
 * WAV with `RIFF`/`data` chunk sizes set to 0xFFFFFFFF (verified
 * 2026-09-04) — the real payload is "everything after the data chunk
 * header", not the (bogus) declared size, so parseWav treats an
 * unreasonable declared size as "rest of buffer".
 */

export interface WavAudio {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  pcm: Buffer;
}

export function parseWav(buffer: Buffer): WavAudio {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE buffer');
  }
  let offset = 12;
  let fmt: { numChannels: number; sampleRate: number; bitsPerSample: number } | undefined;
  let dataStart = -1;
  let dataDeclaredSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    if (chunkId === 'fmt ') {
      fmt = {
        numChannels: buffer.readUInt16LE(bodyStart + 2),
        sampleRate: buffer.readUInt32LE(bodyStart + 4),
        bitsPerSample: buffer.readUInt16LE(bodyStart + 14),
      };
    } else if (chunkId === 'data') {
      dataStart = bodyStart;
      dataDeclaredSize = chunkSize;
      break;
    }
    offset = bodyStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt) throw new Error('WAV buffer has no fmt chunk');
  if (dataStart === -1) throw new Error('WAV buffer has no data chunk');

  const declaredIsUsable =
    dataDeclaredSize !== 0xffffffff && dataStart + dataDeclaredSize <= buffer.length;
  const size = declaredIsUsable ? dataDeclaredSize : buffer.length - dataStart;
  return {
    sampleRate: fmt.sampleRate,
    numChannels: fmt.numChannels,
    bitsPerSample: fmt.bitsPerSample,
    pcm: buffer.subarray(dataStart, dataStart + size),
  };
}

export function buildWavFile(
  pcm: Buffer,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): Buffer {
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function silencePcm(
  durationMs: number,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): Buffer {
  if (durationMs <= 0) return Buffer.alloc(0);
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.round((durationMs / 1000) * sampleRate);
  return Buffer.alloc(numSamples * numChannels * bytesPerSample);
}

export function pcmDurationMs(
  pcm: Buffer,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): number {
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = pcm.length / (numChannels * bytesPerSample);
  return (totalSamples / sampleRate) * 1000;
}
