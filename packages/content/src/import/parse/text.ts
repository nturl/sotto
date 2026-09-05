/**
 * Plain-text book parsing: chapters by blank-line-separated blocks of
 * roughly 1,500 words (no headings to key off in a .txt file).
 */
import { ImportError, type ParsedChapter, type ParsedDocument } from '../types.ts';
import { hardSplitParagraphs } from '../limits.ts';

const TARGET_WORDS_PER_CHAPTER = 1500;

function wordCount(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

/** Splits raw text into paragraphs on one-or-more blank lines. */
export function splitParagraphs(text: string): string[] {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
  return hardSplitParagraphs(paragraphs);
}

/**
 * Groups paragraphs into chapters of roughly TARGET_WORDS_PER_CHAPTER words
 * each, never splitting a paragraph across chapters. A chapter closes once
 * it reaches the target; the last chapter absorbs whatever remains.
 */
export function groupIntoChapters(paragraphs: string[]): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const paragraph of paragraphs) {
    current.push(paragraph);
    currentWords += wordCount(paragraph);
    if (currentWords >= TARGET_WORDS_PER_CHAPTER) {
      chapters.push({ title: `Chapter ${chapters.length + 1}`, paragraphs: current });
      current = [];
      currentWords = 0;
    }
  }
  if (current.length > 0) {
    chapters.push({ title: `Chapter ${chapters.length + 1}`, paragraphs: current });
  }
  return chapters;
}

export function parseText(content: string): ParsedDocument {
  const paragraphs = splitParagraphs(content);
  if (paragraphs.length === 0) {
    throw new ImportError('empty', 'the file has no readable text');
  }
  return { chapters: groupIntoChapters(paragraphs) };
}
