/**
 * `sotto-content new` — scaffolds `packages/content/source/<bookId>.bundle.json`
 * (planning/CONTRACTS.md §2a) with every schema-required field present.
 * Provenance fields the CLI can't know (source edition/URL/jurisdiction,
 * adaptation editor, license) are filled with `CONFIRM: ...` placeholders a
 * human must replace before the bundle ships — see docs/adding-a-book.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BOOK_LEVELS, type BookLevel } from '@sotto/core';
import { SOURCE_DIR } from './paths.ts';
import { SourceBundleSchema, type SourceBundle, type SourceChapterSchema } from './types.ts';
import type { z } from 'zod';

export interface ScaffoldOptions {
  bookId: string;
  locale: string;
  title: string;
  author: string;
  /** Path to a plain-text file to split into the book's one chapter. */
  fromFile?: string;
  level?: BookLevel;
}

type SourceChapter = z.infer<typeof SourceChapterSchema>;

const CONFIRM = (hint: string): string => `CONFIRM: ${hint}`;

/** zh-* content locales have no inter-word spaces, so sentences are split on
 * CJK terminal punctuation instead of the Latin whitespace-plus-capital
 * heuristic below. */
function isCjkLocale(locale: string): boolean {
  return locale.startsWith('zh');
}

/**
 * A deliberately simple sentence splitter for scaffolding — good enough to
 * turn a pasted plain-text source into one-sentence-per-line-item, not a
 * linguistically rigorous segmenter. The human contributor reviews and
 * fixes the split (merging abbreviations, fixing dialogue breaks, etc.)
 * before the bundle ships; see docs/adding-a-book.md.
 */
export function splitSentences(text: string, locale: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (isCjkLocale(locale)) {
    const parts = trimmed
      .split(/(?<=[。！？])/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [trimmed];
  }
  // Split after ./!/? followed by whitespace and a capital letter, digit, or
  // opening quote — avoids splitting mid-abbreviation in the common case
  // ("Mr. Smith") since a lowercase word rarely follows a real sentence end.
  const parts = trimmed
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9«"“'¿¡])/u)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

/** Blank-line-separated paragraphs (one or more blank lines between). */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function chapterFromText(text: string, locale: string, title: string): SourceChapter {
  const paragraphs = splitParagraphs(text);
  const sourceParagraphs = paragraphs.map((paragraph) => ({
    sentences: splitSentences(paragraph, locale).map((sentence) => ({
      text: sentence,
      translation: {},
    })),
  }));
  return {
    title,
    paragraphs:
      sourceParagraphs.length > 0
        ? sourceParagraphs
        : [{ sentences: [{ text: CONFIRM('add chapter text here'), translation: {} }] }],
  };
}

function placeholderChapter(): SourceChapter {
  return {
    title: CONFIRM('chapter title'),
    paragraphs: [{ sentences: [{ text: CONFIRM('add chapter text here'), translation: {} }] }],
  };
}

export function buildScaffoldBundle(opts: ScaffoldOptions): SourceBundle {
  const chapter = opts.fromFile
    ? chapterFromText(readFileSync(opts.fromFile, 'utf8'), opts.locale, opts.title)
    : placeholderChapter();

  const bundle: SourceBundle = {
    schemaVersion: 1,
    bookId: opts.bookId,
    contentLocale: opts.locale,
    title: opts.title,
    author: opts.author,
    sourceEdition: CONFIRM('which edition/printing this was adapted from'),
    sourceUrl: CONFIRM('URL of the source text'),
    sourceJurisdiction: CONFIRM('public-domain basis, e.g. "Public domain worldwide"'),
    adaptationEditor: CONFIRM('who adapted/abridged this text'),
    reviewStatus: 'draft',
    level: opts.level ?? 'A1',
    categories: ['tales'],
    estimatedMinutes: 5,
    localizedTitles: {},
    premise: {},
    summary: {},
    contentWarning: null,
    tutorNotes: {
      pronunciation: CONFIRM('pronunciation notes for this book'),
      grammar: CONFIRM('grammar notes for this book'),
      culture: CONFIRM('cultural notes for this book'),
      commonErrors: CONFIRM('common learner errors for this book'),
    },
    vocabulary: [{ word: CONFIRM('add a vocabulary word'), gloss: {} }],
    comprehension: [{ question: {} }],
    license: {
      spdx: 'CC-BY-SA-4.0',
      attribution: CONFIRM('e.g. "Sotto contributors; based on <source>"'),
    },
    chapters: [chapter],
    glossary: {},
  };

  return bundle;
}

export function bundlePath(bookId: string): string {
  return path.join(SOURCE_DIR, `${bookId}.bundle.json`);
}

export interface RunScaffoldResult {
  filePath: string;
}

export function runScaffold(opts: ScaffoldOptions): RunScaffoldResult {
  const filePath = bundlePath(opts.bookId);
  if (existsSync(filePath)) {
    throw new Error(
      `sotto-content new: ${filePath} already exists — refusing to overwrite. ` +
        'Edit it directly, or pick a different bookId.',
    );
  }
  const bundle = buildScaffoldBundle(opts);
  const parsed = SourceBundleSchema.safeParse(bundle);
  if (!parsed.success) {
    // Should not happen — a bug in the scaffold, not a bad CLI input.
    throw new Error(
      `sotto-content new: generated bundle failed its own schema:\n${parsed.error.message}`,
    );
  }
  mkdirSync(SOURCE_DIR, { recursive: true });
  writeFileSync(filePath, JSON.stringify(parsed.data, null, 1) + '\n', 'utf8');
  return { filePath };
}

export function runNewCommand(opts: {
  bookId?: string;
  locale?: string;
  title?: string;
  author?: string;
  from?: string;
  level?: string;
}): void {
  if (!opts.bookId) {
    throw new Error('sotto-content new: missing <bookId> (e.g. `sotto-content new fr-my-book`)');
  }
  if (!opts.locale) throw new Error('sotto-content new: --locale is required (e.g. fr-FR)');
  if (!opts.title) throw new Error('sotto-content new: --title is required');
  if (!opts.author) throw new Error('sotto-content new: --author is required');
  if (opts.level && !BOOK_LEVELS.includes(opts.level as BookLevel)) {
    throw new Error(`sotto-content new: --level must be one of ${BOOK_LEVELS.join(', ')}`);
  }

  const { filePath } = runScaffold({
    bookId: opts.bookId,
    locale: opts.locale,
    title: opts.title,
    author: opts.author,
    fromFile: opts.from,
    level: opts.level as BookLevel | undefined,
  });

  console.log(`sotto-content new: wrote ${filePath}`);
  console.log(
    'Next: fill the CONFIRM: ... provenance fields, then run `pnpm --filter @sotto/content build ' +
      `${opts.bookId}\` (add --fill to draft glosses with the local LLM), then \`pnpm content:validate\`. ` +
      'See docs/adding-a-book.md.',
  );
}
