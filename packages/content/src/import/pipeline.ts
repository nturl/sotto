/**
 * `importBook` (planning/LEDGER.md "R3-I Importer"): parses a reader-
 * supplied EPUB/TXT/Markdown file into a private, on-device pack by
 * reusing the exact same tokenize/gloss/translate/narrate/align steps the
 * seeded-content pipeline uses (build.ts, gloss-fill.ts,
 * translate-sentences.ts, narrate.ts, align.ts) — nothing here reimplements
 * those; it only adds what a reader-supplied file needs that an authored
 * source bundle doesn't: format parsing, sentence splitting (source
 * bundles are pre-split by the author), and language detection.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  getLanguage,
  tokenizeSentence,
  type Block,
  type Book,
  type BookCategory,
  type Chapter,
  type ChapterSummary,
  type Sentence,
  type Token,
} from '@sotto/core';
import { chunk, fillGlossesBatch, GLOSS_FILL_BATCH_SIZE, GLOSS_LOCALES } from '../gloss-fill.ts';
import { TRANSLATE_BATCH_SIZE, translateSentencesBatch } from '../translate-sentences.ts';
import { encodeAudio, ffmpegAvailable, narrateChapter as narrateChapterCore } from '../narrate.ts';
import { buildWavFile } from '../wav.ts';
import { chapterFileName } from '../paths.ts';
import { parseSource as dispatchParseSource } from './parse/dispatch.ts';
import { splitSentences } from './sentences.ts';
import { detectLanguage } from './detect.ts';
import {
  ImportError,
  type ImportAttribution,
  type ImportOptions,
  type ImportProgress,
  type ImportResult,
  type ImportSttOptions,
  type ImportTtsOptions,
  type ParsedDocument,
} from './types.ts';

export { ImportError, detectLanguage };
export type * from './types.ts';

// Target locale names for translate-sentences' prompt — mirrors
// translate-sentences.ts's own (unexported) `targetLocaleName` table; kept
// as a small duplicate data table rather than exporting/importing across
// files for a 9-entry constant (translate-sentences.ts already keeps its
// own copy separate from gloss-fill.ts's near-identical LOCALE_NAMES).
const TARGET_LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
  'zh-Hans': 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
  ro: 'Romanian',
  ca: 'Catalan',
};

function wordCount(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return base.replace(/[_-]+/g, ' ').trim() || 'Imported book';
}

/** Re-exported (not reimplemented) so CLI/server callers of this module
 * keep one import site; see parse/dispatch.ts for why it lives there. */
export const parseSource = dispatchParseSource;

// ---- token/sentence assembly (mirrors build.ts's buildTokens, but a
// reader-supplied file has no author-provided glossary to draw from — every
// gloss comes from fillGlossesBatch, collected across the whole book first
// so a repeated word costs one LLM call, not one per occurrence). ---------

interface DraftSentence {
  text: string;
  tokens: ReturnType<typeof tokenizeSentence>;
}
interface DraftBlock {
  sentences: DraftSentence[];
}
interface DraftChapter {
  title: string;
  blocks: DraftBlock[];
}

function draftChapters(
  parsed: ParsedDocument,
  strategy: 'latin' | 'presegmented',
  typography: 'latin' | 'cjk',
): DraftChapter[] {
  return parsed.chapters.map((chapter) => ({
    title: chapter.title,
    blocks: chapter.paragraphs.map((paragraph) => ({
      sentences: splitSentences(paragraph, typography).map((text) => ({
        text,
        tokens: tokenizeSentence(text, strategy),
      })),
    })),
  }));
}

function collectMissingWords(chapters: DraftChapter[]): Map<string, string> {
  const firstContext = new Map<string, string>();
  for (const chapter of chapters) {
    for (const block of chapter.blocks) {
      for (const sentence of block.sentences) {
        for (const t of sentence.tokens) {
          if (t.isWord && !firstContext.has(t.normalized)) {
            firstContext.set(t.normalized, sentence.text);
          }
        }
      }
    }
  }
  return firstContext;
}

