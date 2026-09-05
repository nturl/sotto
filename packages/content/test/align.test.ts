import { describe, expect, it } from 'vitest';
import {
  alignWords,
  alignWordsLcs,
  interpolateTimings,
  mergeSubwordFragments,
  splitClitics,
  type WhisperWord,
} from '../src/align.ts';

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

describe('mergeSubwordFragments', () => {
  it('merges whisper.cpp BPE fragments back into whole words using the leading-space convention', () => {
    // "vieux meunier" as whisper.cpp actually returns it: sub-word pieces
    // with no leading space continuing the previous word.
    const raw: WhisperWord[] = [
      { word: ' vie', start: 1.35, end: 1.36 },
      { word: 'ux', start: 1.62, end: 1.66 },
      { word: ' me', start: 1.66, end: 1.78 },
      { word: 'un', start: 1.78, end: 1.9 },
      { word: 'ier', start: 1.9, end: 2.08 },
    ];
    const merged = mergeSubwordFragments(raw);
    expect(merged.map((w) => w.word)).toEqual(['vieux', 'meunier']);
    expect(merged[0]).toEqual({ word: 'vieux', start: 1.35, end: 1.66 });
    expect(merged[1]).toEqual({ word: 'meunier', start: 1.66, end: 2.08 });
  });

  it('leaves already-whole words untouched', () => {
    const raw: WhisperWord[] = [
      { word: ' Le', start: 0, end: 0.2 },
      { word: ' chat', start: 0.2, end: 0.5 },
    ];
    expect(mergeSubwordFragments(raw)).toEqual([
      { word: 'Le', start: 0, end: 0.2 },
      { word: 'chat', start: 0.2, end: 0.5 },
    ]);
  });
});

describe('splitClitics', () => {
  it('splits a recognized elision clitic off a merged whisper word', () => {
    const merged: WhisperWord[] = [{ word: "l'oiseau", start: 1.0, end: 1.5 }];
    const split = splitClitics(merged);
    expect(split.map((w) => w.word)).toEqual(["l'", 'oiseau']);
    expect(split[0]?.start).toBe(1.0);
    expect(split[1]?.end).toBe(1.5);
    expect(split[0]?.end).toBe(split[1]?.start);
  });

  it('treats a curly apostrophe the same as a straight one', () => {
    const merged: WhisperWord[] = [{ word: 's’assoit', start: 0, end: 1 }];
    expect(splitClitics(merged).map((w) => w.word)).toEqual(["s'", 'assoit']);
  });

  it('does not split a word whose pre-apostrophe part is not a known clitic', () => {
    const merged: WhisperWord[] = [{ word: "aujourd'hui", start: 0, end: 1 }];
    expect(splitClitics(merged).map((w) => w.word)).toEqual(["aujourd'hui"]);
  });

  it('leaves words with no apostrophe untouched', () => {
    const merged: WhisperWord[] = [{ word: 'chat', start: 0, end: 0.3 }];
    expect(splitClitics(merged)).toEqual(merged);
  });
});

describe('alignWords (full pipeline)', () => {
  it('matches a merged-token case: BPE fragments recombine to match a whole pack token', () => {
    const tokens = ['vieux', 'meunier'];
    const raw: WhisperWord[] = [
      { word: ' vie', start: 1.35, end: 1.36 },
      { word: 'ux', start: 1.62, end: 1.66 },
      { word: ' me', start: 1.66, end: 1.78 },
      { word: 'un', start: 1.78, end: 1.9 },
      { word: 'ier', start: 1.9, end: 2.08 },
    ];
    const { matches, stats } = alignWords(tokens, raw);
    expect(matches[0]).toEqual({ start: 1.35, end: 1.66 });
    expect(matches[1]).toEqual({ start: 1.66, end: 2.08 });
    expect(stats).toEqual({ matched: 2, total: 2, method: expect.any(String) });
  });

  it('matches an elision case: pack keeps "l\'" and "oiseau" as separate tokens', () => {
    const tokens = ["l'", 'oiseau'];
    const raw: WhisperWord[] = [{ word: " l'oiseau", start: 2.0, end: 2.6 }];
    const { matches, stats } = alignWords(tokens, raw);
    expect(matches[0]).toBeDefined();
    expect(matches[1]).toBeDefined();
    expect(matches[0]?.end).toBe(matches[1]?.start);
    expect(stats.matched).toBe(2);
  });

  it('fuzzy-fills a genuine ASR substitution within Levenshtein tolerance', () => {
    const tokens = ['ces', 'chats'];
    const raw: WhisperWord[] = [
      { word: ' ses', start: 0, end: 0.3 }, // misheard "ces" as "ses"
      { word: ' chats', start: 0.3, end: 0.7 },
    ];
    const { matches, stats } = alignWords(tokens, raw);
    expect(matches[0]).toEqual({ start: 0, end: 0.3 });
    expect(matches[1]).toEqual({ start: 0.3, end: 0.7 });
    expect(stats.matched).toBe(2);
  });

  it('does not fuzzy-match words that are too different', () => {
    const tokens = ['chat', 'chien'];
    const raw: WhisperWord[] = [
      { word: ' chat', start: 0, end: 0.3 },
      { word: ' souris', start: 0.3, end: 0.6 }, // wholly different word, not a near-miss
    ];
    const { matches, stats } = alignWords(tokens, raw);
    expect(matches[0]).toEqual({ start: 0, end: 0.3 });
    expect(matches[1]).toBeUndefined();
    expect(stats.matched).toBe(1);
  });

  it('drops punctuation-only whisper words rather than let them consume a slot', () => {
    const tokens = ['Bonjour', 'monde'];
    const raw: WhisperWord[] = [
      { word: ' «', start: 0, end: 0.05 },
      { word: ' Bonjour', start: 0.05, end: 0.4 },
      { word: ' monde', start: 0.4, end: 0.8 },
      { word: ' »', start: 0.8, end: 0.85 },
    ];
    const { matches, stats } = alignWords(tokens, raw);
    expect(matches[0]).toEqual({ start: 0.05, end: 0.4 });
    expect(matches[1]).toEqual({ start: 0.4, end: 0.8 });
    expect(stats.matched).toBe(2);
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
