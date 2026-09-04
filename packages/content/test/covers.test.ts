import { describe, expect, it } from 'vitest';
import { generateCoverSvg, type CoverInput } from '../src/covers.ts';

describe('generateCoverSvg', () => {
  it('is deterministic for the same bookId', () => {
    const a = generateCoverSvg({
      bookId: 'fr-petit-chaperon-rouge',
      title: 'Le Petit Chaperon rouge',
      author: 'Charles Perrault',
      category: 'tales',
    });
    const b = generateCoverSvg({
      bookId: 'fr-petit-chaperon-rouge',
      title: 'Le Petit Chaperon rouge',
      author: 'Charles Perrault',
      category: 'tales',
    });
    expect(a).toBe(b);
  });

  it('differs for a different bookId even with identical other inputs', () => {
    const a = generateCoverSvg({
      bookId: 'book-a',
      title: 'Same Title',
      author: 'Same Author',
      category: 'tales',
    });
    const b = generateCoverSvg({
      bookId: 'book-b',
      title: 'Same Title',
      author: 'Same Author',
      category: 'tales',
    });
    expect(a).not.toBe(b);
  });

  it('uses the 220x330 viewBox and includes the title text', () => {
    const svg = generateCoverSvg({
      bookId: 'x',
      title: 'A Fable',
      author: 'Aesop',
      category: 'fables',
    });
    expect(svg).toContain('viewBox="0 0 220 330"');
    expect(svg).toContain('A Fable');
    expect(svg).toContain('AESOP');
  });

  it('escapes XML-sensitive characters in the title', () => {
    const svg = generateCoverSvg({
      bookId: 'x',
      title: 'Cat & Dog <3',
      author: 'A & B',
      category: 'daily',
    });
    expect(svg).not.toContain('Cat & Dog <3');
    expect(svg).toContain('Cat &amp; Dog &lt;3');
  });

  it('falls back to the tales palette for an unknown category', () => {
    // Deliberately outside the BookCategory union, to check the runtime fallback.
    const input = {
      bookId: 'x',
      title: 'X',
      author: 'Y',
      category: 'not-a-real-category',
    } as unknown as CoverInput;
    const svg = generateCoverSvg(input);
    expect(svg).toContain('#1F4F57'); // Nightjar ground
  });
});
