import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  authoredCoverInk,
  authoredCoverPath,
  readAuthoredCovers,
  writeCover,
  COVERS_DIR,
} from '../src/covers.ts';

function tempCoversDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sotto-covers-'));
  writeFileSync(path.join(dir, 'en-drawn.svg'), '<svg><!-- art --></svg>', 'utf8');
  writeFileSync(
    path.join(dir, 'covers.json'),
    JSON.stringify({ 'en-drawn': { ink: 'canvas', band: '#221E1B' } }),
    'utf8',
  );
  return dir;
}

describe('authored covers', () => {
  it('finds the drawn svg for a book that has one', () => {
    const dir = tempCoversDir();
    expect(authoredCoverPath('en-drawn', dir)).toBe(path.join(dir, 'en-drawn.svg'));
    expect(authoredCoverPath('en-not-drawn', dir)).toBeUndefined();
  });

  it('reads the ink from covers.json, and nothing for an undrawn book', () => {
    const dir = tempCoversDir();
    expect(authoredCoverInk('en-drawn', dir)).toBe('canvas');
    expect(authoredCoverInk('en-not-drawn', dir)).toBeUndefined();
  });

  it('defaults an entry-less drawn cover to ink rather than failing', () => {
    const dir = tempCoversDir();
    writeFileSync(path.join(dir, 'en-unlisted.svg'), '<svg/>', 'utf8');
    expect(authoredCoverInk('en-unlisted', dir)).toBe('ink');
  });

  it('parses the real covers.json manifest', () => {
    for (const [bookId, entry] of Object.entries(readAuthoredCovers())) {
      expect(['ink', 'canvas']).toContain(entry.ink);
      expect(authoredCoverPath(bookId, COVERS_DIR)).toBeDefined();
    }
  });
});

describe('writeCover', () => {
  const input = {
    bookId: 'en-generated',
    title: 'A Fable',
    author: 'Aesop',
    category: 'fables' as const,
  };

  it('generates a cover for a book with no authored art, then keeps it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sotto-book-'));
    expect(writeCover(dir, input)).toBe('generated');
    expect(writeCover(dir, input)).toBe('kept');
    expect(readFileSync(path.join(dir, 'cover.svg'), 'utf8')).toContain('viewBox="0 0 220 330"');
  });

  it('copies the authored art over an already-generated cover', () => {
    // Uses a real authored book so the test tracks the shipped covers/ dir.
    const [artBookId] = Object.keys(readAuthoredCovers());
    expect(artBookId).toBeTruthy();
    const dir = mkdtempSync(path.join(tmpdir(), 'sotto-book-'));
    mkdirSync(dir, { recursive: true });
    writeCover(dir, input);
    expect(writeCover(dir, input, artBookId)).toBe('authored');
    expect(readFileSync(path.join(dir, 'cover.svg'), 'utf8')).toBe(
      readFileSync(path.join(COVERS_DIR, `${artBookId}.svg`), 'utf8'),
    );
  });
});
