/**
 * `sotto-content word-audio [bookId] [--force]`: the reader's speaker
 * button used to play a slice of the chapter narration cut at a word's
 * aligned startMs/endMs (apps/client/src/platform/audio.ts's
 * playAudioSlice) — that slice inherits the narrator's running pace and
 * any alignment edge error, so short/contiguous words (function words,
 * fast passages) come out clipped instead of a clear, isolated
 * pronunciation (Noel's report; ✓ confirmed 2026-09-05, see
 * docs/verification.md row 11 note for measured spans).
 *
 * This command builds a per-book word-pronunciation sprite instead: every
 * unique word token is synthesized ALONE with Kokoro (not sliced out of a
 * sentence), silence-trimmed, padded, and concatenated into one
 * `audio/words.mp3` + `audio/words.json` index (`normalized -> [startMs,
 * endMs]`) so the reader can play a clean, standalone word instead of a
 * fragment of running speech.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { getLanguage, type Book, type Chapter } from '@sotto/core';
import { CACHE_DIR, PACKS_DIR, bookDir } from './paths.ts';
import { cacheKey, NARRATION_SPEED } from './narrate.ts';
import { buildWavFile, parseWav, pcmDurationMs, silencePcm, type WavAudio } from './wav.ts';

const DEFAULT_TTS_URL = 'http://127.0.0.1:8880/v1';

/** Padding baked into each word's clip in the sprite — enough that a tap
 * plays a clean onset/offset instead of a hard cut on the word itself. */
export const LEAD_PAD_MS = 120;
export const TAIL_PAD_MS = 250;

/** R6-C1 measured a 6.97% hard-onset rate corpus-wide (RMS-threshold trim
 * with no fade shears into audible attack, worst on vowel/nasal onsets;
 * tails are clean). Fix (a) per that report's verdict: keep a fixed
 * pre/post-roll of original audio around the trim points and fade it in
 * (out), instead of retuning the RMS threshold. */
export const TRIM_ROLL_MS = 25;
export const TRIM_FADE_MS = 10;

/** Below this, a synthesized word is treated as empty/failed and retried
 * inside a short carrier phrase (Kokoro occasionally returns near-silence
 * for a bare single-token/function-word input in some locales). */
const MIN_WORD_MS = 60;

/** RMS threshold (16-bit PCM, so out of 32767) below which a block counts
 * as silence for leading/trailing trim. */
const SILENCE_RMS_THRESHOLD = 500;
const TRIM_BLOCK_MS = 5;

const DEFAULT_BITRATE = '96k';
const LOW_BITRATE = '64k';
/** LEDGER: "if any book's words.mp3 exceeds 6 MB, lower the bitrate to
 * 64k for words files". */
const SIZE_LIMIT_BYTES = 6 * 1024 * 1024;

