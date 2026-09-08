/**
 * The scorer's own unit test. discuss-quality.mjs turns a PASS/FAIL on
 * WER <= 0.35 into the run's headline verdict, so the arithmetic behind it
 * has to be checked somewhere that does not need a browser or a 1.2 GB
 * download. (The second half of the card's proof — that Whisper-in-Node
 * scores a KNOWN-GOOD `say` recording at WER <= 0.2 — is a self-test step
 * inside discuss-quality.mjs itself, since it needs the model.)
 */
import { describe, expect, it } from 'vitest';
import { editDistance, normalizeForWer, tokenize, wordErrorRate } from './wer.mjs';

describe('normalizeForWer', () => {
  it('folds case, punctuation and accents', () => {
    expect(normalizeForWer('The Gray Husky, dog!')).toBe('the gray husky dog');
    expect(normalizeForWer('  Él   corrió.  ')).toBe('el corrio');
  });

  it('keeps apostrophes inside contractions', () => {
    expect(normalizeForWer("It's the dog's trail.")).toBe("it's the dog's trail");
  });

  it('spells whole numbers so "50" and "fifty" are the same token', () => {
    // Orthography, not audio: Kokoro says "fifty below zero" either way.
    expect(normalizeForWer('It is 50 below zero.')).toBe('it is fifty below zero');
    expect(normalizeForWer('It is fifty below zero.')).toBe('it is fifty below zero');
    expect(normalizeForWer('25 dogs')).toBe('twenty five dogs');
    expect(normalizeForWer('twenty-five dogs')).toBe('twenty five dogs');
    expect(normalizeForWer('chapter 3')).toBe('chapter three');
    expect(normalizeForWer('107 miles')).toBe('one hundred seven miles');
  });

  it('leaves numbers past 999 as digits rather than guessing a reading', () => {
    expect(normalizeForWer('the year 1903')).toBe('the year 1903');
  });

  it('scores a numeral against its spelled form as no error at all', () => {
    expect(wordErrorRate('It is 50 below zero.', 'it is fifty below zero').wer).toBe(0);
  });

  it('returns an empty string for punctuation-only input', () => {
    expect(normalizeForWer('… -- ?!')).toBe('');
    expect(tokenize('… -- ?!')).toEqual([]);
  });
});

describe('editDistance', () => {
  it('is zero for identical token arrays', () => {
    expect(editDistance(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
  });

  it('counts substitutions, insertions and deletions alike', () => {
    expect(editDistance(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1); // substitution
    expect(editDistance(['a', 'b'], ['a', 'b', 'c'])).toBe(1); // insertion
    expect(editDistance(['a', 'b', 'c'], ['a', 'c'])).toBe(1); // deletion
  });

  it('handles empty sides', () => {
    expect(editDistance([], ['a', 'b'])).toBe(2);
    expect(editDistance(['a', 'b'], [])).toBe(2);
    expect(editDistance([], [])).toBe(0);
  });
});

describe('wordErrorRate', () => {
  it('scores a perfect transcription at 0', () => {
    const { wer, distance, refWords } = wordErrorRate(
      'The dog is unhappy but loyal.',
      'the dog is unhappy but loyal',
    );
    expect(wer).toBe(0);
    expect(distance).toBe(0);
    expect(refWords).toBe(6);
  });

  it('divides errors by the REFERENCE length, not the hypothesis length', () => {
    // 6-word reference, one word misheard.
    const { wer } = wordErrorRate('the dog is unhappy but loyal', 'the dog is unhappy but royal');
    expect(wer).toBeCloseTo(1 / 6, 10);
  });

  it('scores gibberish against a real caption above the 0.35 gate', () => {
    const { wer } = wordErrorRate('The dog is unhappy but loyal.', 'zh zh brr ka ka ka tss brr');
    expect(wer).toBeGreaterThan(0.35);
  });

  it('scores a near-miss transcription below the 0.35 gate', () => {
    // 12-word reference, 3 word errors = 0.25.
    const { wer } = wordErrorRate(
      'the man walks along a frozen trail and the dog follows him',
      'the man walked along a frozen trail and a dog follows him',
    );
    expect(wer).toBeLessThanOrEqual(0.35);
  });

  it('treats silence (no words heard) as a total miss', () => {
    expect(wordErrorRate('the dog is loyal', '').wer).toBe(1);
  });

  it('is 0 when both sides are empty, 1 when only the reference is', () => {
    expect(wordErrorRate('', '').wer).toBe(0);
    expect(wordErrorRate('', 'something').wer).toBe(1);
  });
});
