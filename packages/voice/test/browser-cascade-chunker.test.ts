/**
 * Port of apps/server/src/voice/chunker.test.ts for the browser worker's
 * copy (planning/BROWSER-TUTOR.md, Slice 2 checklist #2) — same behaviour,
 * same test cases, so the two pipelines provably chunk speech the same way.
 */
import { describe, expect, it } from 'vitest';
import { SentenceChunker } from '../src/browser-cascade/chunker.ts';

describe('SentenceChunker', () => {
  it('emits nothing until a sentence boundary is seen', () => {
    const c = new SentenceChunker();
    expect(c.push('Bonjour')).toEqual([]);
    expect(c.push(' le petit')).toEqual([]);
  });

  it('emits a complete sentence as soon as punctuation + whitespace arrives', () => {
    const c = new SentenceChunker();
    expect(c.push('Bonjour.')).toEqual([]); // no trailing whitespace yet
    expect(c.push(' Comment')).toEqual(['Bonjour.']);
  });

  it('handles multiple sentences arriving in one delta', () => {
    const c = new SentenceChunker();
    expect(c.push('Un. Deux. Trois')).toEqual(['Un.', 'Deux.']);
  });

  it('splits on newlines', () => {
    const c = new SentenceChunker();
    expect(c.push('Ligne un\nLigne deux')).toEqual(['Ligne un']);
  });

  it('flush() returns any trailing partial sentence and clears state', () => {
    const c = new SentenceChunker();
    c.push('Fin sans ponctuation');
    expect(c.flush()).toEqual(['Fin sans ponctuation']);
    expect(c.flush()).toEqual([]);
  });

  it('flush() returns nothing when the buffer is empty', () => {
    const c = new SentenceChunker();
    c.push('Complet. ');
    expect(c.flush()).toEqual([]);
  });
});
