import { describe, expect, it } from 'vitest';
import { groupIntoChapters, parseText, splitParagraphs } from '../../src/import/parse/text.ts';
import { ImportError } from '../../src/import/types.ts';

describe('splitParagraphs', () => {
  it('splits on blank lines and collapses internal whitespace', () => {
    const text = 'Hello   world.\nStill line one.\n\nSecond   paragraph.\n\n\nThird.';
    expect(splitParagraphs(text)).toEqual([
      'Hello world. Still line one.',
      'Second paragraph.',
      'Third.',
    ]);
  });

  it('drops empty paragraphs', () => {
    expect(splitParagraphs('\n\n\n   \n\nReal text.\n\n')).toEqual(['Real text.']);
  });
});

describe('groupIntoChapters', () => {
  it('keeps everything in one chapter when under the word target', () => {
    const chapters = groupIntoChapters(['Short paragraph one.', 'Short paragraph two.']);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.paragraphs).toEqual(['Short paragraph one.', 'Short paragraph two.']);
  });

  it('starts a new chapter once the word target is reached, never splitting a paragraph', () => {
    const bigParagraph = Array.from({ length: 1600 }, (_, i) => `word${i}`).join(' ');
    const chapters = groupIntoChapters([bigParagraph, 'A short tail paragraph.']);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.paragraphs).toEqual([bigParagraph]);
    expect(chapters[1]?.paragraphs).toEqual(['A short tail paragraph.']);
  });
});

describe('parseText', () => {
  it('parses plain text into chapters', () => {
    const doc = parseText('Paragraph one.\n\nParagraph two.');
    expect(doc.chapters).toHaveLength(1);
    expect(doc.chapters[0]?.paragraphs).toEqual(['Paragraph one.', 'Paragraph two.']);
  });

  it('throws ImportError("empty") for a file with no readable text', () => {
    expect(() => parseText('   \n\n  \n')).toThrow(ImportError);
    try {
      parseText('');
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError);
      expect((err as ImportError).code).toBe('empty');
    }
  });
});
