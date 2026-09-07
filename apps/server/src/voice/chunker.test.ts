import { describe, expect, it } from 'vitest';
import { SentenceChunker } from './chunker.js';

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

  // R-adversarial finding 2 / run7 H2: the local path's transcript and TTS
  // both broke a sentence at every French title abbreviation, because "M."
  // matched the boundary regex. Live proof (audible-probe, 2026-09-06): the
  // tutor's opening line rendered as two bubbles, "Dans cette histoire, M."
  // and "Seguin a perdu six chèvres…", and "M." went to TTS as a chunk of
  // its own. `fr-chevre-de-m-seguin` says "M. Seguin" 14 times.
  it('does not split after a French title abbreviation', () => {
    const c = new SentenceChunker();
    expect(c.push('Dans cette histoire, M. Seguin a peur du loup. Ensuite')).toEqual([
      'Dans cette histoire, M. Seguin a peur du loup.',
    ]);
  });

  it('does not split after Mme, Mlle, Dr or St', () => {
    const c = new SentenceChunker();
    expect(c.push('Mme. Dupont et Dr. Petit sont à St. Malo. Voilà')).toEqual([
      'Mme. Dupont et Dr. Petit sont à St. Malo.',
    ]);
  });

  it('does not split after a single-letter initial', () => {
    const c = new SentenceChunker();
    expect(c.push('A. Daudet a écrit ce conte. Fin')).toEqual(['A. Daudet a écrit ce conte.']);
  });

  it('still splits when an abbreviation genuinely ends a sentence', () => {
    const c = new SentenceChunker();
    // "etc." followed by a capitalised new sentence is the ambiguous case;
    // a title abbreviation followed by end-of-stream must still flush.
    c.push('Il parle de M.');
    expect(c.flush()).toEqual(['Il parle de M.']);
  });

  it('flush() returns nothing when the buffer is empty', () => {
    const c = new SentenceChunker();
    c.push('Complet. ');
    expect(c.flush()).toEqual([]);
  });
});
