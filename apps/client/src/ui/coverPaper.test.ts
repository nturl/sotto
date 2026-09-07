import { describe, expect, it } from 'vitest';
import {
  COVER_GLYPHS,
  coverInitial,
  coverMark,
  coverPaper,
  hashCoverSeed,
  paperInk,
  PAPER_BY_CATEGORY,
  type CoverSource,
} from './coverPaper';

function source(partial: Partial<CoverSource> & { id: string }): CoverSource {
  return {
    title: 'Le Petit Chaperon rouge',
    author: 'Charles Perrault',
    level: 'A1',
    categories: ['tales'],
    ...partial,
  };
}

const IDS = Array.from({ length: 200 }, (_, i) => `fr-book-${i}`);

describe('hashCoverSeed', () => {
  it('is stable for the same id', () => {
    expect(hashCoverSeed('fr-chevre-de-m-seguin')).toBe(hashCoverSeed('fr-chevre-de-m-seguin'));
  });

  it('separates different ids', () => {
    expect(hashCoverSeed('a')).not.toBe(hashCoverSeed('b'));
  });
});

describe('coverPaper', () => {
  it('gives the same book the same paper every time', () => {
    const book = source({ id: 'fr-chevre-de-m-seguin' });
    expect(coverPaper(book)).toBe(coverPaper(book));
  });

  it('only ever picks a paper from the primary collection triple', () => {
    for (const [category, triple] of Object.entries(PAPER_BY_CATEGORY)) {
      for (const id of IDS) {
        const picked = coverPaper(source({ id, categories: [category as never] }));
        expect(triple).toContain(picked);
      }
    }
  });

  it('uses the first category as the primary collection', () => {
    const id = 'fr-chevre-de-m-seguin';
    const fables = coverPaper(source({ id, categories: ['fables', 'tales'] }));
    const tales = coverPaper(source({ id, categories: ['tales', 'fables'] }));
    expect(PAPER_BY_CATEGORY.fables).toContain(fables);
    expect(PAPER_BY_CATEGORY.tales).toContain(tales);
  });

  it('falls back to tales when a book carries no category', () => {
    const picked = coverPaper(source({ id: 'x', categories: [] }));
    expect(PAPER_BY_CATEGORY.tales).toContain(picked);
  });

  it('spreads books across all three papers of a triple', () => {
    const picked = new Set(IDS.map((id) => coverPaper(source({ id, categories: ['tales'] }))));
    expect(picked.size).toBe(3);
  });
});

describe('paperInk', () => {
  it('prints ink on the three light papers', () => {
    expect(paperInk('sand')).toBe('ink');
    expect(paperInk('sage')).toBe('ink');
    expect(paperInk('peach')).toBe('ink');
  });

  it('prints canvas on the three dark papers', () => {
    expect(paperInk('teal')).toBe('canvas');
    expect(paperInk('brick')).toBe('canvas');
    expect(paperInk('slate')).toBe('canvas');
  });
});

describe('coverInitial', () => {
  it('strips a leading French article', () => {
    expect(coverInitial('Le Petit Chaperon rouge')).toBe('P');
    expect(coverInitial('La Chèvre de M. Seguin')).toBe('C');
    expect(coverInitial('Les Fables')).toBe('F');
  });

  it('strips an elided article across the apostrophe', () => {
    expect(coverInitial("L'Oiseau bleu")).toBe('O');
    expect(coverInitial('L’Oiseau bleu')).toBe('O');
  });

  it('strips a leading English article', () => {
    expect(coverInitial('The Red-Headed League')).toBe('R');
    expect(coverInitial('A Study in Scarlet')).toBe('S');
  });

  it('takes the first character of a CJK title', () => {
    expect(coverInitial('塞甘先生的羊')).toBe('塞');
  });

  it('keeps the initial when the title is only an article', () => {
    expect(coverInitial('Le')).toBe('L');
  });

  it('returns an empty string for an empty title', () => {
    expect(coverInitial('   ')).toBe('');
  });
});

describe('coverMark', () => {
  it('is stable for the same id', () => {
    const book = source({ id: 'fr-chevre-de-m-seguin' });
    expect(coverMark(book)).toEqual(coverMark(book));
  });

  it('reaches both the glyph branch and the initial branch', () => {
    const marks = IDS.map((id) => coverMark(source({ id })));
    expect(marks.some((m) => m.kind === 'glyph')).toBe(true);
    expect(marks.some((m) => m.kind === 'initial')).toBe(true);
    for (const mark of marks) {
      if (mark.kind === 'glyph') expect(COVER_GLYPHS).toContain(mark.text);
      else expect(mark.text).toBe('P');
    }
  });

  it('uses every glyph in the set across enough books', () => {
    const glyphs = new Set(
      IDS.map((id) => coverMark(source({ id }))).flatMap((m) =>
        m.kind === 'glyph' ? [m.text] : [],
      ),
    );
    expect(glyphs.size).toBe(COVER_GLYPHS.length);
  });
});
