#!/usr/bin/env node
/**
 * R3-W proof: for one FR book and one ES book, decodes `audio/words.mp3`
 * to raw PCM via ffmpeg and checks every span in `audio/words.json` is
 * >= 250 ms and non-silent (RMS above a floor), so "the reader plays a
 * clear, full word" is a measured fact, not an assumption.
 *
 * Usage: node scripts/check-word-audio.mjs [bookDir1] [bookDir2] ...
 * (defaults to fr-FR/books/fr-petit-chaperon-rouge and
 * es-419/books/es-fabulas-samaniego)
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = path.join(__dirname, '..', 'packs');

const MIN_SPAN_MS = 250;
const SILENCE_RMS_THRESHOLD = 500; // out of 32767, 16-bit PCM

const targets =
  process.argv.length > 2
    ? process.argv.slice(2)
    : ['fr-FR/books/fr-petit-chaperon-rouge', 'es-419/books/es-fabulas-samaniego'];

function decodeToPcm(mp3Path) {
  // 16-bit PCM, mono, 24kHz (Kokoro's native rate) via ffmpeg -> stdout.
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', mp3Path, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', '24000', '-'],
    { maxBuffer: 1024 * 1024 * 200 },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg decode failed for ${mp3Path}: ${result.stderr?.toString()}`);
  }
  return result.stdout;
}

function rmsForSpan(pcm, startMs, endMs, sampleRate) {
  const startByte = Math.floor((startMs / 1000) * sampleRate) * 2;
  const endByte = Math.min(pcm.length, Math.ceil((endMs / 1000) * sampleRate) * 2);
  if (endByte <= startByte) return 0;
  let sumSq = 0;
  let n = 0;
  for (let i = startByte; i + 1 < endByte; i += 2) {
    const sample = pcm.readInt16LE(i);
    sumSq += sample * sample;
    n += 1;
  }
  return n === 0 ? 0 : Math.sqrt(sumSq / n);
}

let overallOk = true;
for (const rel of targets) {
  const dir = path.join(PACKS_DIR, rel);
  const bookJsonPath = path.join(dir, 'book.json');
  if (!existsSync(bookJsonPath)) {
    console.log(`SKIP ${rel} — no book.json`);
    overallOk = false;
    continue;
  }
  const book = JSON.parse(readFileSync(bookJsonPath, 'utf8'));
  if (!book.wordAudio) {
    console.log(`SKIP ${rel} — no wordAudio field (run \`pnpm content:word-audio\` first)`);
    overallOk = false;
    continue;
  }
  const mp3Path = path.join(dir, book.wordAudio.file);
  const indexPath = path.join(dir, book.wordAudio.index);
  if (!existsSync(mp3Path) || !existsSync(indexPath)) {
    console.log(`SKIP ${rel} — missing ${book.wordAudio.file} or ${book.wordAudio.index}`);
    overallOk = false;
    continue;
  }
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  const words = Object.entries(index.words ?? {});
  console.log(`\n${rel}: decoding ${book.wordAudio.file} (${words.length} words)...`);
  const pcm = decodeToPcm(mp3Path);
  const sampleRate = 24000;

  let shortCount = 0;
  let silentCount = 0;
  let minSpanMs = Infinity;
  let minRms = Infinity;
  for (const [normalized, [startMs, endMs]] of words) {
    const spanMs = endMs - startMs;
    const rms = rmsForSpan(pcm, startMs, endMs, sampleRate);
    minSpanMs = Math.min(minSpanMs, spanMs);
    minRms = Math.min(minRms, rms);
    if (spanMs < MIN_SPAN_MS) {
      shortCount += 1;
      console.log(`  FAIL short span: "${normalized}" ${spanMs}ms`);
    }
    if (rms < SILENCE_RMS_THRESHOLD) {
      silentCount += 1;
      console.log(`  FAIL silent span: "${normalized}" rms=${rms.toFixed(1)}`);
    }
  }
  const ok = shortCount === 0 && silentCount === 0;
  overallOk = overallOk && ok;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'} ${words.length} words — min span ${minSpanMs}ms (>= ${MIN_SPAN_MS}ms required), min RMS ${minRms.toFixed(1)} (>= ${SILENCE_RMS_THRESHOLD} required), ${shortCount} short, ${silentCount} silent`,
  );
}

console.log(`\n${overallOk ? 'PASS' : 'FAIL'} — check-word-audio`);
if (!overallOk) process.exitCode = 1;