function sentenceDisplayText(
  tokens: ReturnType<typeof tokenizeSentence>,
  strategy: 'latin' | 'presegmented',
  original: string,
): string {
  if (strategy === 'presegmented') return tokens.map((t) => t.text).join('');
  return original;
}

function assembleChapters(
  bookId: string,
  drafts: DraftChapter[],
  strategy: 'latin' | 'presegmented',
  glossary: Map<string, Record<string, string>>,
  needsPinyin: boolean,
): { chapters: Chapter[]; summaries: ChapterSummary[]; wordTokenCount: number } {
  const chapters: Chapter[] = [];
  const summaries: ChapterSummary[] = [];
  let wordTokenCount = 0;

  drafts.forEach((draft, chapterIndex) => {
    const order = chapterIndex + 1;
    const chapterId = `${bookId}-${String(order).padStart(2, '0')}`;
    const blocks: Block[] = [];
    let chapterWordCount = 0;

    draft.blocks.forEach((draftBlock, blockIndex) => {
      const blockId = `b${blockIndex + 1}`;
      const sentences: Sentence[] = draftBlock.sentences.map((draftSentence, sentenceIndex) => {
        const sentenceId = `${blockId}.s${sentenceIndex + 1}`;
        const tokens: Token[] = draftSentence.tokens.map((d, i) => {
          const id = `${sentenceId}.t${i + 1}`;
          if (!d.isWord) {
            return {
              id,
              text: d.text,
              normalized: d.normalized,
              isWord: false,
              spaceBefore: d.spaceBefore,
            };
          }
          chapterWordCount += 1;
          wordTokenCount += 1;
          const entry = glossary.get(d.normalized);
          if (!entry) {
            return {
              id,
              text: d.text,
              normalized: d.normalized,
              isWord: true,
              spaceBefore: d.spaceBefore,
            };
          }
          if (needsPinyin) {
            const { pinyin, ...glosses } = entry;
            return {
              id,
              text: d.text,
              normalized: d.normalized,
              isWord: true,
              spaceBefore: d.spaceBefore,
              glosses,
              pinyin,
            };
          }
          return {
            id,
            text: d.text,
            normalized: d.normalized,
            isWord: true,
            spaceBefore: d.spaceBefore,
            glosses: entry,
          };
        });
        return {
          id: sentenceId,
          text: sentenceDisplayText(draftSentence.tokens, strategy, draftSentence.text),
          translations: {},
          tokens,
        };
      });
      blocks.push({ id: blockId, sentences });
    });

    chapters.push({ id: chapterId, bookId, title: draft.title, order, blocks });
    summaries.push({
      id: chapterId,
      title: draft.title,
      order,
      file: `chapters/${chapterFileName(order)}`,
      wordCount: chapterWordCount,
    });
  });

  return { chapters, summaries, wordTokenCount };
}

// ---- gloss fill ------------------------------------------------------------

async function fillAllGlosses(
  missingByWord: Map<string, string>,
  opts: ImportOptions,
  needsPinyin: boolean,
  contentLanguageName: string,
  report: (done: number, total: number) => void,
): Promise<Map<string, Record<string, string>>> {
  const glossary = new Map<string, Record<string, string>>();
  const words = [...missingByWord.keys()];
  const batches = chunk(words, GLOSS_FILL_BATCH_SIZE);
  let done = 0;
  report(done, batches.length);
  for (const batch of batches) {
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const result = await fillGlossesBatch(
      batch.map((word) => ({ word, contextSentence: missingByWord.get(word) ?? word })),
      { baseUrl: opts.llm.baseUrl, model: opts.llm.model, needsPinyin, contentLanguageName },
    );
    for (const word of batch) {
      const entry = result[word];
      if (entry) glossary.set(word, entry);
    }
    done += 1;
    report(done, batches.length);
  }
  return glossary;
}

// ---- sentence translation --------------------------------------------------

interface SentenceRef {
  key: string;
  sentence: Sentence;
}

