import { describe, expect, it } from 'vitest';
import type { Chapter } from '@sotto/core';
import {
  buildTranscriptSavedWord,
  segmentTranscriptWords,
  syntheticTranscriptTokenId,
  type TranscriptWordSegment,
} from './transcriptVocabulary';

const NOW = new Date('2026-09-09T18:00:00.000Z');

const CHAPTER: Chapter = {
  id: 'es-fabulas-01',
  bookId: 'es-fabulas',
  title: 'La cigarra',
  order: 1,
  blocks: [
    {
      id: 'b1',
      sentences: [
        {
          id: 'b1.s1',
          text: 'La cigarra canta.',
          translations: { en: 'The cicada sings.' },
          tokens: [
            { id: 'b1.s1.t1', text: 'La', normalized: 'la', isWord: true, spaceBefore: false },
            {
              id: 'b1.s1.t2',
              text: 'cigarra',
              normalized: 'cigarra',
              isWord: true,
              spaceBefore: true,
              glosses: { en: 'cicada' },
            },
            { id: 'b1.s1.t3', text: 'canta', normalized: 'canta', isWord: true, spaceBefore: true },
            { id: 'b1.s1.t4', text: '.', normalized: '.', isWord: false, spaceBefore: false },
          ],
        },
      ],
    },
  ],
};

const FRENCH_CHAPTER: Chapter = {
  id: 'fr-chat-01',
  bookId: 'fr-chat',
  title: 'Le chat',
  order: 1,
  blocks: [
    {
      id: 'b1',
      sentences: [
        {
          id: 'b1.s1',
          text: "L'enfant aime le café.",
          translations: { en: 'The child likes coffee.' },
          tokens: [
            {
              id: 'b1.s1.t1',
              text: "L'",
              normalized: "l'",
              isWord: true,
              spaceBefore: false,
              glosses: { en: 'the' },
            },
            {
              id: 'b1.s1.t2',
              text: 'enfant',
              normalized: 'enfant',
              isWord: true,
              spaceBefore: false,
              glosses: { en: 'child' },
            },
            {
              id: 'b1.s1.t3',
              text: 'café',
              normalized: 'café',
              isWord: true,
              spaceBefore: true,
              glosses: { en: 'coffee' },
            },
          ],
        },
      ],
    },
  ],
};

function selected(caption: string, locale: string, text: string): TranscriptWordSegment {
  const segment = segmentTranscriptWords(caption, locale).find(
    (entry): entry is TranscriptWordSegment => entry.isWord && entry.text === text,
  );
  if (!segment) throw new Error(`Missing selectable ${text} in ${caption}`);
  return segment;
}

function params(selection: TranscriptWordSegment, meaning?: string) {
  return {
    selection,
    chapter: CHAPTER,
    bookId: CHAPTER.bookId,
    chapterId: CHAPTER.id,
    sourceLocale: 'es-419',
    explanationLocale: 'en',
    meaning,
    now: NOW,
  };
}

describe('segmentTranscriptWords', () => {
  it('keeps every Latin whitespace and punctuation span while exposing exact selectable words', () => {
    const caption = '  L’enfant, déjà?  ';
    const segments = segmentTranscriptWords(caption, 'fr-FR');

    expect(segments.map((segment) => segment.text).join('')).toBe(caption);
    expect(segments.filter((segment) => segment.isWord).map((segment) => segment.text)).toEqual([
      'L’',
      'enfant',
      'déjà',
    ]);
    expect(
      segments.filter((segment) => segment.isWord).map((segment) => segment.normalized),
    ).toEqual(["l'", 'enfant', 'déjà']);
    expect(segments.find((segment) => segment.text === ',')?.isWord).toBe(false);
    for (const segment of segments) {
      expect(caption.slice(segment.start, segment.end)).toBe(segment.text);
    }
    for (const segment of segments.filter((entry) => entry.isWord)) {
      expect(segment.contextSentence).toBe('L’enfant, déjà?');
    }
  });

  it('uses CJK word segmentation while preserving punctuation and source order', () => {
    const caption = '你好，世界！';
    const segments = segmentTranscriptWords(caption, 'zh-CN');

    expect(segments.map((segment) => segment.text).join('')).toBe(caption);
    expect(segments.filter((segment) => segment.isWord).map((segment) => segment.text)).toEqual([
      '你好',
      '世界',
    ]);
    expect(segments.filter((segment) => !segment.isWord).map((segment) => segment.text)).toEqual([
      '，',
      '！',
    ]);
  });

  it("keeps a selected word's own sentence as context instead of a whole multi-sentence caption", () => {
    const word = selected('Bonjour. Le mot reste ici.', 'fr-FR', 'mot');

    expect(word.contextSentence).toBe('Le mot reste ici.');
  });

  it('keeps mixed Latin words selectable when the CJK Segmenter fallback is used', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
    try {
      const caption = '你好, cafe\u0301!';
      const segments = segmentTranscriptWords(caption, 'zh-CN');

      expect(segments.map((segment) => segment.text).join('')).toBe(caption);
      expect(segments.filter((segment) => segment.isWord).map((segment) => segment.text)).toEqual([
        '你',
        '好',
        'cafe\u0301',
      ]);
      expect(segments.find((segment) => segment.text === ',')?.isWord).toBe(false);
      expect(segments.find((segment) => segment.text === '!')?.isWord).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
      else Reflect.deleteProperty(Intl, 'Segmenter');
    }
  });
});

