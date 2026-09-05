/**
 * `sotto-content build` (planning/CONTRACTS.md §2a -> §2b): turns every
 * `source/*.bundle.json` into a built pack under `packs/<contentLocale>/`.
 * Data-driven — walks whatever bundles exist in source/, no per-book
 * special-casing (except the zh -> zh-TW edition step, which is itself
 * driven by each bundle's own `editions`/`hantOverrides` fields).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  contentLocales,
  getLanguage,
  tokenizeSentence,
  type Block,
  type Book,
  type BookSummary,
  type Chapter,
  type ChapterSummary,
  type Pack,
  type Sentence,
  type Token,
} from '@sotto/core';
import {
  SourceBundleSchema,
  type AttributionFile,
  type MissingGlossesFile,
  type SourceBundle,
} from './types.ts';
import { SOURCE_DIR, PACKS_DIR, bookDir, packDir, chapterFileName } from './paths.ts';
import { writeCoverIfMissing } from './covers.ts';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_URL,
  GLOSS_FILL_BATCH_SIZE,
  chunk,
  fillGlossesBatch,
  isLlmReachable,
  type GlossFillWord,
} from './gloss-fill.ts';

export interface BuildOptions {
  fill?: boolean;
  /** Build only this bookId (matches the source filename minus `.bundle.json`). */
  only?: string;
}

interface BuildRow {
  bookId: string;
  locale: string;
  chapters: number;
  wordTokens: number;
  missingBefore: number;
  filled: number;
  missingAfter: number;
}

type GlossaryMap = Record<string, Record<string, string>>;

// ---- token/sentence assembly -------------------------------------------

type TokenDraft = Omit<Token, 'id'>;

function buildTokens(
  text: string,
  strategy: 'latin' | 'presegmented',
  glossary: GlossaryMap,
  needsPinyin: boolean,
): { tokens: TokenDraft[]; missing: string[] } {
  const drafts = tokenizeSentence(text, strategy);
  const missing: string[] = [];
  const tokens: TokenDraft[] = drafts.map((d) => {
    if (!d.isWord) {
      return { text: d.text, normalized: d.normalized, isWord: false, spaceBefore: d.spaceBefore };
    }
    const entry = glossary[d.normalized];
    if (!entry) {
      missing.push(d.normalized);
      return { text: d.text, normalized: d.normalized, isWord: true, spaceBefore: d.spaceBefore };
    }
    if (needsPinyin) {
      const { pinyin, ...glosses } = entry;
      return {
        text: d.text,
        normalized: d.normalized,
        isWord: true,
        spaceBefore: d.spaceBefore,
        glosses,
        pinyin,
      };
    }
    return {
      text: d.text,
      normalized: d.normalized,
      isWord: true,
      spaceBefore: d.spaceBefore,
      glosses: entry,
    };
  });
  return { tokens, missing };
}

function sentenceDisplayText(
  tokens: TokenDraft[],
  strategy: 'latin' | 'presegmented',
  original: string,
): string {
  if (strategy === 'presegmented') {
    // Author writes zh source with spaces between words as a segmentation
    // aid; the builder removes them for display (CONTRACTS §2a).
    return tokens.map((t) => t.text).join('');
  }
  return original;
}

interface AssembleResult {
  chapters: Chapter[];
  chapterSummaries: ChapterSummary[];
  missing: Set<string>;
  wordTokenCount: number;
}

