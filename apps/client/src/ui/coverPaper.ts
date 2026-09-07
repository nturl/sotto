/**
 * The typographic cover system's pure decisions (run 8 PLAN decisions 2-4).
 * React-Native-free on purpose — `Cover.tsx` imports `react-native`, which
 * this repo's plain `vitest run` cannot parse (no RN transform; see
 * `railView.ts`'s comment for the same split) — so every choice a cover
 * makes from a book's metadata lives here and is tested in
 * `coverPaper.test.ts`.
 *
 * The eight flat illustrations this replaced were a hash of the bookId into
 * arbitrary artwork. Here the hash only picks *within* a collection's
 * palette triple, so a book's paper still says something true about it.
 */
import type { BookCategory, BookLevel, CoverInk } from '@sotto/core';
import type { PaperName } from '@sotto/core/theme';

/** The metadata a cover renders from. `LibraryBook` satisfies it
 * structurally, so every call site passes the book it already has. */
export type CoverSource = {
  id: string;
  title: string;
  author: string;
  level: BookLevel;
  categories: BookCategory[];
  /** Real pack cover. The hand-authored art for a book that has `coverInk`;
   * otherwise used only as a fallback when `title` is empty (the
   * placeholder book the library seam returns before packs land). */
  svgUrl?: string;
  /** Set by `sotto-content build` for a book whose cover.svg is drawn art
   * with a solid band across its bottom (CoverInk names which of the two
   * text colours prints on that band). Absent on an imported/private book
   * and on any pack built before the art landed. */
  coverInk?: CoverInk;
};

/**
 * Which cover a book gets. Direction B (planning/design/COVERS-DIRECTIONS
 * -SPEC.md): a book with authored art wears it and the app prints the title
 * block over the art's band; everything else keeps the run 8 typographic
 * cover built from metadata. `svgUrl` is required for the authored branch
 * because that is where the art actually is.
 */
export type CoverArt =
  { kind: 'authored'; svgUrl: string; ink: CoverInk } | { kind: 'typographic' };

export function coverArt(book: Pick<CoverSource, 'svgUrl' | 'coverInk'>): CoverArt {
  if (book.coverInk && book.svgUrl) {
    return { kind: 'authored', svgUrl: book.svgUrl, ink: book.coverInk };
  }
  return { kind: 'typographic' };
}

/** The fraction of the cover's height the authored band occupies: the art is
 * drawn in a 220x330 viewBox with the band running from y 232 to the foot. */
export const BAND_TOP = 232 / 330;
export const BAND_HEIGHT = 98 / 330;

/** PLAN decision 3: paper per collection, variation by id. */
export const PAPER_BY_CATEGORY: Record<BookCategory, readonly PaperName[]> = {
  tales: ['sand', 'peach', 'brick'],
  fables: ['sage', 'teal', 'sand'],
  adventure: ['teal', 'slate', 'sage'],
  classics: ['slate', 'brick', 'sand'],
  folk: ['brick', 'sand', 'peach'],
  idioms: ['peach', 'sage', 'teal'],
  daily: ['sand', 'teal', 'peach'],
};

/** Papers dark enough that the cover prints in canvas rather than ink
 * (verified against 4.5:1 in `packages/core/src/theme.test.ts`). */
const CANVAS_PAPERS: readonly PaperName[] = ['teal', 'brick', 'slate'];

/** PLAN decision 4: the glyph set, used when a book draws the glyph branch. */
export const COVER_GLYPHS = ['✶', '◐', '△', '◯'] as const;

/**
 * Leading articles stripped before taking a title's initial (PLAN decision
 * 4). Lower-cased; the elided forms ("l'") are matched separately across
 * the apostrophe.
 */
const ARTICLES = new Set([
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'el',
  'los',
  'las',
  'una',
  'il',
  'lo',
  'gli',
  'o',
  'a',
  'os',
  'as',
  'the',
  'an',
  'der',
  'die',
  'das',
  'ein',
]);

/** Articles that elide onto the next word with an apostrophe ("L'Oiseau"). */
const ELIDED_ARTICLES = new Set(['l', 'd']);

/** Stable, order-independent-free string hash — the same djb2-ish walk the
 * old `hashCover` used, kept so a book's cover does not move for a reader
 * who already knows it by sight. */
export function hashCoverSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

/** The book's paper: its primary collection's triple, indexed by id hash. */
export function coverPaper(book: Pick<CoverSource, 'id' | 'categories'>): PaperName {
  const primary = book.categories[0];
  const triple = (primary && PAPER_BY_CATEGORY[primary]) || PAPER_BY_CATEGORY.tales;
  return triple[hashCoverSeed(book.id) % triple.length]!;
}

/** Which of the two text colours a paper carries. */
export function paperInk(paper: PaperName): 'ink' | 'canvas' {
  return CANVAS_PAPERS.includes(paper) ? 'canvas' : 'ink';
}

/**
 * The title's initial, with a leading article stripped. CJK titles have no
 * article and no word breaks, so the first character falls out of the same
 * walk (`toLocaleUpperCase` is identity on Han).
 */
export function coverInitial(title: string): string {
  const cleaned = title.trim();
  if (!cleaned) return '';
  const words = cleaned.split(/\s+/);
  let word = words[0]!;

  const elided = word.match(/^(\p{L}+)['’](.+)$/u);
  if (elided && ELIDED_ARTICLES.has(elided[1]!.toLowerCase())) {
    word = elided[2]!;
  } else if (ARTICLES.has(word.toLowerCase()) && words.length > 1) {
    word = words[1]!;
  }

  return ([...word][0] ?? '').toLocaleUpperCase();
}

export type CoverMark = { kind: 'initial' | 'glyph'; text: string };

/** PLAN decision 4: one book in three wears a glyph, the rest an initial. */
export function coverMark(book: Pick<CoverSource, 'id' | 'title'>): CoverMark {
  const hash = hashCoverSeed(book.id);
  if (hash % 3 === 0) {
    return { kind: 'glyph', text: COVER_GLYPHS[hash % COVER_GLYPHS.length]! };
  }
  return { kind: 'initial', text: coverInitial(book.title) };
}