function ffmpegAvailable(): boolean {
  const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return result.status === 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ✓ measured 2026-09-05: a batch of thousands of these requests
 * occasionally hits a transient closed-socket error from the local Kokoro
 * server (no HTTP status, the connection just drops mid-response) — not
 * reproducible on retry, so a few short-backoff retries keep a long
 * word-audio run from dying on one flaky request. */
const FETCH_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function synthesizeWordAudio(
  text: string,
  ttsUrl: string,
  voice: string,
  langCode: string,
  force: boolean,
): Promise<WavAudio> {
  mkdirSync(CACHE_DIR, { recursive: true });
  // Reuses narrate.ts's cache dir + cacheKey (same hash of text/voice/speed)
  // so a re-run — or a word that happens to match a cached sentence —
  // costs nothing.
  const key = cacheKey(text, voice, NARRATION_SPEED);
  const wavCachePath = path.join(CACHE_DIR, `${key}.wav`);
  if (!force && existsSync(wavCachePath)) {
    return parseWav(readFileSync(wavCachePath));
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < FETCH_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    try {
      const res = await fetch(`${ttsUrl}/audio/speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: text,
          voice,
          lang_code: langCode,
          response_format: 'wav',
          speed: NARRATION_SPEED,
        }),
      });
      if (!res.ok) throw new Error(`word TTS request failed (${res.status}) for "${text}"`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(wavCachePath, buf);
      return parseWav(buf);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Simple RMS-threshold leading/trailing silence trim, in fixed blocks so
 * a single stray near-zero sample doesn't false-trigger. Falls back to the
 * untrimmed clip if the whole thing reads as silence (shouldn't happen for
 * a real word) or the format isn't 16-bit PCM. */
export function trimSilence(wav: WavAudio): WavAudio {
  const { pcm, sampleRate, numChannels, bitsPerSample } = wav;
  if (bitsPerSample !== 16 || numChannels < 1) return wav;
  const bytesPerFrame = numChannels * 2;
  const frameCount = Math.floor(pcm.length / bytesPerFrame);
  if (frameCount === 0) return wav;
  const blockFrames = Math.max(1, Math.round((TRIM_BLOCK_MS / 1000) * sampleRate));
  const blockCount = Math.ceil(frameCount / blockFrames);

  const blockRms = (blockIndex: number): number => {
    const startFrame = blockIndex * blockFrames;
    const endFrame = Math.min(frameCount, startFrame + blockFrames);
    let sumSq = 0;
    let n = 0;
    for (let f = startFrame; f < endFrame; f++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = pcm.readInt16LE(f * bytesPerFrame + c * 2);
        sumSq += sample * sample;
        n += 1;
      }
    }
    return n === 0 ? 0 : Math.sqrt(sumSq / n);
  };

  let startBlock = 0;
  while (startBlock < blockCount && blockRms(startBlock) < SILENCE_RMS_THRESHOLD) startBlock += 1;
  let endBlock = blockCount;
  while (endBlock > startBlock && blockRms(endBlock - 1) < SILENCE_RMS_THRESHOLD) endBlock -= 1;

  const startFrame = Math.min(startBlock * blockFrames, frameCount);
  const endFrame = Math.min(endBlock * blockFrames, frameCount);
  if (startFrame >= endFrame) return wav; // all-silence — keep original rather than emit nothing

  // R6-C1: a hard RMS-threshold cut with no fade shears into audible
  // attack/release on a non-trivial share of words. Keep a fixed pre/post
  // roll of the ORIGINAL audio around the trim points (clamped to the
  // clip's own bounds) and fade it in/out, so playback starts and ends
  // smoothly instead of on a hard edge.
  const rollFrames = Math.max(0, Math.round((TRIM_ROLL_MS / 1000) * sampleRate));
  const fadeFrames = Math.max(0, Math.round((TRIM_FADE_MS / 1000) * sampleRate));
  const keptStartFrame = Math.max(0, startFrame - rollFrames);
  const keptEndFrame = Math.min(frameCount, endFrame + rollFrames);

  const output = Buffer.from(
    pcm.subarray(keptStartFrame * bytesPerFrame, keptEndFrame * bytesPerFrame),
  );
  const keptFrameCount = keptEndFrame - keptStartFrame;

  const fadeInFrames = Math.min(fadeFrames, keptFrameCount);
  for (let f = 0; f < fadeInFrames; f++) {
    const gain = f / fadeInFrames;
    for (let c = 0; c < numChannels; c++) {
      const offset = f * bytesPerFrame + c * 2;
      output.writeInt16LE(Math.round(output.readInt16LE(offset) * gain), offset);
    }
  }

  const fadeOutFrames = Math.min(fadeFrames, keptFrameCount);
  for (let f = 0; f < fadeOutFrames; f++) {
    const gain = f / fadeOutFrames;
    const frameIndex = keptFrameCount - 1 - f;
    for (let c = 0; c < numChannels; c++) {
      const offset = frameIndex * bytesPerFrame + c * 2;
      output.writeInt16LE(Math.round(output.readInt16LE(offset) * gain), offset);
    }
  }

  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    pcm: output,
  };
}

interface WordToken {
  normalized: string;
  text: string;
}

/** Collects unique word tokens across a book's chapters, keyed by
 * `normalized`, keeping the first surface form (`text`) seen for each —
 * punctuation tokens (`isWord: false`) are skipped. */
function collectWordTokens(dir: string, book: Book): WordToken[] {
  const byNormalized = new Map<string, string>();
  for (const chapterSummary of book.chapters) {
    const chapterPath = path.join(dir, chapterSummary.file);
    if (!existsSync(chapterPath)) continue;
    const chapter = JSON.parse(readFileSync(chapterPath, 'utf8')) as Chapter;
    for (const block of chapter.blocks) {
      for (const sentence of block.sentences) {
        for (const token of sentence.tokens) {
          if (!token.isWord || !token.normalized) continue;
          if (!byNormalized.has(token.normalized)) byNormalized.set(token.normalized, token.text);
        }
      }
    }
  }
  return [...byNormalized.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([normalized, text]) => ({ normalized, text }));
}

interface WordAudioBuildResult {
  pcm: Buffer;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  index: Record<string, [number, number]>;
  fallbackWords: string[];
}

/** ✓ measured 2026-09-05 against the local Kokoro server: concurrent
 * requests contend badly (5 at once took ~85s total vs. ~2-4s each run
 * back to back — Kokoro serializes/thrashes under concurrency rather than
 * parallelizing), so this stays effectively sequential. Kept as a knob
 * (not hardcoded to a bare loop) in case a future Kokoro deployment
 * actually parallelizes. */
const SYNTH_CONCURRENCY = 1;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

interface SynthesizedWord {
  normalized: string;
  trimmed: WavAudio;
  usedFallback: boolean;
}

async function buildWordAudio(
  words: WordToken[],
  opts: {
    ttsUrl: string;
    voice: string;
    langCode: string;
    force: boolean;
    onProgress?: () => void;
  },
): Promise<WordAudioBuildResult> {
  const synthesized = await mapWithConcurrency(words, SYNTH_CONCURRENCY, async (word) => {
    let wav = await synthesizeWordAudio(
      word.text,
      opts.ttsUrl,
      opts.voice,
      opts.langCode,
      opts.force,
    );
    let trimmed = trimSilence(wav);
    let usedFallback = false;

    if (
      pcmDurationMs(trimmed.pcm, trimmed.sampleRate, trimmed.numChannels, trimmed.bitsPerSample) <
      MIN_WORD_MS
    ) {
      // Kokoro returned empty/near-silent audio for the bare word — retry
      // inside a short carrier phrase and keep the trimmed result.
      usedFallback = true;
      wav = await synthesizeWordAudio(
        `${word.text}.`,
        opts.ttsUrl,
        opts.voice,
        opts.langCode,
        opts.force,
      );
      trimmed = trimSilence(wav);
    }
    opts.onProgress?.();
    return { normalized: word.normalized, trimmed, usedFallback } satisfies SynthesizedWord;
  });

  const pcmParts: Buffer[] = [];
  let cumulativeMs = 0;
  let format: { sampleRate: number; numChannels: number; bitsPerSample: number } | undefined;
  const index: Record<string, [number, number]> = {};
  const fallbackWords: string[] = [];

  for (const { normalized, trimmed, usedFallback } of synthesized) {
    if (usedFallback) fallbackWords.push(normalized);
    if (!format)
      format = {
        sampleRate: trimmed.sampleRate,
        numChannels: trimmed.numChannels,
        bitsPerSample: trimmed.bitsPerSample,
      };

    const leadSilence = silencePcm(
      LEAD_PAD_MS,
      format.sampleRate,
      format.numChannels,
      format.bitsPerSample,
    );
    const tailSilence = silencePcm(
      TAIL_PAD_MS,
      format.sampleRate,
      format.numChannels,
      format.bitsPerSample,
    );

    const clipStartMs = cumulativeMs;
    pcmParts.push(leadSilence);
    cumulativeMs += LEAD_PAD_MS;
    pcmParts.push(trimmed.pcm);
    cumulativeMs += pcmDurationMs(
      trimmed.pcm,
      format.sampleRate,
      format.numChannels,
      format.bitsPerSample,
    );
    pcmParts.push(tailSilence);
    cumulativeMs += TAIL_PAD_MS;

    index[normalized] = [Math.round(clipStartMs), Math.round(cumulativeMs)];
  }

  if (!format) format = { sampleRate: 24000, numChannels: 1, bitsPerSample: 16 };

  return {
    pcm: Buffer.concat(pcmParts),
    sampleRate: format.sampleRate,
    numChannels: format.numChannels,
    bitsPerSample: format.bitsPerSample,
    index,
    fallbackWords,
  };
}

function ffmpegEncode(wavPath: string, mp3Path: string, bitrate: string): boolean {
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', bitrate, mp3Path],
    { stdio: 'ignore' },
  );
  return result.status === 0 && existsSync(mp3Path);
}

interface WordAudioReportRow {
  bookId: string;
  locale: string;
  wordCount: number;
  fallbackCount: number;
  format: 'mp3' | 'wav';
  bytes: number;
  lowBitrate: boolean;
}

async function wordAudioForBook(
  locale: string,
  bookId: string,
  force: boolean,
  hasFfmpeg: boolean,
): Promise<WordAudioReportRow | undefined> {
  const language = getLanguage(locale);
  if (!language.ttsVoice || !language.ttsLangCode) {
    console.log(`sotto-content word-audio: skipping ${locale}/${bookId} — no Kokoro voice`);
    return undefined;
  }

  const dir = bookDir(locale, bookId);
  const bookJsonPath = path.join(dir, 'book.json');
  if (!existsSync(bookJsonPath)) return undefined;
  const book = JSON.parse(readFileSync(bookJsonPath, 'utf8')) as Book;

  if (book.wordAudio && !force) {
    console.log(
      `sotto-content word-audio: ${bookId} already has wordAudio, skipping (use --force)`,
    );
    return undefined;
  }

  const words = collectWordTokens(dir, book);
  if (words.length === 0) return undefined;

  const ttsUrl = process.env.SOTTO_TTS_URL ?? DEFAULT_TTS_URL;
  console.log(
    `sotto-content word-audio: ${locale}/${bookId} — ${words.length} unique word tokens...`,
  );
  let done = 0;
  const result = await buildWordAudio(words, {
    ttsUrl,
    voice: language.ttsVoice,
    langCode: language.ttsLangCode,
    force,
    onProgress: () => {
      done += 1;
      if (done % 50 === 0 || done === words.length) {
        console.log(`sotto-content word-audio: ${bookId} — ${done}/${words.length} words`);
      }
    },
  });

  const audioDir = path.join(dir, 'audio');
  mkdirSync(audioDir, { recursive: true });
  const wavPath = path.join(audioDir, 'words.wav');
  const mp3Path = path.join(audioDir, 'words.mp3');
  writeFileSync(
    wavPath,
    buildWavFile(result.pcm, result.sampleRate, result.numChannels, result.bitsPerSample),
  );

  let format: 'mp3' | 'wav' = 'wav';
  let lowBitrate = false;
  if (hasFfmpeg && ffmpegEncode(wavPath, mp3Path, DEFAULT_BITRATE)) {
    format = 'mp3';
    if (statSync(mp3Path).size > SIZE_LIMIT_BYTES && ffmpegEncode(wavPath, mp3Path, LOW_BITRATE)) {
      lowBitrate = true;
    }
  }
  if (format === 'mp3') unlinkSync(wavPath);

  const finalPath = format === 'mp3' ? mp3Path : wavPath;
  const bytes = statSync(finalPath).size;

  const indexPath = path.join(audioDir, 'words.json');
  writeFileSync(
    indexPath,
    JSON.stringify({ schemaVersion: 1, words: result.index }, null, 2) + '\n',
    'utf8',
  );

  book.wordAudio = {
    file: `audio/words.${format}`,
    index: 'audio/words.json',
    count: words.length,
  };
  writeFileSync(bookJsonPath, JSON.stringify(book, null, 2) + '\n', 'utf8');

  return {
    bookId,
    locale,
    wordCount: words.length,
    fallbackCount: result.fallbackWords.length,
    format,
    bytes,
    lowBitrate,
  };
}

export interface WordAudioOptions {
  bookId?: string;
  force?: boolean;
}

export async function runWordAudioCommand(opts: WordAudioOptions = {}): Promise<void> {
  if (!existsSync(PACKS_DIR)) {
    console.log('sotto-content word-audio: packs/ does not exist, run `content:build` first');
    return;
  }
  const hasFfmpeg = ffmpegAvailable();
  console.log(
    `sotto-content word-audio: ffmpeg ${hasFfmpeg ? 'found' : 'NOT found'} on PATH — sprites will be ${hasFfmpeg ? 'mp3' : 'wav (fallback)'}`,
  );

  const rows: WordAudioReportRow[] = [];
  for (const locale of readdirSync(PACKS_DIR)) {
    const booksDir = path.join(PACKS_DIR, locale, 'books');
    if (!existsSync(booksDir) || !statSync(booksDir).isDirectory()) continue;
    for (const bookId of readdirSync(booksDir)) {
      if (opts.bookId && opts.bookId !== bookId) continue;
      const row = await wordAudioForBook(locale, bookId, Boolean(opts.force), hasFfmpeg);
      if (row) rows.push(row);
    }
  }

  console.log('\nsotto-content word-audio summary:');
  console.log(
    ['bookId', 'locale', 'words', 'fallback', 'format', 'bytes', 'lowBitrate'].join('  |  '),
  );
  for (const row of rows) {
    console.log(
      [
        row.bookId,
        row.locale,
        String(row.wordCount),
        String(row.fallbackCount),
        row.format,
        String(row.bytes),
        row.lowBitrate ? 'yes' : 'no',
      ].join('  |  '),
    );
  }
  if (rows.length === 0) {
    console.log(
      '(nothing generated — either every book already has wordAudio, or no locale here has a Kokoro voice)',
    );
  }
}