function collectSentenceRefs(chapters: Chapter[]): SentenceRef[] {
  const refs: SentenceRef[] = [];
  chapters.forEach((chapter, ci) => {
    chapter.blocks.forEach((block, bi) => {
      block.sentences.forEach((sentence, si) => {
        refs.push({ key: `${ci}.${bi}.${si}`, sentence });
      });
    });
  });
  return refs;
}

async function translateAllSentences(
  refs: SentenceRef[],
  opts: ImportOptions,
  contentLanguageName: string,
  ownCatalog: string,
  report: (done: number, total: number) => void,
): Promise<void> {
  const targetLocales = opts.glossLocales ?? [...GLOSS_LOCALES];
  // Identity shortcut: the book's own language's "translation" is the
  // sentence text itself (matches translate-sentences.ts's
  // NATIVE_EXPLANATION_LOCALE identity behaviour for the seeded pipeline).
  for (const ref of refs) {
    if (targetLocales.includes(ownCatalog))
      ref.sentence.translations[ownCatalog] = ref.sentence.text;
  }
  const localesToCall = targetLocales.filter((l) => l !== ownCatalog);

  const totalBatches = localesToCall.length * Math.ceil(refs.length / TRANSLATE_BATCH_SIZE);
  let done = 0;
  report(done, Math.max(totalBatches, 1));

  for (const locale of localesToCall) {
    const batches = chunk(refs, TRANSLATE_BATCH_SIZE);
    for (const batch of batches) {
      if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const result = await translateSentencesBatch(
        batch.map((r) => ({ key: r.key, text: r.sentence.text })),
        {
          baseUrl: opts.llm.baseUrl,
          model: opts.llm.model,
          targetLocaleName: TARGET_LOCALE_NAMES[locale] ?? locale,
          contentLanguageName,
          targetLocale: locale,
        },
      );
      for (const r of batch) {
        const translated = result[r.key];
        if (translated) r.sentence.translations[locale] = translated;
      }
      done += 1;
      report(done, Math.max(totalBatches, 1));
    }
  }
}

// ---- narration --------------------------------------------------------------

/** Encodes a narrated chapter's PCM to mp3 (falling back to wav without
 * ffmpeg) via a scratch temp dir — the only filesystem use in the pipeline
 * beyond what narrate.ts's reused `narrateChapter`/cache already does, and
 * strictly local/ephemeral (cleaned up before returning). */