function assembleChapters(
  bundle: SourceBundle,
  bookId: string,
  strategy: 'latin' | 'presegmented',
  glossary: GlossaryMap,
  needsPinyin: boolean,
): AssembleResult {
  const chapters: Chapter[] = [];
  const chapterSummaries: ChapterSummary[] = [];
  const missing = new Set<string>();
  let wordTokenCount = 0;

  bundle.chapters.forEach((sourceChapter, chapterIndex) => {
    const order = chapterIndex + 1;
    const chapterId = `${bookId}-${String(order).padStart(2, '0')}`;
    const blocks: Block[] = [];
    let chapterWordCount = 0;

    sourceChapter.paragraphs.forEach((paragraph, blockIndex) => {
      const blockId = `b${blockIndex + 1}`;
      const sentences: Sentence[] = paragraph.sentences.map((sourceSentence, sentenceIndex) => {
        const sentenceId = `${blockId}.s${sentenceIndex + 1}`;
        const { tokens: drafts, missing: sentenceMissing } = buildTokens(
          sourceSentence.text,
          strategy,
          glossary,
          needsPinyin,
        );
        for (const m of sentenceMissing) missing.add(m);
        const tokens: Token[] = drafts.map((t, i) => ({ ...t, id: `${sentenceId}.t${i + 1}` }));
        chapterWordCount += tokens.filter((t) => t.isWord).length;
        wordTokenCount += tokens.filter((t) => t.isWord).length;
        return {
          id: sentenceId,
          text: sentenceDisplayText(drafts, strategy, sourceSentence.text),
          translations: sourceSentence.translation,
          tokens,
        };
      });
      blocks.push({ id: blockId, sentences });
    });

    chapters.push({ id: chapterId, bookId, title: sourceChapter.title, order, blocks });
    chapterSummaries.push({
      id: chapterId,
      title: sourceChapter.title,
      order,
      file: `chapters/${chapterFileName(order)}`,
      wordCount: chapterWordCount,
    });
  });

  return { chapters, chapterSummaries, missing, wordTokenCount };
}

// ---- carry forward narration state across rebuilds -------------------------
//
// A rebuild (e.g. picking up newly-arrived bundles alongside already-narrated
// ones) must not throw away `content:narrate`'s work: it re-tokenizes and
// re-writes every chapter/book.json from the bundle every time, which would
// otherwise silently drop token startMs/endMs and the book's audio/durationMs
// fields for unrelated, unchanged books. Before writing, merge in whatever
// timing/audio data the previous on-disk files already had, per matching
// token id (only when its text is unchanged — if the bundle text changed,
// the old timing would be wrong, so it's deliberately dropped instead).

function mergeExistingChapterTimings(dir: string, chapter: Chapter): Chapter {
  const chapterPath = path.join(dir, 'chapters', chapterFileName(chapter.order));
  if (!existsSync(chapterPath)) return chapter;
  let previous: Chapter;
  try {
    previous = JSON.parse(readFileSync(chapterPath, 'utf8')) as Chapter;
  } catch {
    return chapter;
  }
  const prevTokenById = new Map<string, Token>();
  for (const block of previous.blocks) {
    for (const sentence of block.sentences) {
      for (const token of sentence.tokens) prevTokenById.set(token.id, token);
    }
  }
  return {
    ...chapter,
    blocks: chapter.blocks.map((block) => ({
      ...block,
      sentences: block.sentences.map((sentence) => ({
        ...sentence,
        tokens: sentence.tokens.map((token) => {
          const prev = prevTokenById.get(token.id);
          if (
            prev &&
            prev.text === token.text &&
            prev.startMs !== undefined &&
            prev.endMs !== undefined
          ) {
            return { ...token, startMs: prev.startMs, endMs: prev.endMs };
          }
          return token;
        }),
      })),
    })),
  };
}

function mergeExistingChapterAssets(
  dir: string,
  chapterSummaries: ChapterSummary[],
): ChapterSummary[] {
  const bookJsonPath = path.join(dir, 'book.json');
  if (!existsSync(bookJsonPath)) return chapterSummaries;
  let previous: Book;
  try {
    previous = JSON.parse(readFileSync(bookJsonPath, 'utf8')) as Book;
  } catch {
    return chapterSummaries;
  }
  const prevById = new Map(previous.chapters.map((c) => [c.id, c]));
  return chapterSummaries.map((summary) => {
    const prev = prevById.get(summary.id);
    if (prev?.audio && prev.wordCount === summary.wordCount) {
      return {
        ...summary,
        audio: prev.audio,
        durationMs: prev.durationMs,
        ...(prev.alignment ? { alignment: prev.alignment } : {}),
      };
    }
    return summary;
  });
}

// ---- zh-TW edition (hantOverrides) --------------------------------------

function convertGreedy(text: string, overrides: Record<string, string>): string {
  const keys = Object.keys(overrides).sort((a, b) => b.length - a.length);
  let result = '';
  let i = 0;
  outer: while (i < text.length) {
    for (const key of keys) {
      if (text.startsWith(key, i)) {
        result += overrides[key];
        i += key.length;
        continue outer;
      }
    }
    result += text[i];
    i += 1;
  }
  return result;
}

