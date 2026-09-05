/**
 * Markdown book parsing: chapters by `#`/`##` headings when present,
 * otherwise the same word-count grouping text.ts uses.
 */
import { ImportError, type ParsedChapter, type ParsedDocument } from '../types.ts';
import { groupIntoChapters, splitParagraphs } from './text.ts';

const HEADING_RE = /^(#{1,2})\s+(.+?)\s*$/;

/** Strips the most common inline markdown emphasis/link/code markers down
 * to plain readable text — this is a graded reader import, not a markdown
 * renderer, so a light touch is enough. */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '');
}

interface HeadingSplit {
  title: string;
  body: string;
}

function splitByHeadings(content: string): HeadingSplit[] | undefined {
  const lines = content.split(/\r?\n/);
  const sections: HeadingSplit[] = [];
  let currentTitle: string | undefined;
  let currentBody: string[] = [];

  for (const line of lines) {
    const match = HEADING_RE.exec(line);
    if (match) {
      if (currentTitle !== undefined) {
        sections.push({ title: currentTitle, body: currentBody.join('\n') });
      } else if (currentBody.some((l) => l.trim().length > 0)) {
        // Text before the first heading — keep it as an untitled lead-in
        // section so nothing is silently dropped.
        sections.push({ title: 'Chapter 1', body: currentBody.join('\n') });
      }
      currentTitle = match[2] ?? 'Chapter';
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentTitle !== undefined) {
    sections.push({ title: currentTitle, body: currentBody.join('\n') });
  }
  return sections.length > 0 ? sections : undefined;
}

export function parseMarkdown(content: string): ParsedDocument {
  const plain = stripInlineMarkdown(content);
  const sections = splitByHeadings(plain);

  if (sections) {
    const chapters: ParsedChapter[] = sections
      .map((s) => ({ title: s.title, paragraphs: splitParagraphs(s.body) }))
      .filter((c) => c.paragraphs.length > 0);
    if (chapters.length > 0) {
      const title = sections[0]?.title;
      return { title, chapters };
    }
  }

  const paragraphs = splitParagraphs(plain);
  if (paragraphs.length === 0) {
    throw new ImportError('empty', 'the file has no readable text');
  }
  return { chapters: groupIntoChapters(paragraphs) };
}
