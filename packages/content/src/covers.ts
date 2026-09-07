/**
 * Deterministic cover SVG generator (planning/CONTRACTS.md §2b): seeded from
 * bookId, flat geometric composition, palette per category.
 *
 * Since the covers direction B ship (planning/design/COVERS-DIRECTIONS-SPEC
 * .md) the generator is the *fallback*, not the source of truth: a book with
 * hand-authored art under `packages/content/covers/<bookId>.svg` gets that
 * file copied into its pack instead, and `covers.json` names the ink the app
 * prints over the art's bottom band. `content:build` calls `writeCover` for
 * every book; `content:covers` regenerates the generated covers under packs/
 * and leaves the authored ones alone.
 */
import { copyFileSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { BookCategory, CoverInk } from '@sotto/core';
import { seededRandom } from './prng.ts';
import { CONTENT_ROOT, PACKS_DIR } from './paths.ts';

const W = 220;
const H = 330;

interface Palette {
  ground: string;
  shapes: [string, string];
}

// Nightjar and Saltpath are Noel's two chosen seed colorways
// (planning/DECISIONS.md PRE-2); the rest extrapolate the same flat
// two-shape-color-on-a-ground-color formula across the remaining
// categories. "daily" wasn't given an explicit hex in the brief beyond
// "teal" — picked a teal distinct from Nightjar's so the two don't collide.
const PALETTES: Record<BookCategory, Palette> = {
  tales: { ground: '#1F4F57', shapes: ['#F2C8B4', '#E8D6B8'] }, // Nightjar
  fables: { ground: '#E8D6B8', shapes: ['#221E1B', '#1F4F57'] }, // Saltpath
  classics: { ground: '#8C3B22', shapes: ['#E8D6B8', '#F2C8B4'] }, // rust
  adventure: { ground: '#5B8A6B', shapes: ['#E8D6B8', '#221E1B'] }, // sage
  folk: { ground: '#4A2C3A', shapes: ['#F2C8B4', '#E8D6B8'] }, // plum
  idioms: { ground: '#C98A2E', shapes: ['#221E1B', '#E8D6B8'] }, // ochre
  daily: { ground: '#2E6E77', shapes: ['#F2C8B4', '#E8D6B8'] }, // teal
};

type ShapeKind = 'sun' | 'mountain' | 'wave' | 'moon' | 'sail' | 'tree';
const SHAPE_KINDS: ShapeKind[] = ['sun', 'mountain', 'wave', 'moon', 'sail', 'tree'];

function shuffle<T>(rng: () => number, items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function drawSun(cx: number, cy: number, r: number, color: string): string {
  return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" />`;
}

function drawMountain(
  cx: number,
  baseY: number,
  width: number,
  height: number,
  color: string,
): string {
  const x1 = cx - width / 2;
  const x2 = cx + width / 2;
  return `<polygon points="${x1.toFixed(1)},${baseY.toFixed(1)} ${cx.toFixed(1)},${(baseY - height).toFixed(1)} ${x2.toFixed(1)},${baseY.toFixed(1)}" fill="${color}" />`;
}

function drawWave(y: number, amplitude: number, color: string): string {
  return `<path d="M0,${y.toFixed(1)} Q${(W * 0.25).toFixed(1)},${(y - amplitude).toFixed(1)} ${(W * 0.5).toFixed(1)},${y.toFixed(1)} T${W},${y.toFixed(1)} V${H} H0 Z" fill="${color}" />`;
}

function drawMoon(cx: number, cy: number, r: number, color: string, groundColor: string): string {
  const offsetX = r * 0.55;
  const offsetY = r * 0.2;
  return (
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" />` +
    `<circle cx="${(cx + offsetX).toFixed(1)}" cy="${(cy - offsetY).toFixed(1)}" r="${(r * 0.9).toFixed(1)}" fill="${groundColor}" />`
  );
}

function drawSail(cx: number, baseY: number, width: number, height: number, color: string): string {
  const x1 = cx - width / 2;
  return (
    `<polygon points="${x1.toFixed(1)},${baseY.toFixed(1)} ${x1.toFixed(1)},${(baseY - height).toFixed(1)} ${(cx + width / 2).toFixed(1)},${baseY.toFixed(1)}" fill="${color}" />` +
    `<rect x="${(cx - 1).toFixed(1)}" y="${baseY.toFixed(1)}" width="2" height="${(height * 0.12).toFixed(1)}" fill="${color}" />`
  );
}

function drawTree(cx: number, baseY: number, width: number, height: number, color: string): string {
  const trunkW = width * 0.16;
  const canopyH = height * 0.72;
  const canopy = `<polygon points="${(cx - width / 2).toFixed(1)},${baseY.toFixed(1)} ${cx.toFixed(1)},${(baseY - height).toFixed(1)} ${(cx + width / 2).toFixed(1)},${baseY.toFixed(1)}" fill="${color}" />`;
  const trunk = `<rect x="${(cx - trunkW / 2).toFixed(1)}" y="${(baseY - canopyH * 0.15).toFixed(1)}" width="${trunkW.toFixed(1)}" height="${(height * 0.15).toFixed(1)}" fill="${color}" />`;
  return trunk + canopy;
}

function drawShape(kind: ShapeKind, color: string, groundColor: string, rng: () => number): string {
  switch (kind) {
    case 'sun':
      return drawSun(50 + rng() * 120, 46 + rng() * 34, 16 + rng() * 14, color);
    case 'mountain':
      return drawMountain(
        60 + rng() * 100,
        168 + rng() * 20,
        70 + rng() * 40,
        55 + rng() * 40,
        color,
      );
    case 'wave':
      return drawWave(182 + rng() * 22, 7 + rng() * 6, color);
    case 'moon':
      return drawMoon(48 + rng() * 120, 46 + rng() * 34, 15 + rng() * 9, color, groundColor);
    case 'sail':
      return drawSail(60 + rng() * 100, 186 + rng() * 12, 26 + rng() * 18, 65 + rng() * 30, color);
    case 'tree':
      return drawTree(60 + rng() * 100, 196 + rng() * 12, 26 + rng() * 18, 75 + rng() * 30, color);
  }
}

function wrapTitle(title: string, maxCharsPerLine = 16, maxLines = 3): string[] {
  if (title.length <= maxCharsPerLine) return [title];
  const words = title.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  // Rare: still too long at 3 lines — merge the overflow into the last line
  // and truncate with an ellipsis rather than silently dropping words.
  const kept = lines.slice(0, maxLines - 1);
  const rest = lines.slice(maxLines - 1).join(' ');
  const truncated =
    rest.length > maxCharsPerLine ? `${rest.slice(0, maxCharsPerLine - 1).trimEnd()}…` : rest;
  kept.push(truncated);
  return kept;
}

/** Relative luminance (WCAG) of a #RRGGBB color. */
function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '');
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const r = channel(parseInt(c.slice(0, 2), 16) / 255);
  const g = channel(parseInt(c.slice(2, 4), 16) / 255);
  const b = channel(parseInt(c.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colors. */
function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// The only colors title/author text is ever painted in: ink for light
// bands, sand/peach for dark ones (DESIGN.md palette). Picked per-cover by
// whichever contrasts best against the actual band the text sits on.
const TITLE_COLOR_CANDIDATES = ['#221E1B', '#E8D6B8', '#F2C8B4'] as const;

function pickTitleColor(bandColor: string): string {
  return TITLE_COLOR_CANDIDATES.reduce((best, candidate) =>
    contrastRatio(candidate, bandColor) > contrastRatio(best, bandColor) ? candidate : best,
  );
}

export interface CoverInput {
  bookId: string;
  title: string;
  author: string;
  category: BookCategory;
}

export function generateCoverSvg(input: CoverInput): string {
  const rng = seededRandom(input.bookId);
  const palette = PALETTES[input.category] ?? PALETTES.tales;
  const shapeCount = 2 + Math.floor(rng() * 3); // 2-4 shapes
  const kinds = shuffle(rng, SHAPE_KINDS).slice(0, shapeCount);
  const shapesSvg = kinds
    .map((kind, i) => drawShape(kind, palette.shapes[i % 2] as string, palette.ground, rng))
    .join('\n  ');

  // The title sits at the bottom of the cover. `wave` is the only shape
  // that paints a full band under it (baseY down through H) — if one was
  // drawn, that's the color the text actually sits on; otherwise it's the
  // bare ground.
  const waveIndex = kinds.indexOf('wave');
  const bandColor = waveIndex !== -1 ? (palette.shapes[waveIndex % 2] as string) : palette.ground;
  const titleColor = pickTitleColor(bandColor);

  const titleLines = wrapTitle(input.title);
  const threeLines = titleLines.length >= 3;
  const titleFontSize = threeLines ? 15 : 18;
  const titleLineHeight = threeLines ? 19 : 22;
  const titleStartY = titleLines.length === 1 ? 258 : threeLines ? 228 : 246;
  const titleTextSvg = titleLines
    .map(
      (line, i) =>
        `<text x="${W / 2}" y="${titleStartY + i * titleLineHeight}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="300" font-size="${titleFontSize}" fill="${titleColor}">${escapeXml(line)}</text>`,
    )
    .join('\n  ');
  const authorY = titleStartY + titleLines.length * titleLineHeight + 4;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeXml(input.title)}">
  <rect width="${W}" height="${H}" fill="${palette.ground}" />
  ${shapesSvg}
  ${titleTextSvg}
  <text x="${W / 2}" y="${authorY}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="400" font-size="9" letter-spacing="2" fill="${titleColor}">${escapeXml(input.author.toUpperCase())}</text>
</svg>
`;
}

// ---- hand-authored art (direction B) --------------------------------------

/** Where the drawn covers live: one `<bookId>.svg` per book (art only, no
 * text) plus `covers.json` describing each. Data-driven — whatever is in
 * this folder is authored, nothing is listed in code. */
export const COVERS_DIR = path.join(CONTENT_ROOT, 'covers');

export interface AuthoredCoverEntry {
  ink: CoverInk;
  band?: string;
  motif?: string;
  why?: string;
  drawnBy?: string;
}

export type AuthoredCovers = Record<string, AuthoredCoverEntry>;

const authoredCache = new Map<string, AuthoredCovers>();

/** The `covers.json` manifest, or `{}` when there is none. Cached per dir —
 * `content:build` asks once per book. */
export function readAuthoredCovers(coversDir: string = COVERS_DIR): AuthoredCovers {
  const cached = authoredCache.get(coversDir);
  if (cached) return cached;
  const manifestPath = path.join(coversDir, 'covers.json');
  let parsed: AuthoredCovers = {};
  if (existsSync(manifestPath)) {
    try {
      parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as AuthoredCovers;
    } catch {
      console.warn(`sotto-content covers: ${manifestPath} is not valid JSON — ignoring it`);
    }
  }
  authoredCache.set(coversDir, parsed);
  return parsed;
}

/**
 * The authored SVG for a book, or `undefined` when it has none. `artBookId`
 * is the id the art is filed under, which is the *source* book for a derived
 * edition (zh-TW's `-hant` twin reuses its simplified original's cover).
 */
export function authoredCoverPath(
  artBookId: string,
  coversDir: string = COVERS_DIR,
): string | undefined {
  const file = path.join(coversDir, `${artBookId}.svg`);
  return existsSync(file) ? file : undefined;
}

/** The ink the app prints over an authored cover's band, or `undefined` when
 * the book has no authored art (so the generated cover, and the typographic
 * client fallback, still apply). */
export function authoredCoverInk(
  artBookId: string,
  coversDir: string = COVERS_DIR,
): CoverInk | undefined {
  if (!authoredCoverPath(artBookId, coversDir)) return undefined;
  const entry = readAuthoredCovers(coversDir)[artBookId];
  return entry?.ink ?? 'ink';
}

/**
 * Put a cover in a built book's directory. Authored art wins and is copied
 * every build (it is the source of truth, so it overwrites a cover generated
 * by an earlier run); otherwise the deterministic generator fills in, and
 * only when nothing is there yet.
 */
export function writeCover(
  dir: string,
  input: CoverInput,
  artBookId: string = input.bookId,
): 'authored' | 'generated' | 'kept' {
  const coverPath = path.join(dir, 'cover.svg');
  const authored = authoredCoverPath(artBookId);
  if (authored) {
    copyFileSync(authored, coverPath);
    return 'authored';
  }
  if (existsSync(coverPath)) return 'kept';
  writeFileSync(coverPath, generateCoverSvg(input), 'utf8');
  return 'generated';
}

/** `content:covers` — regenerate the *generated* cover.svg files under
 * packs/, leaving every hand-authored cover as drawn. */
export function runCoversCommand(): void {
  if (!existsSync(PACKS_DIR)) {
    console.log('sotto-content covers: packs/ does not exist yet, run `content:build` first');
    return;
  }
  let count = 0;
  let kept = 0;
  for (const locale of readdirSync(PACKS_DIR)) {
    const booksDir = path.join(PACKS_DIR, locale, 'books');
    if (!existsSync(booksDir)) continue;
    for (const bookId of readdirSync(booksDir)) {
      const bookJsonPath = path.join(booksDir, bookId, 'book.json');
      if (!existsSync(bookJsonPath)) continue;
      const book = JSON.parse(readFileSync(bookJsonPath, 'utf8')) as {
        title: string;
        author: string;
        categories: BookCategory[];
        sourceBookId?: string;
      };
      if (authoredCoverPath(book.sourceBookId ?? bookId)) {
        console.log(`sotto-content covers: ${locale}/${bookId} authored, kept`);
        kept += 1;
        continue;
      }
      const svg = generateCoverSvg({
        bookId,
        title: book.title,
        author: book.author,
        category: book.categories[0] ?? 'tales',
      });
      writeFileSync(path.join(booksDir, bookId, 'cover.svg'), svg, 'utf8');
      count += 1;
    }
  }
  console.log(
    `sotto-content covers: regenerated ${count} cover${count === 1 ? '' : 's'}, kept ${kept} authored`,
  );
}