function convertChaptersToHant(
  chapters: Chapter[],
  chapterSummaries: ChapterSummary[],
  overrides: Record<string, string>,
): { chapters: Chapter[]; chapterSummaries: ChapterSummary[]; replacedCount: number } {
  let replacedCount = 0;
  const hantChapters = chapters.map((chapter) => ({
    ...chapter,
    title: convertChapterTitle(chapter.title),
    blocks: chapter.blocks.map((block) => ({
      ...block,
      sentences: block.sentences.map((sentence) => {
        const tokens = sentence.tokens.map((token) => {
          const replacement = overrides[token.text];
          if (replacement === undefined) return token;
          replacedCount += 1;
          return { ...token, text: replacement, normalized: replacement };
        });
        return { ...sentence, text: tokens.map((t) => t.text).join(''), tokens };
      }),
    })),
  }));

  function convertChapterTitle(title: string): string {
    const converted = convertGreedy(title, overrides);
    if (converted !== title) replacedCount += 1;
    return converted;
  }

  const hantSummaries = chapterSummaries.map((s, i) => ({
    ...s,
    title: hantChapters[i]?.title ?? s.title,
  }));
  return { chapters: hantChapters, chapterSummaries: hantSummaries, replacedCount };
}

// ---- file writers --------------------------------------------------------

function writeChapters(dir: string, chapters: Chapter[]): void {
  const chaptersDir = path.join(dir, 'chapters');
  mkdirSync(chaptersDir, { recursive: true });
  for (const chapter of chapters) {
    writeFileSync(
      path.join(chaptersDir, chapterFileName(chapter.order)),
      JSON.stringify(chapter, null, 2) + '\n',
      'utf8',
    );
  }
}

function writeBookJson(dir: string, book: Book): void {
  writeFileSync(path.join(dir, 'book.json'), JSON.stringify(book, null, 2) + '\n', 'utf8');
}

function writeAttribution(dir: string, attributionBookId: string, bundle: SourceBundle): void {
  const attrPath = path.join(dir, 'attribution.json');
  let existingAudio: AttributionFile['audio'];
  if (existsSync(attrPath)) {
    try {
      const prev = JSON.parse(readFileSync(attrPath, 'utf8')) as AttributionFile;
      existingAudio = prev.audio;
    } catch {
      // Corrupt/foreign file — regenerate cleanly, don't propagate garbage.
    }
  }
  const attribution: AttributionFile = {
    schemaVersion: 1,
    bookId: attributionBookId,
    text: {
      author: bundle.author,
      sourceEdition: bundle.sourceEdition,
      sourceUrl: bundle.sourceUrl,
      sourceJurisdiction: bundle.sourceJurisdiction,
      adaptationEditor: bundle.adaptationEditor,
      license: bundle.license,
    },
    glosses: {
      editor: bundle.adaptationEditor,
      license: {
        spdx: 'CC-BY-SA-4.0',
        attribution: 'Sotto contributors; glosses adapted alongside the text',
      },
    },
    cover: {
      generator: 'sotto-content covers (deterministic seeded SVG)',
      license: { spdx: 'CC-BY-SA-4.0', attribution: 'Generated cover art' },
    },
    ...(existingAudio ? { audio: existingAudio } : {}),
  };
  writeFileSync(attrPath, JSON.stringify(attribution, null, 2) + '\n', 'utf8');
}

function writeMissingGlosses(dir: string, file: MissingGlossesFile): void {
  writeFileSync(
    path.join(dir, 'missing-glosses.json'),
    JSON.stringify(file, null, 2) + '\n',
    'utf8',
  );
}