describe('buildTranscriptSavedWord', () => {
  it('reuses the exact chapter token, gloss, sentence, and initial review for a matched word', () => {
    const result = buildTranscriptSavedWord(params(selected('¿Cigarra?', 'es-419', 'Cigarra')));

    expect(result).toMatchObject({
      kind: 'ready',
      matchedChapterToken: true,
      suggestedMeaning: 'cicada',
      word: {
        bookId: 'es-fabulas',
        chapterId: 'es-fabulas-01',
        tokenId: 'b1.s1.t2',
        sentenceId: 'b1.s1',
        sourceWord: 'cigarra',
        normalizedWord: 'cigarra',
        translation: 'cicada',
        contextSentence: 'La cigarra canta.',
        review: { ease: 2.5, intervalDays: 0, dueAt: NOW.toISOString(), reps: 0, lapses: 0 },
      },
    });
  });

  it('does not guess an adjacent chapter token when the transcript word is absent', () => {
    const selection = selected('Un dragón aparece.', 'es-419', 'dragón');
    const required = buildTranscriptSavedWord(params(selection));

    expect(required).toEqual({
      kind: 'meaning-required',
      selection,
      matchedChapterToken: false,
      tokenId: syntheticTranscriptTokenId('es-419', 'dragón'),
    });

    const saved = buildTranscriptSavedWord(params(selection, 'dragon'));
    expect(saved).toMatchObject({
      kind: 'ready',
      matchedChapterToken: false,
      word: {
        tokenId: syntheticTranscriptTokenId('es-419', 'dragón'),
        sentenceId: `${syntheticTranscriptTokenId('es-419', 'dragón')}:sentence`,
        sourceWord: 'dragón',
        normalizedWord: 'dragón',
        translation: 'dragon',
        contextSentence: 'Un dragón aparece.',
        review: { ease: 2.5, intervalDays: 0, dueAt: NOW.toISOString(), reps: 0, lapses: 0 },
      },
    });
  });

  it('uses the same synthetic token across captions so existing store dedupe keeps one review item', () => {
    const first = buildTranscriptSavedWord(
      params(selected('Veo un dragón.', 'es-419', 'dragón'), 'dragon'),
    );
    const second = buildTranscriptSavedWord(
      params(selected('¿Dragón?', 'es-419', 'Dragón'), 'dragon'),
    );

    expect(first).toMatchObject({ kind: 'ready', matchedChapterToken: false });
    expect(second).toMatchObject({ kind: 'ready', matchedChapterToken: false });
    if (first.kind !== 'ready' || second.kind !== 'ready') throw new Error('Expected saved words.');
    expect(second.word.tokenId).toBe(first.word.tokenId);
    expect(second.word.contextSentence).toBe('¿Dragón?');
  });

  it('requires a meaning for a real chapter word that has no usable gloss', () => {
    const selection = selected('¿Canta?', 'es-419', 'Canta');
    const required = buildTranscriptSavedWord(params(selection));

    expect(required).toMatchObject({
      kind: 'meaning-required',
      matchedChapterToken: true,
      tokenId: 'b1.s1.t3',
    });
    expect(buildTranscriptSavedWord(params(selection, 'sings'))).toMatchObject({
      kind: 'ready',
      matchedChapterToken: true,
      word: { tokenId: 'b1.s1.t3', translation: 'sings' },
    });
  });

  it('matches chapter clitics and NFC-normalizes a decomposed accent before assigning token IDs', () => {
    const clitic = buildTranscriptSavedWord({
      selection: selected('L’enfant parle.', 'fr-FR', 'L’'),
      chapter: FRENCH_CHAPTER,
      bookId: FRENCH_CHAPTER.bookId,
      chapterId: FRENCH_CHAPTER.id,
      sourceLocale: 'fr-FR',
      explanationLocale: 'en',
      now: NOW,
    });
    const accent = buildTranscriptSavedWord({
      selection: selected('J’aime le cafe\u0301.', 'fr-FR', 'cafe\u0301'),
      chapter: FRENCH_CHAPTER,
      bookId: FRENCH_CHAPTER.bookId,
      chapterId: FRENCH_CHAPTER.id,
      sourceLocale: 'fr-FR',
      explanationLocale: 'en',
      now: NOW,
    });

    expect(clitic).toMatchObject({
      kind: 'ready',
      matchedChapterToken: true,
      word: { tokenId: 'b1.s1.t1', normalizedWord: "l'", translation: 'the' },
    });
    expect(accent).toMatchObject({
      kind: 'ready',
      matchedChapterToken: true,
      word: { tokenId: 'b1.s1.t3', normalizedWord: 'café', translation: 'coffee' },
    });
  });
});
