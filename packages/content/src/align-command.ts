/**
 * `sotto-content align [--locale xx]` (O2-C task C2): re-runs the
 * alignment step against the STT already captured during narration and
 * rewrites startMs/endMs in chapters/*.json, WITHOUT re-narrating (no
 * Kokoro calls) and without touching the audio files themselves.
 *
 * Each sentence's whisper words were cached at narration time, keyed by
 * `cacheKey(text, voice, speed)` (see narrate.ts) — the language forced on
 * that original STT call hasn't changed, only the alignment algorithm has,
 * so replaying the cached transcript through the new `alignWords` pipeline
 * is sufficient. If a sentence's cache entry is missing this re-issues the
 * STT call (still never TTS) so the command also works after a partial
 * cache eviction.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getLanguage, type Book, type Chapter, type Token } from '@sotto/core';
import { CACHE_DIR, PACKS_DIR } from './paths.ts';
import { alignWords, interpolateTimings, type WhisperWord } from './align.ts';
import {
  NARRATION_SPEED,
  PARAGRAPH_GAP_MS,
  SENTENCE_GAP_MS,
  cacheKey,
  flattenSentences,
  type SentenceRef,
} from './narrate.ts';
import { parseWav, pcmDurationMs } from './wav.ts';

const DEFAULT_STT_URL = 'http://127.0.0.1:9001/v1';

interface WhisperVerboseJson {
  segments?: { words?: { word: string; start: number; end: number }[] }[];
}

async function fetchSttWords(
  wavBuffer: Buffer,
  sttUrl: string,
  sttLanguage: string,
): Promise<WhisperWord[]> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' }), 'sentence.wav');
  form.append('language', sttLanguage);
  form.append('response_format', 'verbose_json');
  const res = await fetch(`${sttUrl}/audio/transcriptions`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`STT request failed (${res.status})`);
  const json = (await res.json()) as WhisperVerboseJson;
  return (json.segments ?? []).flatMap((s) => s.words ?? []);
}

async function loadSentenceStt(
  text: string,
  voice: string,
  sttUrl: string,
  sttLanguage: string,
): Promise<{ words: WhisperWord[]; durationSec: number } | undefined> {
  const key = cacheKey(text, voice, NARRATION_SPEED);
  const wavCachePath = path.join(CACHE_DIR, `${key}.wav`);
  const sttCachePath = path.join(CACHE_DIR, `${key}.stt.json`);
  if (!existsSync(wavCachePath)) return undefined;

  const wavBuffer = readFileSync(wavCachePath);
  const wav = parseWav(wavBuffer);
  const durationSec =
    pcmDurationMs(wav.pcm, wav.sampleRate, wav.numChannels, wav.bitsPerSample) / 1000;

  const words = existsSync(sttCachePath)
    ? (JSON.parse(readFileSync(sttCachePath, 'utf8')) as WhisperWord[])
    : await fetchSttWords(wavBuffer, sttUrl, sttLanguage);

  return { words, durationSec };
}

interface AlignChapterResult {
  matched: number;
  total: number;
  skippedSentences: number;
}

async function alignChapter(
  chapter: Chapter,
  opts: { voice: string; sttUrl: string; sttLanguage: string },
): Promise<AlignChapterResult> {
  const refs: SentenceRef[] = flattenSentences(chapter);
  let cumulativeMs = 0;
  let matched = 0;
  let total = 0;
  let skippedSentences = 0;

  for (let index = 0; index < refs.length; index++) {
    const ref = refs[index] as SentenceRef;
    const { sentence } = ref;
    const gapMs = index === 0 ? 0 : ref.isFirstInBlock ? PARAGRAPH_GAP_MS : SENTENCE_GAP_MS;
    cumulativeMs += gapMs;

    const cached = await loadSentenceStt(sentence.text, opts.voice, opts.sttUrl, opts.sttLanguage);
    if (!cached) {
      skippedSentences += 1;
      // Fall back to whatever duration the existing tokens already imply so
      // later sentences don't drift.
      const lastToken = sentence.tokens.at(-1);
      const firstToken = sentence.tokens[0];
      const fallbackMs =
        lastToken?.endMs !== undefined && firstToken?.startMs !== undefined
          ? lastToken.endMs - firstToken.startMs
          : 0;
      cumulativeMs += Math.max(0, fallbackMs);
      continue;
    }

    const sentenceStartMs = cumulativeMs;
    const wordTokenIndices: number[] = [];
    const wordTokenTexts: string[] = [];
    sentence.tokens.forEach((t, i) => {
      if (t.isWord) {
        wordTokenIndices.push(i);
        wordTokenTexts.push(t.text);
      }
    });

    const { matches, stats } = alignWords(wordTokenTexts, cached.words);
    const spans = interpolateTimings(matches, cached.durationSec);
    matched += stats.matched;
    total += stats.total;

    spans.forEach((span, k) => {
      const tokenIndex = wordTokenIndices[k] as number;
      const token = sentence.tokens[tokenIndex] as Token;
      token.startMs = Math.round(sentenceStartMs + span.start * 1000);
      token.endMs = Math.round(sentenceStartMs + span.end * 1000);
    });

    cumulativeMs += cached.durationSec * 1000;
  }

  return { matched, total, skippedSentences };
}

export interface AlignReportRow {
  bookId: string;
  locale: string;
  chapterId: string;
  matchedBefore?: number;
  totalBefore?: number;
  matched: number;
  total: number;
  skippedSentences: number;
}

export interface AlignOptions {
  locale?: string;
}

export async function runAlignCommand(opts: AlignOptions = {}): Promise<AlignReportRow[]> {
  if (!existsSync(PACKS_DIR)) {
    console.log('sotto-content align: packs/ does not exist, run `content:build` first');
    return [];
  }
  const sttUrl = process.env.SOTTO_STT_URL ?? DEFAULT_STT_URL;
  const rows: AlignReportRow[] = [];

  for (const locale of readdirSync(PACKS_DIR)) {
    if (opts.locale && opts.locale !== locale) continue;
    const booksDir = path.join(PACKS_DIR, locale, 'books');
    if (!existsSync(booksDir) || !statSync(booksDir).isDirectory()) continue;

    let language: ReturnType<typeof getLanguage> | undefined;
    try {
      language = getLanguage(locale);
    } catch {
      language = undefined;
    }
    if (!language?.ttsVoice) {
      console.log(
        `sotto-content align: skipping ${locale} — no Kokoro voice, so nothing was narrated`,
      );
      continue;
    }

    for (const bookId of readdirSync(booksDir)) {
      const dir = path.join(booksDir, bookId);
      const bookJsonPath = path.join(dir, 'book.json');
      if (!existsSync(bookJsonPath)) continue;
      const book = JSON.parse(readFileSync(bookJsonPath, 'utf8')) as Book;

      for (const chapterSummary of book.chapters) {
        if (!chapterSummary.audio) continue; // never narrated, nothing to align
        const chapterPath = path.join(dir, chapterSummary.file);
        if (!existsSync(chapterPath)) continue;
        const chapter = JSON.parse(readFileSync(chapterPath, 'utf8')) as Chapter;

        console.log(`sotto-content align: ${locale}/${bookId} — ${chapterSummary.title}...`);
        const result = await alignChapter(chapter, {
          voice: language.ttsVoice,
          sttUrl,
          sttLanguage: language.sttLanguage,
        });

        writeFileSync(chapterPath, JSON.stringify(chapter, null, 2) + '\n', 'utf8');

        rows.push({
          bookId,
          locale,
          chapterId: chapterSummary.id,
          matchedBefore: chapterSummary.alignment?.matched,
          totalBefore: chapterSummary.alignment?.total,
          matched: result.matched,
          total: result.total,
          skippedSentences: result.skippedSentences,
        });

        if (result.total > 0) {
          chapterSummary.alignment = {
            matched: result.matched,
            total: result.total,
            method: 'lcs+clitic-split+fuzzy-0.34',
          };
        }
      }

      writeFileSync(bookJsonPath, JSON.stringify(book, null, 2) + '\n', 'utf8');
    }
  }

  console.log('\nsotto-content align summary:');
  console.log(['bookId', 'chapter', 'before', 'after', 'skipped'].join('  |  '));
  for (const row of rows) {
    const before =
      row.totalBefore !== undefined && row.totalBefore > 0
        ? `${((100 * (row.matchedBefore ?? 0)) / row.totalBefore).toFixed(1)}%`
        : 'n/a';
    const after = row.total > 0 ? `${((100 * row.matched) / row.total).toFixed(1)}%` : 'n/a';
    console.log(
      [row.bookId, row.chapterId, before, after, String(row.skippedSentences)].join('  |  '),
    );
  }
  if (rows.length === 0) {
    console.log('(nothing to align — no narrated chapters found for the requested locale)');
  }
  return rows;
}