function bookFromBundle(bundle: SourceBundle, chapterSummaries: ChapterSummary[]): Book {
  return {
    schemaVersion: 1,
    bookId: bundle.bookId,
    contentLocale: bundle.contentLocale,
    title: bundle.title,
    author: bundle.author,
    sourceEdition: bundle.sourceEdition,
    sourceUrl: bundle.sourceUrl,
    sourceJurisdiction: bundle.sourceJurisdiction,
    adaptationEditor: bundle.adaptationEditor,
    reviewStatus: bundle.reviewStatus,
    reviewedBy: bundle.reviewedBy,
    level: bundle.level,
    categories: bundle.categories,
    estimatedMinutes: bundle.estimatedMinutes,
    localizedTitles: bundle.localizedTitles,
    premise: bundle.premise,
    summary: bundle.summary,
    contentWarning: bundle.contentWarning,
    tutorNotes: bundle.tutorNotes,
    vocabulary: bundle.vocabulary,
    comprehension: bundle.comprehension,
    license: bundle.license,
    cover: 'cover.svg',
    chapters: chapterSummaries,
  };
}

// ---- gloss fill ------------------------------------------------------------

async function fillMissingGlosses(
  bundle: SourceBundle,
  missingWords: string[],
  sentenceByWord: Map<string, string>,
  llmUrl: string,
  llmModel: string,
): Promise<{ filled: number }> {
  const needsPinyin = getLanguage(bundle.contentLocale).pronunciationGuide === 'pinyin';
  const languageName = getLanguage(bundle.contentLocale).localizedNames.en;
  const batches = chunk(missingWords, GLOSS_FILL_BATCH_SIZE);
  let filled = 0;
  for (const batch of batches) {
    const words: GlossFillWord[] = batch.map((word) => ({
      word,
      contextSentence: sentenceByWord.get(word) ?? word,
    }));
    const result = await fillGlossesBatch(words, {
      baseUrl: llmUrl,
      model: llmModel,
      needsPinyin,
      contentLanguageName: languageName,
    });
    for (const word of batch) {
      const entry = result[word];
      if (entry) {
        bundle.glossary[word] = entry;
        filled += 1;
      }
    }
  }
  return { filled };
}

// ---- one bundle -> one (or two, for zh) built book ------------------------

