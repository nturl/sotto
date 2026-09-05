import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../../src/import/parse/markdown.ts';

describe('parseMarkdown', () => {
  it('chapters by # and ## headings', () => {
    const md = [
      '# My Book',
      '',
      '## Chapter One',
      '',
      'This is the first paragraph.',
      '',
      'This is the second paragraph.',
      '',
      '## Chapter Two',
      '',
      'Another chapter starts here.',
    ].join('\n');
    const doc = parseMarkdown(md);
    // "My Book" itself has no body paragraphs before the next heading, so
    // it's dropped as an empty section — title is still reported from it.
    expect(doc.title).toBe('My Book');
    expect(doc.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two']);
    expect(doc.chapters[0]?.paragraphs).toEqual([
      'This is the first paragraph.',
      'This is the second paragraph.',
    ]);
  });

  it('strips inline emphasis, links, and code spans', () => {
    const md = '## Ch\n\nThis has **bold**, *italic*, `code`, and a [link](https://x.test).';
    const doc = parseMarkdown(md);
    expect(doc.chapters[0]?.paragraphs[0]).toBe('This has bold, italic, code, and a link.');
  });

  it('falls back to word-count grouping when there are no headings', () => {
    const doc = parseMarkdown('Paragraph one.\n\nParagraph two.');
    expect(doc.chapters).toHaveLength(1);
    expect(doc.chapters[0]?.paragraphs).toEqual(['Paragraph one.', 'Paragraph two.']);
  });
});
