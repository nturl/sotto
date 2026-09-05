import { describe, expect, it } from 'vitest';
import type { Block, Sentence, Token } from '@sotto/core';
import {
  composedGlossLine,
  composedGlossUsedFallback,
  computeSpan,
  flattenBlockTokens,
  isSingleSentenceSpan,
  isWholeSentenceSpan,
  spanText,
} from './selection.ts';

function word(
  id: string,
  text: string,
  glosses?: Record<string, string>,
  spaceBefore = true,
): Token {
  return { id, text, normalized: text.toLowerCase(), isWord: true, spaceBefore, glosses };
}

function punct(id: string, text: string): Token {
  return { id, text, normalized: text, isWord: false, spaceBefore: false };
}

function sentence(
  id: string,
  tokens: Token[],
  translations: Record<string, string> = {},
): Sentence {
  return { id, text: tokens.map((t) => t.text).join(' '), translations, tokens };
}

const s1 = sentence(
  'b1.s1',
  [
    word('b1.s1.t1', 'Le', { en: 'the', fr: 'le' }, false),
    word('b1.s1.t2', 'chat', { en: 'cat', fr: 'chat' }),
    word('b1.s1.t3', 'dort', { en: 'sleeps' }),
    punct('b1.s1.t4', '.'),
  ],
  { en: 'The cat sleeps.', fr: 'Le chat dort.' },
);

const s2 = sentence(
  'b1.s2',
  [word('b1.s2.t1', 'Il', { en: 'he' }, false), word('b1.s2.t2', 'ronfle', { en: 'snores' })],
  { en: 'He snores.' },
);

const block: Block = { id: 'b1', sentences: [s1, s2] };

describe('flattenBlockTokens', () => {
  it('flattens every sentence in the block in reading order with a running index', () => {
    const flat = flattenBlockTokens(block);
    expect(flat.map((f) => f.token.id)).toEqual([
      'b1.s1.t1',
      'b1.s1.t2',
      'b1.s1.t3',
      'b1.s1.t4',
      'b1.s2.t1',
      'b1.s2.t2',
    ]);
    expect(flat.map((f) => f.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('computeSpan', () => {
  const flat = flattenBlockTokens(block);

  it('returns the tokens between anchor and focus inclusive, forward drag', () => {
    const span = computeSpan(flat, 'b1.s1.t2', 'b1.s1.t3');
    expect(span.map((f) => f.token.id)).toEqual(['b1.s1.t2', 'b1.s1.t3']);
  });

  it('handles a backward drag (focus before anchor) the same as forward', () => {
    const span = computeSpan(flat, 'b1.s1.t3', 'b1.s1.t2');
    expect(span.map((f) => f.token.id)).toEqual(['b1.s1.t2', 'b1.s1.t3']);
  });

  it('a single-token drag (anchor === focus) returns just that token', () => {
    const span = computeSpan(flat, 'b1.s1.t2', 'b1.s1.t2');
    expect(span.map((f) => f.token.id)).toEqual(['b1.s1.t2']);
  });

  it('can span across a sentence boundary within the block', () => {
    const span = computeSpan(flat, 'b1.s1.t3', 'b1.s2.t1');
    expect(span.map((f) => f.token.id)).toEqual(['b1.s1.t3', 'b1.s1.t4', 'b1.s2.t1']);
  });

  it('returns an empty array when either id is not found', () => {
    expect(computeSpan(flat, 'missing', 'b1.s1.t2')).toEqual([]);
  });
});

describe('isWholeSentenceSpan', () => {
  it('is true when the span covers exactly the sentence tokens start to end', () => {
    expect(isWholeSentenceSpan(s1, ['b1.s1.t1', 'b1.s1.t2', 'b1.s1.t3', 'b1.s1.t4'])).toBe(true);
  });

  it('is order-independent (set equality)', () => {
    expect(isWholeSentenceSpan(s1, ['b1.s1.t4', 'b1.s1.t1', 'b1.s1.t3', 'b1.s1.t2'])).toBe(true);
  });

  it('is false for a partial span', () => {
    expect(isWholeSentenceSpan(s1, ['b1.s1.t2', 'b1.s1.t3'])).toBe(false);
  });

  it('is false when the count matches but the tokens are wrong', () => {
    expect(isWholeSentenceSpan(s1, ['b1.s2.t1', 'b1.s2.t2', 'b1.s1.t1', 'b1.s1.t2'])).toBe(false);
  });

  it('is true for a drag that ends on the last WORD token, not the trailing punctuation', () => {
    // A drag can only start/end on a word (punctuation isn't a drag
    // target), so "the whole sentence" in practice means first-word to
    // last-word, never including a trailing "." — this must still count.
    expect(isWholeSentenceSpan(s1, ['b1.s1.t1', 'b1.s1.t2', 'b1.s1.t3'])).toBe(true);
  });
});

describe('isSingleSentenceSpan', () => {
  const flat = flattenBlockTokens(block);

  it('is true for a span within one sentence', () => {
    const span = computeSpan(flat, 'b1.s1.t2', 'b1.s1.t3');
    expect(isSingleSentenceSpan(span)).toBe(true);
  });

  it('is false for a span crossing a sentence boundary', () => {
    const span = computeSpan(flat, 'b1.s1.t3', 'b1.s2.t1');
    expect(isSingleSentenceSpan(span)).toBe(false);
  });

  it('is true for an empty span', () => {
    expect(isSingleSentenceSpan([])).toBe(true);
  });
});

describe('spanText', () => {
  const flat = flattenBlockTokens(block);

  it('renders a span back to text, respecting spaceBefore and skipping a leading space on the first token', () => {
    const span = computeSpan(flat, 'b1.s1.t2', 'b1.s1.t4');
    expect(spanText(span)).toBe('chat dort.');
  });

  it('renders the whole sentence identically to how it reads', () => {
    const span = computeSpan(flat, 'b1.s1.t1', 'b1.s1.t4');
    expect(spanText(span)).toBe('Le chat dort.');
  });
});

describe('composedGlossLine', () => {
  const flat = flattenBlockTokens(block);

  it('joins word-token glosses with " · " in the requested locale', () => {
    const span = computeSpan(flat, 'b1.s1.t1', 'b1.s1.t2');
    expect(composedGlossLine(span, 'fr')).toBe('le · chat');
  });

  it('falls back to English per-word when the locale gloss is missing', () => {
    const span = computeSpan(flat, 'b1.s1.t2', 'b1.s1.t3'); // "dort" has no fr gloss
    expect(composedGlossLine(span, 'fr')).toBe('chat · sleeps');
  });

  it('skips punctuation tokens', () => {
    const span = computeSpan(flat, 'b1.s1.t3', 'b1.s1.t4');
    expect(composedGlossLine(span, 'en')).toBe('sleeps');
  });

  it('returns undefined when nothing in the span has any gloss', () => {
    const noGlossToken = word('x.t1', 'foo', undefined, false);
    const span = [{ token: noGlossToken, sentence: s1, index: 0 }];
    expect(composedGlossLine(span, 'en')).toBeUndefined();
  });
});

describe('composedGlossUsedFallback', () => {
  const flat = flattenBlockTokens(block);

  it('is true when at least one word had to fall back to English', () => {
    const span = computeSpan(flat, 'b1.s1.t2', 'b1.s1.t3');
    expect(composedGlossUsedFallback(span, 'fr')).toBe(true);
  });

  it('is false when every word already had the requested locale', () => {
    const span = computeSpan(flat, 'b1.s1.t1', 'b1.s1.t2');
    expect(composedGlossUsedFallback(span, 'fr')).toBe(false);
  });
});