async function buildOneBundle(
  bundle: SourceBundle,
  sourceFilePath: string,
  opts: { llmUrl: string; llmModel: string; shouldTryFill: boolean },
): Promise<{ rows: BuildRow[]; touchedLocales: Set<string> }> {
  const touchedLocales = new Set<string>();
  const rows: BuildRow[] = [];
  const language = getLanguage(bundle.contentLocale);
  const needsPinyin = language.pronunciationGuide === 'pinyin';

  // Pass 1: find what's missing against the glossary as authored.
  const missingSet = collectMissing(bundle, language.tokenizer, bundle.glossary);
  const missingBefore = missingSet.size;
  let filled = 0;

  if (missingSet.size > 0 && opts.shouldTryFill) {
    const sentenceByWord = firstContextSentencePerWord(bundle, language.tokenizer, missingSet);
    const result = await fillMissingGlosses(
      bundle,
      [...missingSet],
      sentenceByWord,
      opts.llmUrl,
      opts.llmModel,
    );
    filled = result.filled;
    if (filled > 0) {
      writeFileSync(sourceFilePath, JSON.stringify(bundle, null, 1) + '\n', 'utf8');
    }
  }

  // Pass 2: assemble the real chapter structures against the (possibly now-filled) glossary.
  const { chapters, chapterSummaries, missing, wordTokenCount } = assembleChapters(
    bundle,
    bundle.bookId,
    language.tokenizer,
    bundle.glossary,
    needsPinyin,
  );

  const dir = bookDir(bundle.contentLocale, bundle.bookId);
  mkdirSync(dir, { recursive: true });
  const mergedChapters = chapters.map((c) => mergeExistingChapterTimings(dir, c));
  const mergedSummaries = mergeExistingChapterAssets(dir, chapterSummaries);
  writeChapters(dir, mergedChapters);
  const book = bookFromBundle(bundle, mergedSummaries);
  writeBookJson(dir, book);
  writeCoverIfMissing(dir, {
    bookId: bundle.bookId,
    title: bundle.title,
    author: bundle.author,
    category: bundle.categories[0] ?? 'tales',
  });
  writeAttribution(dir, bundle.bookId, bundle);
  if (missing.size > 0) {
    writeMissingGlosses(dir, {
      bookId: bundle.bookId,
      contentLocale: bundle.contentLocale,
      missingWords: [...missing].sort(),
    });
  }
  touchedLocales.add(bundle.contentLocale);
  rows.push({
    bookId: bundle.bookId,
    locale: bundle.contentLocale,
    chapters: chapters.length,
    wordTokens: wordTokenCount,
    missingBefore,
    filled,
    missingAfter: missing.size,
  });

  // zh -> zh-TW edition
  if (bundle.editions?.includes('zh-TW')) {
    if (!bundle.hantOverrides) {
      console.warn(
        `sotto-content build: ${bundle.bookId} lists editions:["zh-TW"] but has no hantOverrides — skipping the edition`,
      );
    } else {
      const hantBookId = `${bundle.bookId}-hant`;
      const {
        chapters: hantChapters,
        chapterSummaries: hantSummaries,
        replacedCount,
      } = convertChaptersToHant(chapters, chapterSummaries, bundle.hantOverrides);
      const hantDir = bookDir('zh-TW', hantBookId);
      mkdirSync(hantDir, { recursive: true });
      const mergedHantChapters = hantChapters.map((c) => mergeExistingChapterTimings(hantDir, c));
      const mergedHantSummaries = mergeExistingChapterAssets(hantDir, hantSummaries);
      writeChapters(hantDir, mergedHantChapters);
      const hantBook: Book = {
        ...bookFromBundle(bundle, mergedHantSummaries),
        bookId: hantBookId,
        contentLocale: 'zh-TW',
        edition: 'zh-TW',
        sourceBookId: bundle.bookId,
        title: convertGreedy(bundle.title, bundle.hantOverrides),
        vocabulary: bundle.vocabulary.map((v) => ({
          ...v,
          word: convertGreedy(v.word, bundle.hantOverrides as Record<string, string>),
        })),
      };
      writeBookJson(hantDir, hantBook);
      writeCoverIfMissing(hantDir, {
        bookId: hantBookId,
        title: hantBook.title,
        author: bundle.author,
        category: bundle.categories[0] ?? 'tales',
      });
      writeAttribution(hantDir, hantBookId, bundle);
      touchedLocales.add('zh-TW');
      console.log(
        `sotto-content build: ${bundle.bookId} -> zh-TW edition "${hantBookId}": ${replacedCount} simplified->traditional replacements`,
      );
      rows.push({
        bookId: hantBookId,
        locale: 'zh-TW',
        chapters: hantChapters.length,
        wordTokens: wordTokenCount,
        missingBefore: 0,
        filled: 0,
        missingAfter: 0,
      });
    }
  }

  return { rows, touchedLocales };
}

function collectMissing(
  bundle: SourceBundle,
  strategy: 'latin' | 'presegmented',
  glossary: GlossaryMap,
): Set<string> {
  const missing = new Set<string>();
  for (const chapter of bundle.chapters) {
    for (const paragraph of chapter.paragraphs) {
      for (const sentence of paragraph.sentences) {
        for (const t of tokenizeSentence(sentence.text, strategy)) {
          if (t.isWord && !(t.normalized in glossary)) missing.add(t.normalized);
        }
      }
    }
  }
  return missing;
}

function firstContextSentencePerWord(
  bundle: SourceBundle,
  strategy: 'latin' | 'presegmented',
  words: Set<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const chapter of bundle.chapters) {
    for (const paragraph of chapter.paragraphs) {
      for (const sentence of paragraph.sentences) {
        for (const t of tokenizeSentence(sentence.text, strategy)) {
          if (t.isWord && words.has(t.normalized) && !map.has(t.normalized)) {
            map.set(t.normalized, sentence.text);
          }
        }
      }
    }
  }
  return map;
}

// ---- pack.json (rebuilt from what's actually on disk) ---------------------

