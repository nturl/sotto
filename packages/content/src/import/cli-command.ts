/**
 * `sotto-content import <file> --locale xx-XX --out <dir> [--narrate none|first|all]`
 * (planning/LEDGER.md "R3-I Importer"): the CLI wrapper around `importBook`
 * that writes a pack directory outside packages/content/packs (the caller
 * names --out — never the seeded packs tree).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_LLM_MODEL, DEFAULT_LLM_URL } from '../gloss-fill.ts';
import { DEFAULT_STT_URL, DEFAULT_TTS_URL } from '../narrate.ts';
import { generateCoverSvg } from '../covers.ts';
import { chapterFileName } from '../paths.ts';
import { importBook } from './pipeline.ts';
import { detectLanguage } from './detect.ts';
import type { ImportProgress, NarrationMode } from './types.ts';

export interface ImportCommandOptions {
  file?: string;
  locale?: string;
  out?: string;
  narrate?: string;
}

function formatProgress(event: ImportProgress): string {
  const chapterPart = event.chapter
    ? ` chapter ${event.chapter}/${event.totalChapters ?? '?'}`
    : '';
  return `[${event.stage}]${chapterPart} ${event.done}/${event.total}`;
}

export async function runImportCommand(opts: ImportCommandOptions): Promise<void> {
  if (!opts.file) {
    console.error('sotto-content import: missing <file>');
    process.exitCode = 1;
    return;
  }
  if (!existsSync(opts.file)) {
    console.error(`sotto-content import: file not found: ${opts.file}`);
    process.exitCode = 1;
    return;
  }
  if (!opts.out) {
    console.error('sotto-content import: --out <dir> is required');
    process.exitCode = 1;
    return;
  }

  const bytes = new Uint8Array(readFileSync(opts.file));
  const filename = path.basename(opts.file);

  let locale = opts.locale;
  if (!locale) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const detection = detectLanguage(text);
    console.log(
      `sotto-content import: no --locale given, detected ${detection.locale} (confidence ${(detection.confidence * 100).toFixed(0)}%)`,
    );
    locale = detection.locale;
  }

  const narrate = (opts.narrate ?? 'first') as NarrationMode;
  if (!['none', 'first', 'all'].includes(narrate)) {
    console.error(`sotto-content import: invalid --narrate value "${narrate}" (none|first|all)`);
    process.exitCode = 1;
    return;
  }

  const llmUrl = process.env.SOTTO_LLM_URL ?? DEFAULT_LLM_URL;
  const llmModel = process.env.SOTTO_LLM_MODEL ?? DEFAULT_LLM_MODEL;
  const ttsUrl = process.env.SOTTO_TTS_URL ?? DEFAULT_TTS_URL;
  const sttUrl = process.env.SOTTO_STT_URL ?? DEFAULT_STT_URL;

  const startedAt = Date.now();
  const result = await importBook(
    { bytes, filename },
    {
      contentLocale: locale,
      llm: { baseUrl: llmUrl, model: llmModel },
      tts: narrate === 'none' ? undefined : { baseUrl: ttsUrl },
      stt: narrate === 'none' ? undefined : { baseUrl: sttUrl },
      narrate,
      onProgress: (event) => console.log(formatProgress(event)),
    },
  );
  const totalMs = Date.now() - startedAt;

  const dir = path.join(opts.out, result.book.bookId);
  mkdirSync(path.join(dir, 'chapters'), { recursive: true });
  mkdirSync(path.join(dir, 'audio'), { recursive: true });

  writeFileSync(path.join(dir, 'book.json'), JSON.stringify(result.book, null, 2) + '\n', 'utf8');
  for (const chapter of result.chapters) {
    writeFileSync(
      path.join(dir, 'chapters', chapterFileName(chapter.order)),
      JSON.stringify(chapter, null, 2) + '\n',
      'utf8',
    );
  }
  for (const [file, data] of result.audio) {
    writeFileSync(path.join(dir, 'audio', file), data);
  }
  writeFileSync(
    path.join(dir, 'cover.svg'),
    generateCoverSvg({
      bookId: result.book.bookId,
      title: result.book.title,
      author: result.book.author,
      category: result.book.categories[0] ?? 'daily',
    }),
    'utf8',
  );
  writeFileSync(
    path.join(dir, 'attribution.json'),
    JSON.stringify(result.attribution, null, 2) + '\n',
    'utf8',
  );

  console.log('\nsotto-content import summary:');
  console.log(`bookId: ${result.book.bookId}`);
  console.log(`title: ${result.book.title}`);
  console.log(`contentLocale: ${result.book.contentLocale}`);
  console.log(`chapters: ${result.stats.chapters}`);
  console.log(`words: ${result.stats.wordCount} (${result.stats.wordTokenCount} word tokens)`);
  console.log(`missing glosses after fill: ${result.stats.missingGlosses}`);
  console.log(`detection confidence: ${(result.stats.detectionConfidence * 100).toFixed(0)}%`);
  console.log('elapsed (ms):', JSON.stringify(result.stats.elapsedMs));
  console.log(`total wall time: ${totalMs}ms`);
  const chapterCount = result.chapters.length || 1;
  console.log(
    `avg per chapter — glossing: ${Math.round(result.stats.elapsedMs.glossing / chapterCount)}ms, ` +
      `translating: ${Math.round(result.stats.elapsedMs.translating / chapterCount)}ms, ` +
      `narrating: ${Math.round(result.stats.elapsedMs.narrating / Math.max(1, narrate === 'all' ? chapterCount : 1))}ms`,
  );
  console.log(`written to: ${dir}`);
}
