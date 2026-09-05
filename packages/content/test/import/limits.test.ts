import { describe, expect, it } from 'vitest';
import { hardSplitParagraph, MAX_CHAPTERS, MAX_IMPORT_CHARS, MAX_PARAGRAPH_CHARS } from '../../src/import/limits.ts';
import { parseSource } from '../../src/import/parse/dispatch.ts';
import { ImportError } from '../../src/import/types.ts';

describe('hardSplitParagraph (finding 6)', () => {
  it('leaves a short paragraph untouched', () => {
    expect(hardSplitParagraph('short paragraph')).toEqual(['short paragraph']);
  });

  it('splits a paragraph above the limit into pieces at or under it', () => {
    const long = 'word '.repeat(10_000); // 50,000 chars
    const pieces = hardSplitParagraph(long);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(MAX_PARAGRAPH_CHARS);
    }
    // No text lost (modulo whitespace normalization at piece boundaries).
    expect(pieces.join(' ').replace(/\s+/g, ' ').trim().length).toBeGreaterThan(0);
  });

  it('splits a single run with no whitespace at all (no boundary to prefer)', () => {
    const long = 'a'.repeat(50_000);
    const pieces = hardSplitParagraph(long);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(MAX_PARAGRAPH_CHARS);
    }
    expect(pieces.join('').length).toBe(50_000);
  });
});

describe('parseSource total-size caps (finding 6)', () => {
  it('refuses a document over MAX_IMPORT_CHARS with a clear ImportError', () => {
    const big = 'word. '.repeat(Math.ceil((MAX_IMPORT_CHARS + 1000) / 6));
    const bytes = new TextEncoder().encode(big);
    let thrown: unknown;
    try {
      parseSource(bytes, 'huge.txt');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ImportError);
    expect((thrown as ImportError).code).toBe('unsupported');
    expect((thrown as ImportError).message).toMatch(/characters/);
  });

  it('refuses a document over MAX_CHAPTERS with a clear ImportError', () => {
    // A markdown doc with one heading per chapter, well past the cap.
    const chapterCount = MAX_CHAPTERS + 10;
    let md = '';
    for (let i = 0; i < chapterCount; i += 1) {
      md += `# Chapter ${i}\n\nSome short paragraph text for chapter ${i}.\n\n`;
    }
    const bytes = new TextEncoder().encode(md);
    let thrown: unknown;
    try {
      parseSource(bytes, 'huge.md');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ImportError);
    expect((thrown as ImportError).code).toBe('unsupported');
    expect((thrown as ImportError).message).toMatch(/chapters/);
  });

  it('accepts a normal, small document', () => {
    const bytes = new TextEncoder().encode('A short story.\n\nWith two paragraphs.');
    const parsed = parseSource(bytes, 'small.txt');
    expect(parsed.chapters.length).toBeGreaterThan(0);
  });
});
