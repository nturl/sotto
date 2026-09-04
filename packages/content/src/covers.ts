/**
 * Deterministic cover SVG generator (planning/CONTRACTS.md §2b): seeded from
 * bookId, flat geometric composition, palette per category. `content:build`
 * calls `generateCoverSvg` whenever a book's cover.svg is missing;
 * `content:covers` regenerates every cover in packs/ on demand.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { BookCategory } from '@sotto/core';
import { seededRandom } from './prng.ts';
import { PACKS_DIR } from './paths.ts';

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

function wrapTitle(title: string, maxCharsPerLine = 16): string[] {
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
  return lines.slice(0, 2);
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

  const titleLines = wrapTitle(input.title);
  const titleStartY = titleLines.length > 1 ? 246 : 258;
  const titleTextSvg = titleLines
    .map(
      (line, i) =>
        `<text x="${W / 2}" y="${titleStartY + i * 22}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="300" font-size="18" fill="${palette.shapes[1]}">${escapeXml(line)}</text>`,
    )
    .join('\n  ');
  const authorY = titleStartY + titleLines.length * 22 + 4;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeXml(input.title)}">
  <rect width="${W}" height="${H}" fill="${palette.ground}" />
  ${shapesSvg}
  ${titleTextSvg}
  <text x="${W / 2}" y="${authorY}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="400" font-size="9" letter-spacing="2" fill="${palette.shapes[1]}">${escapeXml(input.author.toUpperCase())}</text>
</svg>
`;
}

export function writeCoverIfMissing(dir: string, input: CoverInput): boolean {
  const coverPath = path.join(dir, 'cover.svg');
  if (existsSync(coverPath)) return false;
  writeFileSync(coverPath, generateCoverSvg(input), 'utf8');
  return true;
}

/** `content:covers` — regenerate every cover.svg already present under packs/. */
export function runCoversCommand(): void {
  if (!existsSync(PACKS_DIR)) {
    console.log('sotto-content covers: packs/ does not exist yet, run `content:build` first');
    return;
  }
  let count = 0;
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
      };
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
  console.log(`sotto-content covers: regenerated ${count} cover${count === 1 ? '' : 's'}`);
}
