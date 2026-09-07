/**
 * Lane C (planning/run9/cards/C-tts-integrity.md, output 3): what reaches
 * Kokoro. Written before `tts-text.ts` existed and run red first — the
 * whole point of the module is that the worker used to hand Kokoro whatever
 * the 2B model wrote, asterisks and emoji included.
 */
import { describe, expect, it } from 'vitest';
import { MAX_SPEECH_CHARS, prepareForSpeech } from '../src/browser-cascade/tts-text.ts';

describe('prepareForSpeech', () => {
  it('leaves ordinary prose alone', () => {
    const s = 'The dog was a big native husky, the proper wolf-dog.';
    expect(prepareForSpeech(s)).toEqual([s]);
  });

  it('drops a markdown bullet prefix', () => {
    expect(prepareForSpeech('- The dog is loyal.')).toEqual(['The dog is loyal.']);
    expect(prepareForSpeech('* The dog is loyal.')).toEqual(['The dog is loyal.']);
    expect(prepareForSpeech('1. The dog is loyal.')).toEqual(['The dog is loyal.']);
    expect(prepareForSpeech('> The dog is loyal.')).toEqual(['The dog is loyal.']);
  });

  it('drops heading hashes', () => {
    expect(prepareForSpeech('## The trail')).toEqual(['The trail']);
  });

  it('unwraps bold, italic, code and links instead of speaking their marks', () => {
    expect(prepareForSpeech('The **dog** is *loyal*.')).toEqual(['The dog is loyal.']);
    expect(prepareForSpeech('The __dog__ is _loyal_.')).toEqual(['The dog is loyal.']);
    expect(prepareForSpeech('Say `husky` aloud.')).toEqual(['Say husky aloud.']);
    expect(prepareForSpeech('See [the trail](https://x.test/a).')).toEqual([
      'See the trail.',
    ]);
  });

  it('keeps an apostrophe and an intra-word hyphen', () => {
    expect(prepareForSpeech("The wolf-dog didn't move.")).toEqual([
      "The wolf-dog didn't move.",
    ]);
  });

  it('removes emoji and other non-speech symbols', () => {
    expect(prepareForSpeech('The dog is loyal. 🐺🔥')).toEqual(['The dog is loyal.']);
  });

  it('normalizes curly quotes, dashes and ellipses to plain punctuation', () => {
    expect(prepareForSpeech('He said, “we go”.')).toEqual(['He said, "we go".']);
    expect(prepareForSpeech('It was loyal — but unhappy.')).toEqual([
      'It was loyal, but unhappy.',
    ]);
    expect(prepareForSpeech('It was loyal – but unhappy.')).toEqual([
      'It was loyal, but unhappy.',
    ]);
    expect(prepareForSpeech('Well… maybe.')).toEqual(['Well. maybe.']);
    expect(prepareForSpeech('It was cold‑‑very cold.')).toEqual(['It was cold, very cold.']);
  });

  it('expands degree, percent and ampersand into words', () => {
    expect(prepareForSpeech('It fell to 50°.')).toEqual(['It fell to 50 degrees.']);
    expect(prepareForSpeech('It fell to 1°.')).toEqual(['It fell to 1 degree.']);
    expect(prepareForSpeech('90% of them.')).toEqual(['90 percent of them.']);
    expect(prepareForSpeech('Men & dogs.')).toEqual(['Men and dogs.']);
  });

  it('returns no pieces at all when nothing speakable is left', () => {
    expect(prepareForSpeech('   ')).toEqual([]);
    expect(prepareForSpeech('**')).toEqual([]);
    expect(prepareForSpeech('🐺')).toEqual([]);
  });

  it('splits an over-long sentence at a comma, keeping every word', () => {
    const clause = 'the dog kept walking north along the frozen river';
    const repeats = Math.ceil(MAX_SPEECH_CHARS / clause.length) + 1;
    const long = `${Array.from({ length: repeats }, () => clause).join(', ')}.`;
    expect(long.length).toBeGreaterThan(MAX_SPEECH_CHARS);
    const pieces = prepareForSpeech(long);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(MAX_SPEECH_CHARS);
    expect(pieces.join(' ').replace(/[,.]/g, '').split(/\s+/)).toEqual(
      long.replace(/[,.]/g, '').split(/\s+/),
    );
  });

  it('falls back to a conjunction when there is no comma to split on', () => {
    const clause = 'the dog kept walking north along the frozen river';
    const repeats = Math.ceil(MAX_SPEECH_CHARS / clause.length) + 1;
    const long = `${Array.from({ length: repeats }, () => clause).join(' and ')}.`;
    const pieces = prepareForSpeech(long);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(MAX_SPEECH_CHARS);
  });

  it('hard-splits on a word boundary when there is neither comma nor conjunction', () => {
    const long = 'trail '.repeat(MAX_SPEECH_CHARS).trim() + '.';
    const pieces = prepareForSpeech(long);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(MAX_SPEECH_CHARS);
    expect(pieces.join(' ')).toBe(long);
  });
});