function encodeChapterAudio(
  pcm: Buffer,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
  order: number,
): { fileName: string; bytes: Uint8Array } {
  const hasFfmpeg = ffmpegAvailable();
  const dir = mkdtempSync(path.join(tmpdir(), 'sotto-import-'));
  const base = String(order).padStart(2, '0');
  const wavPath = path.join(dir, `${base}.wav`);
  const mp3Path = path.join(dir, `${base}.mp3`);
  try {
    writeFileSync(wavPath, buildWavFile(pcm, sampleRate, numChannels, bitsPerSample));
    const format = encodeAudio(wavPath, mp3Path, hasFfmpeg);
    const outPath = format === 'mp3' ? mp3Path : wavPath;
    const bytes = readFileSync(outPath);
    return { fileName: `${base}.${format}`, bytes: new Uint8Array(bytes) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function narrateOneChapter(
  chapter: Chapter,
  order: number,
  contentLocale: string,
  tts: ImportTtsOptions,
  stt: ImportSttOptions,
): Promise<
  | {
      fileName: string;
      bytes: Uint8Array;
      durationMs: number;
      alignment: ChapterSummary['alignment'];
    }
  | undefined
> {
  const language = getLanguage(contentLocale);
  if (!language.ttsVoice || !language.ttsLangCode) return undefined; // no Kokoro voice (ro-RO, ca-ES)

  const result = await narrateChapterCore(chapter, {
    ttsUrl: tts.baseUrl,
    sttUrl: stt.baseUrl,
    voice: tts.voice ?? language.ttsVoice,
    langCode: language.ttsLangCode,
    sttLanguage: language.sttLanguage,
    force: false,
  });
  const { fileName, bytes } = encodeChapterAudio(
    result.pcm,
    result.sampleRate,
    result.numChannels,
    result.bitsPerSample,
    order,
  );
  return {
    fileName,
    bytes,
    durationMs: result.durationMs,
    alignment: {
      matched: result.matchedWords,
      total: result.matchedWords + result.interpolatedWords,
      method: 'lcs+clitic-split+fuzzy-0.34',
    },
  };
}

// ---- entry point ------------------------------------------------------------

export async function importBook(
  source: { bytes: Uint8Array; filename: string },
  opts: ImportOptions,
): Promise<ImportResult> {
  const started = { parsing: 0, detecting: 0, glossing: 0, translating: 0, narrating: 0 };
  const elapsed = { parsing: 0, detecting: 0, glossing: 0, translating: 0, narrating: 0 };
  const emit = (event: ImportProgress) => opts.onProgress?.(event);

  // 1. parse ------------------------------------------------------------
  started.parsing = Date.now();
  emit({ stage: 'parsing', done: 0, total: 1 });
  const parsed = parseSource(source.bytes, source.filename);
  emit({ stage: 'parsing', done: 1, total: 1 });
  elapsed.parsing = Date.now() - started.parsing;

  // 2. detect (advisory — the caller already chose opts.contentLocale;
  // this is reported in stats so the UI's "Modifier" affordance can show
  // what the detector actually thought). ---------------------------------
  started.detecting = Date.now();
  emit({ stage: 'detecting', done: 0, total: 1 });
  const fullText = parsed.chapters.flatMap((c) => c.paragraphs).join(' ');
  const detection = detectLanguage(fullText);
  emit({ stage: 'detecting', done: 1, total: 1 });
  elapsed.detecting = Date.now() - started.detecting;

  const language = getLanguage(opts.contentLocale);
  const drafts = draftChapters(parsed, language.tokenizer, language.typography);
  const needsPinyin = language.pronunciationGuide === 'pinyin';

  // 3. gloss missing words -----------------------------------------------
  started.glossing = Date.now();
  const missing = collectMissingWords(drafts);
  const glossary = await fillAllGlosses(
    missing,
    opts,
    needsPinyin,
    language.localizedNames.en,
    (done, total) => emit({ stage: 'glossing', done, total }),
  );
  elapsed.glossing = Date.now() - started.glossing;

  const bookId = `private-${randomBytes(4).toString('hex')}`;
  const { chapters, summaries, wordTokenCount } = assembleChapters(
    bookId,
    drafts,
    language.tokenizer,
    glossary,
    needsPinyin,
  );

  // 4. translate sentences --------------------------------------------------
  started.translating = Date.now();
  const refs = collectSentenceRefs(chapters);
  await translateAllSentences(
    refs,
    opts,
    language.localizedNames.en,
    language.catalog,
    (done, total) => emit({ stage: 'translating', done, total }),
  );
  elapsed.translating = Date.now() - started.translating;

  // 5. narrate (chapter 1 always when narrate != 'none'; the rest only for
  // narrate: 'all' — narrateChapter() below covers the lazy per-chapter
  // path for narrate: 'first'). --------------------------------------------
  started.narrating = Date.now();
  const audio = new Map<string, Uint8Array>();
  const wordCountTotal = parsed.chapters.reduce(
    (sum, c) => sum + c.paragraphs.reduce((s, p) => s + wordCount(p), 0),
    0,
  );

  if (opts.narrate !== 'none') {
    if (!opts.tts || !opts.stt) {
      throw new Error('opts.tts and opts.stt are required when opts.narrate !== "none"');
    }
    const chaptersToNarrate =
      opts.narrate === 'all' ? chapters.map((_, i) => i) : chapters.length > 0 ? [0] : [];
    for (const index of chaptersToNarrate) {
      const chapter = chapters[index];
      const summary = summaries[index];
      if (!chapter || !summary) continue;
      emit({
        stage: 'narrating',
        chapter: index + 1,
        totalChapters: chapters.length,
        done: index,
        total: chaptersToNarrate.length,
      });
      const narrated = await narrateOneChapter(
        chapter,
        summary.order,
        opts.contentLocale,
        opts.tts,
        opts.stt,
      );
      if (narrated) {
        audio.set(narrated.fileName, narrated.bytes);
        summary.audio = `audio/${narrated.fileName}`;
        summary.durationMs = narrated.durationMs;
        summary.alignment = narrated.alignment;
      }
    }
    emit({
      stage: 'narrating',
      totalChapters: chapters.length,
      done: chaptersToNarrate.length,
      total: chaptersToNarrate.length,
    });
  }
  elapsed.narrating = Date.now() - started.narrating;

  const estimatedMinutes = Math.max(1, Math.round(wordCountTotal / 130));
  const title = parsed.title?.trim() || titleFromFilename(source.filename);
  const author = parsed.author?.trim() || 'Unknown';

  const book: Book = {
    schemaVersion: 1,
    bookId,
    contentLocale: opts.contentLocale,
    title,
    author,
    sourceEdition: `Imported from "${source.filename}"`,
    sourceUrl: '',
    sourceJurisdiction: 'Unknown — privately imported by the reader',
    adaptationEditor: 'Imported by the reader (no editor)',
    reviewStatus: 'draft',
    level: opts.level ?? 'A1',
    categories: ['daily'] as BookCategory[],
    estimatedMinutes,
    localizedTitles: {},
    premise: {},
    summary: {},
    contentWarning: null,
    tutorNotes: {
      pronunciation: language.tutorNotes,
      grammar: language.tutorNotes,
      culture: language.tutorNotes,
      commonErrors: language.tutorNotes,
    },
    vocabulary: [],
    comprehension: [],
    license: { spdx: 'private', attribution: 'Uploaded by the reader for private use' },
    cover: 'cover.svg',
    chapters: summaries,
    private: true,
  };

  const attribution: ImportAttribution = {
    schemaVersion: 1,
    bookId,
    text: {
      author,
      sourceEdition: book.sourceEdition,
      sourceUrl: '',
      sourceJurisdiction: book.sourceJurisdiction,
      adaptationEditor: book.adaptationEditor,
      license: book.license,
    },
  };

  return {
    book,
    chapters,
    audio,
    attribution,
    stats: {
      chapters: chapters.length,
      wordCount: wordCountTotal,
      wordTokenCount,
      missingGlosses: missing.size - glossary.size,
      detectionConfidence: detection.confidence,
      elapsedMs: elapsed,
    },
  };
}

// ---- lazy per-chapter narration (after the first import) -------------------

export interface NarrateChapterOptions {
  tts: ImportTtsOptions;
  stt: ImportSttOptions;
}

/**
 * Narrates one chapter of an already-imported book that wasn't narrated up
 * front (narrate: 'none' | 'first' left later chapters silent). Mutates
 * `result.chapters[chapterIndex]` (token timings), `result.book.chapters
 * [chapterIndex]` (audio/durationMs/alignment) and `result.audio` in place.
 * A no-op (returns false) if the chapter is already narrated or the
 * content locale has no Kokoro voice.
 */
export async function narrateChapter(
  result: ImportResult,
  chapterIndex: number,
  opts: NarrateChapterOptions,
): Promise<boolean> {
  const chapter = result.chapters[chapterIndex];
  const summary = result.book.chapters[chapterIndex];
  if (!chapter || !summary) {
    throw new RangeError(`no chapter at index ${chapterIndex}`);
  }
  if (summary.audio) return false;

  const narrated = await narrateOneChapter(
    chapter,
    summary.order,
    result.book.contentLocale,
    opts.tts,
    opts.stt,
  );
  if (!narrated) return false;

  result.audio.set(narrated.fileName, narrated.bytes);
  summary.audio = `audio/${narrated.fileName}`;
  summary.durationMs = narrated.durationMs;
  summary.alignment = narrated.alignment;
  return true;
}
