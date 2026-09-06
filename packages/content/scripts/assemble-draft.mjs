#!/usr/bin/env node
/**
 * `node scripts/assemble-draft.mjs <bookId> [--force]`
 * (planning/LIBRARY-EXPANSION.md "Draft format", Lane P): turns an
 * author-written draft at `drafts/<bookId>.draft.json` into a schema-valid
 * source bundle at `source/<bookId>.bundle.json`. Authors write drafts only;
 * they never touch source/ or packs/ and never run pnpm.
 *
 * Fills in the fields a draft doesn't carry: `schemaVersion`,
 * `adaptationEditor`, `reviewStatus`, `license`, `glossary`. Converts
 * chapters from the draft's `paragraphs: string[][]` shape (one array of
 * sentence strings per paragraph) to the bundle's
 * `paragraphs: [{sentences: [{text, translation}]}]` shape — sentences are
 * trimmed and empty strings dropped.
 *
 * Refuses to assemble a draft that still contains an unresolved
 * "CONFIRM: ..." placeholder (the scaffold's marker for content a human
 * hasn't filled in) anywhere in the draft. Refuses to overwrite an existing
 * bundle unless --force.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceBundleSchema } from '../src/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = path.join(__dirname, '..');
export const DRAFTS_DIR = path.join(CONTENT_ROOT, 'drafts');
export const SOURCE_DIR = path.join(CONTENT_ROOT, 'source');

export function draftPath(bookId) {
  return path.join(DRAFTS_DIR, `${bookId}.draft.json`);
}

export function bundlePath(bookId) {
  return path.join(SOURCE_DIR, `${bookId}.bundle.json`);
}

/**
 * Converts a draft chapter (`paragraphs: string[][]`) into the bundle's
 * chapter shape (`paragraphs: [{sentences: [{text, translation}]}]`).
 * Trims whitespace on every sentence and drops any that end up empty.
 */
export function convertChapter(chapter) {
  const paragraphs = [];
  for (const paragraph of chapter.paragraphs) {
    const sentences = paragraph
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0)
      .map((text) => ({ text, translation: {} }));
    if (sentences.length > 0) paragraphs.push({ sentences });
  }
  return { title: chapter.title, paragraphs };
}

/**
 * Walks a parsed draft looking for a string containing the scaffold's
 * "CONFIRM: ..." placeholder marker. Returns a dotted/bracketed path to the
 * first hit (e.g. "tutorNotes.grammar" or "vocabulary[2].word"), or null.
 */
export function findConfirmMarker(value, pathSoFar = '') {
  if (typeof value === 'string') {
    return value.includes('CONFIRM:') ? pathSoFar || '(root)' : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findConfirmMarker(value[i], `${pathSoFar}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      const hit = findConfirmMarker(entry, pathSoFar ? `${pathSoFar}.${key}` : key);
      if (hit) return hit;
    }
    return null;
  }
  return null;
}

/**
 * Builds a (not yet validated) source bundle object from a parsed draft.
 * Every draft field is carried over as-is; the fields authors don't write
 * (schemaVersion, adaptationEditor, reviewStatus, license, glossary) are
 * filled in, and chapters are converted to the bundle shape. The result
 * should always be passed through `SourceBundleSchema.safeParse` — its
 * `.strict()` shape means an unexpected field on the draft (a typo, or a
 * field the pipeline doesn't yet fill) fails loudly here rather than
 * silently reaching source/.
 */
export function buildBundleFromDraft(draft) {
  return {
    ...draft,
    schemaVersion: 1,
    adaptationEditor: 'Sotto contributors (AI first draft, unreviewed)',
    reviewStatus: 'draft',
    contentWarning: draft.contentWarning ?? null,
    license: {
      spdx: 'CC-BY-SA-4.0',
      attribution: `Sotto contributors; based on the public-domain original by ${draft.author}`,
    },
    glossary: {},
    chapters: draft.chapters.map(convertChapter),
  };
}

/**
 * Word/sentence stats for the CLI summary. zh content has no inter-word
 * spaces, so it's counted by character (whitespace-stripped) rather than
 * whitespace-split token.
 */
export function computeStats(bundle) {
  const isZh = bundle.contentLocale.startsWith('zh');
  let sentenceCount = 0;
  let wordCount = 0;
  for (const chapter of bundle.chapters) {
    for (const paragraph of chapter.paragraphs) {
      for (const sentence of paragraph.sentences) {
        sentenceCount += 1;
        wordCount += isZh
          ? sentence.text.replace(/\s+/g, '').length
          : sentence.text.split(/\s+/).filter(Boolean).length;
      }
    }
  }
  return {
    chapterCount: bundle.chapters.length,
    sentenceCount,
    wordCount,
    meanSentenceLength: sentenceCount > 0 ? wordCount / sentenceCount : 0,
  };
}

function parseArgs(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  return { bookId: positional[0], force: argv.includes('--force') };
}

function main() {
  const { bookId, force } = parseArgs(process.argv.slice(2));
  if (!bookId) {
    console.error('usage: node scripts/assemble-draft.mjs <bookId> [--force]');
    process.exitCode = 1;
    return;
  }

  const draftFile = draftPath(bookId);
  if (!existsSync(draftFile)) {
    console.error(`assemble-draft: ${draftFile} does not exist`);
    process.exitCode = 1;
    return;
  }

  const draft = JSON.parse(readFileSync(draftFile, 'utf8'));
  if (draft.bookId !== bookId) {
    console.error(
      `assemble-draft: draft's bookId "${draft.bookId}" does not match the requested "${bookId}"`,
    );
    process.exitCode = 1;
    return;
  }

  const confirmHit = findConfirmMarker(draft);
  if (confirmHit) {
    console.error(
      `assemble-draft: draft contains an unresolved "CONFIRM:" placeholder at ${confirmHit} — refusing to assemble`,
    );
    process.exitCode = 1;
    return;
  }

  const outFile = bundlePath(bookId);
  if (existsSync(outFile) && !force) {
    console.error(
      `assemble-draft: ${outFile} already exists — refusing to overwrite. Pass --force to overwrite.`,
    );
    process.exitCode = 1;
    return;
  }

  const bundle = buildBundleFromDraft(draft);
  const parsed = SourceBundleSchema.safeParse(bundle);
  if (!parsed.success) {
    console.error(
      `assemble-draft: assembled bundle failed schema validation:\n${parsed.error.message}`,
    );
    process.exitCode = 1;
    return;
  }

  mkdirSync(SOURCE_DIR, { recursive: true });
  writeFileSync(outFile, JSON.stringify(parsed.data, null, 1) + '\n', 'utf8');

  const stats = computeStats(parsed.data);
  console.log(`assemble-draft: wrote ${outFile}`);
  console.log(`  bookId: ${bookId}`);
  console.log(`  level: ${parsed.data.level}`);
  console.log(`  chapters: ${stats.chapterCount}`);
  console.log(`  sentences: ${stats.sentenceCount}`);
  console.log(`  words: ${stats.wordCount}`);
  console.log(`  mean sentence length: ${stats.meanSentenceLength.toFixed(1)}`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