function writePackJson(locale: string): void {
  const dir = packDir(locale);
  const booksDir = path.join(dir, 'books');
  if (!existsSync(booksDir)) return;
  const bookIds = readdirSync(booksDir).filter((id) =>
    existsSync(path.join(booksDir, id, 'book.json')),
  );
  const books: BookSummary[] = bookIds
    .map((bookId) => {
      const book = JSON.parse(
        readFileSync(path.join(booksDir, bookId, 'book.json'), 'utf8'),
      ) as Book;
      return {
        bookId,
        contentLocale: book.contentLocale,
        edition: book.edition,
        title: book.title,
        author: book.author,
        level: book.level,
        categories: book.categories,
        estimatedMinutes: book.estimatedMinutes,
        localizedTitles: book.localizedTitles,
        premise: book.premise,
        reviewStatus: book.reviewStatus,
        cover: book.cover,
        chapterCount: book.chapters.length,
      } satisfies BookSummary;
    })
    .sort((a, b) => a.bookId.localeCompare(b.bookId));

  const pack: Pack = {
    schemaVersion: 1,
    locale,
    language: getLanguage(locale),
    books,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(path.join(dir, 'pack.json'), JSON.stringify(pack, null, 2) + '\n', 'utf8');
}

// ---- tree printer (for the build report) -----------------------------------

function printTree(dir: string, prefix = ''): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  entries.forEach((entry, i) => {
    const isLast = i === entries.length - 1;
    console.log(`${prefix}${isLast ? '└── ' : '├── '}${entry.name}`);
    if (entry.isDirectory()) {
      printTree(path.join(dir, entry.name), `${prefix}${isLast ? '    ' : '│   '}`);
    }
  });
}

// ---- entry point -----------------------------------------------------------

export async function runBuildCommand(opts: BuildOptions = {}): Promise<void> {
  if (!existsSync(SOURCE_DIR)) {
    console.log('sotto-content build: source/ does not exist, nothing to build');
    return;
  }
  const files = readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.bundle.json'));
  if (files.length === 0) {
    console.log('sotto-content build: no source bundles found in source/');
    return;
  }

  const llmUrl = process.env.SOTTO_LLM_URL ?? DEFAULT_LLM_URL;
  const llmModel = process.env.SOTTO_LLM_MODEL ?? DEFAULT_LLM_MODEL;
  const reachable = await isLlmReachable(llmUrl);
  const shouldTryFill = Boolean(opts.fill || reachable);
  console.log(
    opts.fill
      ? `sotto-content build: gloss auto-fill forced on (--fill), using ${llmUrl}`
      : reachable
        ? `sotto-content build: LLM reachable at ${llmUrl}, gloss auto-fill enabled`
        : `sotto-content build: LLM not reachable at ${llmUrl}, missing glosses will be listed but not filled`,
  );

  const touchedLocales = new Set<string>();
  const rows: BuildRow[] = [];
  let hadSchemaError = false;

  for (const file of files) {
    const bundleId = file.replace(/\.bundle\.json$/, '');
    if (opts.only && opts.only !== bundleId) continue;

    const sourceFilePath = path.join(SOURCE_DIR, file);
    const raw = JSON.parse(readFileSync(sourceFilePath, 'utf8'));
    const parsed = SourceBundleSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(
        `sotto-content build: ${file} failed schema validation:\n${parsed.error.message}`,
      );
      hadSchemaError = true;
      continue;
    }
    if (!contentLocales().includes(parsed.data.contentLocale)) {
      console.error(
        `sotto-content build: ${file} has unknown contentLocale "${parsed.data.contentLocale}"`,
      );
      hadSchemaError = true;
      continue;
    }

    const { rows: bundleRows, touchedLocales: bundleLocales } = await buildOneBundle(
      parsed.data,
      sourceFilePath,
      {
        llmUrl,
        llmModel,
        shouldTryFill,
      },
    );
    rows.push(...bundleRows);
    for (const l of bundleLocales) touchedLocales.add(l);
  }

  for (const locale of touchedLocales) writePackJson(locale);

  console.log('\nsotto-content build summary:');
  console.log(
    ['bookId', 'locale', 'chapters', 'wordTokens', 'missing→filled', 'stillMissing'].join('  |  '),
  );
  for (const row of rows) {
    console.log(
      [
        row.bookId,
        row.locale,
        String(row.chapters),
        String(row.wordTokens),
        `${row.missingBefore}→${row.filled}`,
        String(row.missingAfter),
      ].join('  |  '),
    );
  }

  console.log('\npacks/');
  printTree(PACKS_DIR);

  if (hadSchemaError) process.exitCode = 1;
}
