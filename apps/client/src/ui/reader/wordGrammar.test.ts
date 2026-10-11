import { describe, expect, it } from 'vitest';
import type { Token } from '@sotto/core';
import { SPAN_BREAKDOWN_CAP, grammarFor, spanBreakdown, wordForm } from './wordGrammar';

const tok = (text: string, extra: Partial<Token> = {}): Token => ({
  id: `t-${text}`,
  text,
  normalized: text.toLowerCase(),
  isWord: true,
  spaceBefore: true,
  ...extra,
});

describe('grammarFor', () => {
  it('prefers the explanation locale, then English', () => {
    const t = tok('levé', { grammar: { en: 'verb', fr: 'verbe' } });
    expect(grammarFor(t, 'fr')).toBe('verbe');
    expect(grammarFor(t, 'es')).toBe('verb');
  });
  it('is undefined when absent', () => {
    expect(grammarFor(tok('chat'), 'en')).toBeUndefined();
  });
});

describe('wordForm', () => {
  it('returns undefined when neither field is present', () => {
    expect(wordForm(tok('chat'), 'en')).toBeUndefined();
  });
  it('drops a lemma equal to the word (case-insensitive)', () => {
    expect(wordForm(tok('Chat', { lemma: 'chat' }), 'en')).toBeUndefined();
    expect(wordForm(tok('Chat', { lemma: 'chat', grammar: { en: 'noun' } }), 'en')).toEqual({
      grammar: 'noun',
    });
  });
  it('keeps a differing lemma with grammar', () => {
    expect(
      wordForm(tok('levé', { lemma: 'se lever', grammar: { en: 'verb, past participle' } }), 'en'),
    ).toEqual({ lemma: 'se lever', grammar: 'verb, past participle' });
  });
  it('skips punctuation tokens', () => {
    expect(wordForm(tok(',', { isWord: false, grammar: { en: 'punct' } }), 'en')).toBeUndefined();
  });
});

describe('spanBreakdown', () => {
  it('is empty when no word carries data', () => {
    expect(spanBreakdown([tok('le'), tok('chat')], 'en')).toEqual([]);
  });
  it('lists word tokens only, skipping punctuation', () => {
    const rows = spanBreakdown(
      [tok('il'), tok(',', { isWord: false }), tok('est', { lemma: 'être' })],
      'en',
    );
    expect(rows.map((r) => r.word)).toEqual(['il', 'est']);
    expect(rows[1]).toMatchObject({ lemma: 'être' });
    expect(rows[0]!.lemma).toBeUndefined();
  });
  it('caps the list', () => {
    const many = Array.from({ length: 10 }, (_, i) => tok(`w${i}`, { grammar: { en: 'noun' } }));
    expect(spanBreakdown(many, 'en')).toHaveLength(SPAN_BREAKDOWN_CAP);
  });
});
