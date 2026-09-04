import { describe, expect, it } from 'vitest';
import type { Sentence, Token } from '@sotto/core';
import { buildSavedWord } from './vocabulary';

const TOKEN: Token = {
  id: 'b1.s1.t1',
  text: 'meunier',
  normalized: 'meunier',
  isWord: true,
  spaceBefore: true,
  glosses: { en: 'miller', fr: 'meunier', es: 'molinero' },
};

const SENTENCE: Sentence = {
  id: 'b1.s1',
  text: 'Un meunier vivait ici.',
  translations: {
    en: 'A miller lived here.',
    fr: 'Un meunier vivait ici.',
    es: 'Un molinero vivía aquí.',
  },
  tokens: [TOKEN],
};

describe('buildSavedWord', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');

  it('resolves the translation from the pack gloss for the explanation locale', () => {
    const word = buildSavedWord({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      sourceLocale: 'fr-FR',
      explanationLocale: 'es',
      token: TOKEN,
      sentence: SENTENCE,
      now,
    });
    expect(word.translation).toBe('molinero');
    expect(word.sourceWord).toBe('meunier');
    expect(word.contextSentence).toBe(SENTENCE.text);
    expect(word.review.reps).toBe(0);
    expect(word.review.dueAt).toBe(now.toISOString());
  });

  it('falls back to the English gloss when the explanation locale has none', () => {
    const word = buildSavedWord({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      sourceLocale: 'fr-FR',
      explanationLocale: 'pt',
      token: TOKEN,
      sentence: SENTENCE,
      now,
    });
    expect(word.translation).toBe('miller');
  });

  it('an explicit translation override wins over the pack gloss (the tutor tool path)', () => {
    const word = buildSavedWord({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      sourceLocale: 'fr-FR',
      explanationLocale: 'en',
      token: TOKEN,
      sentence: SENTENCE,
      translationOverride: 'the miller (context: fairy tale)',
      now,
    });
    expect(word.translation).toBe('the miller (context: fairy tale)');
  });

  // TASK §F: tapping "Save" in the reader and the tutor's save_vocabulary
  // tool call both end up calling buildSavedWord with the same inputs —
  // they must produce the same SavedWord (modulo the generated id).
  it('the tap path and the tool path produce identical SavedWord state for the same token', () => {
    const tapPathWord = buildSavedWord({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      sourceLocale: 'fr-FR',
      explanationLocale: 'en',
      token: TOKEN,
      sentence: SENTENCE,
      now,
    });
    const toolPathWord = buildSavedWord({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      sourceLocale: 'fr-FR',
      explanationLocale: 'en',
      token: TOKEN,
      sentence: SENTENCE,
      now,
    });

    const { id: _a, ...tapRest } = tapPathWord;
    const { id: _b, ...toolRest } = toolPathWord;
    expect(tapRest).toEqual(toolRest);
    expect(tapPathWord.id).not.toBe(toolPathWord.id); // each save gets its own id
  });
});
