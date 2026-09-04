import { describe, expect, it } from 'vitest';
import { alignWordsLcs, interpolateTimings, type WhisperWord } from '../src/align.ts';

describe('alignWordsLcs', () => {
  it('matches an exact word-for-word transcript', () => {
    const tokens = ['Bonjour', 'le', 'monde'];
    const whisper: WhisperWord[] = [
      { word: ' Bonjour', start: 0, end: 0.4 },
      { word: ' le', start: 0.4, end: 0.5 },
      { word: ' monde', start: 0.5, end: 0.9 },
    ];
    const matches = alignWordsLcs(tokens, whisper);
    expect(matches.map((m) => (m ? [m.start, m.end] : undefined))).toEqual([
      [0, 0.4],
      [0.4, 0.5],
      [0.5, 0.9],
    ]);
  });

  it('is case- and diacritic-insensitive and ignores punctuation on the whisper side', () => {
    const tokens = ['café'];
    const whisper: WhisperWord[] = [{ word: ' Cafe!', start: 0, end: 0.5 }];
    const matches = alignWordsLcs(tokens, whisper);
    expect(matches[0]).toEqual({ start: 0, end: 0.5 });
  });

  it('leaves a token unmatched when whisper drops a word', () => {
    const tokens = ['Le', 'petit', 'chat'];
    const whisper: WhisperWord[] = [
      { word: ' Le', start: 0, end: 0.2 },
      { word: ' chat', start: 0.5, end: 0.8 }, // "petit" was mis-heard/dropped
    ];
    const matches = alignWordsLcs(tokens, whisper);
    expect(matches[0]).toEqual({ start: 0, end: 0.2 });
    expect(matches[1]).toBeUndefined();
    expect(matches[2]).toEqual({ start: 0.5, end: 0.8 });
  });

  it('does not match an empty-after-stripping token to anything', () => {
    const tokens = ['-', 'chat'];
    const whisper: WhisperWord[] = [{ word: ' chat', start: 0, end: 0.3 }];
    const matches = alignWordsLcs(tokens, whisper);
    expect(matches[0]).toBeUndefined();
    expect(matches[1]).toEqual({ start: 0, end: 0.3 });
  });
});

describe('interpolateTimings', () => {
  it('passes matched spans through unchanged', () => {
    const spans = interpolateTimings(
      [
        { start: 0, end: 0.4 },
        { start: 0.4, end: 0.9 },
      ],
      0.9,
    );
    expect(spans).toEqual([
      { start: 0, end: 0.4 },
      { start: 0.4, end: 0.9 },
    ]);
  });

  it('interpolates a single unmatched token between its matched neighbours', () => {
    const spans = interpolateTimings(
      [{ start: 0, end: 0.2 }, undefined, { start: 0.6, end: 0.8 }],
      0.8,
    );
    expect(spans[1]).toEqual({ start: 0.2, end: 0.6 });
  });

  it('splits a run of consecutive unmatched tokens evenly across the gap', () => {
    const spans = interpolateTimings(
      [{ start: 0, end: 0.2 }, undefined, undefined, { start: 0.8, end: 1.0 }],
      1.0,
    );
    // gap is 0.2 -> 0.8 (0.6s) split across 2 unmatched tokens -> 0.3s each
    expect(spans[1]).toEqual({ start: 0.2, end: 0.5 });
    expect(spans[2]).toEqual({ start: 0.5, end: 0.8 });
  });

  it('uses 0 and the sentence duration as bounds when the run touches an edge', () => {
    const spans = interpolateTimings([undefined, { start: 0.5, end: 0.7 }, undefined], 1.0);
    expect(spans[0]).toEqual({ start: 0, end: 0.5 });
    expect(spans[2]).toEqual({ start: 0.7, end: 1.0 });
  });

  it('falls back to a zero-width span when nothing at all matched', () => {
    const spans = interpolateTimings([undefined, undefined], 1.0);
    expect(spans[0]).toEqual({ start: 0, end: 0.5 });
    expect(spans[1]).toEqual({ start: 0.5, end: 1.0 });
  });
});
