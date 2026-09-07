import { describe, expect, it } from 'vitest';
import type { Sentence, Token } from '@sotto/core';
import { panelRowOrder, savedWordsLine, sentenceHighlight } from './readerPanel.ts';

function word(id: string, text: string, spaceBefore = true): Token {
  return { id, text, normalized: text.toLowerCase(), isWord: true, spaceBefore };
}

function punct(id: string, text: string): Token {
  return { id, text, normalized: text, isWord: false, spaceBefore: false };
}

const sentence: Sentence = {
  id: 's1',
  text: 'Un matin, un corbeau trouve un fromage.',
  translations: {},
  tokens: [
    word('t1', 'Un', false),
    word('t2', 'matin'),
    punct('t3', ','),
    word('t4', 'un'),
    word('t5', 'corbeau'),
    word('t6', 'trouve'),
    word('t7', 'un'),
    word('t8', 'fromage'),
    punct('t9', '.'),
  ],
};

describe('panelRowOrder', () => {
  it('shows only the talk row when nothing is selected', () => {
    expect(
      panelRowOrder({
        hasSelection: false,
        isSingleWord: false,
        hasForm: false,
        hasSpeaker: false,
        hasPassage: false,
        hasYourWords: false,
      }),
    ).toEqual(['reader-panel-talk']);
  });

  it('orders a full single-word selection per PLAN.md decision 11', () => {
    expect(
      panelRowOrder({
        hasSelection: true,
        isSingleWord: true,
        hasForm: true,
        hasSpeaker: true,
        hasPassage: true,
        hasYourWords: true,
      }),
    ).toEqual([
      'reader-panel-word',
      'reader-panel-gloss',
      'reader-panel-form',
      'reader-panel-speaker',
      'reader-panel-save',
      'reader-panel-details',
      'reader-panel-report',
      'reader-panel-passage',
      'reader-panel-your-words',
      'reader-panel-talk',
    ]);
  });

  it('omits the form line entirely when the token carries no lemma/part-of-speech data', () => {
    const rows = panelRowOrder({
      hasSelection: true,
      isSingleWord: true,
      hasForm: false,
      hasSpeaker: true,
      hasPassage: true,
      hasYourWords: true,
    });
    expect(rows).not.toContain('reader-panel-form');
    expect(rows[0]).toBe('reader-panel-word');
    expect(rows[1]).toBe('reader-panel-gloss');
    expect(rows[2]).toBe('reader-panel-speaker');
  });

  it('drops the speaker row when the token has no audio', () => {
    expect(
      panelRowOrder({
        hasSelection: true,
        isSingleWord: true,
        hasForm: false,
        hasSpeaker: false,
        hasPassage: false,
        hasYourWords: false,
      }),
    ).toEqual([
      'reader-panel-word',
      'reader-panel-gloss',
      'reader-panel-save',
      'reader-panel-details',
      'reader-panel-report',
      'reader-panel-talk',
    ]);
  });

  it('keeps Report but drops Save/Details for a multi-token span', () => {
    expect(
      panelRowOrder({
        hasSelection: true,
        isSingleWord: false,
        hasForm: false,
        hasSpeaker: true,
        hasPassage: false,
        hasYourWords: true,
      }),
    ).toEqual([
      'reader-panel-word',
      'reader-panel-gloss',
      'reader-panel-speaker',
      'reader-panel-report',
      'reader-panel-your-words',
      'reader-panel-talk',
    ]);
  });

  it('always ends with the talk row', () => {
    for (const hasSelection of [true, false]) {
      const rows = panelRowOrder({
        hasSelection,
        isSingleWord: true,
        hasForm: false,
        hasSpeaker: false,
        hasPassage: false,
        hasYourWords: false,
      });
      expect(rows.at(-1)).toBe('reader-panel-talk');
    }
  });
});

describe('sentenceHighlight', () => {
  it('splits the containing sentence around the selected token', () => {
    expect(sentenceHighlight(sentence, ['t6'])).toEqual({
      before: 'Un matin, un corbeau ',
      word: 'trouve',
      after: ' un fromage.',
    });
  });

  it('spans a contiguous multi-token selection', () => {
    expect(sentenceHighlight(sentence, ['t5', 't6'])).toEqual({
      before: 'Un matin, un ',
      word: 'corbeau trouve',
      after: ' un fromage.',
    });
  });

  it('marks a leading token with no text before it', () => {
    expect(sentenceHighlight(sentence, ['t1'])).toEqual({
      before: '',
      word: 'Un',
      after: ' matin, un corbeau trouve un fromage.',
    });
  });

  it('keeps trailing punctuation attached with no inserted space', () => {
    expect(sentenceHighlight(sentence, ['t8'])).toEqual({
      before: 'Un matin, un corbeau trouve un ',
      word: 'fromage',
      after: '.',
    });
  });

  it('returns undefined when no token matches', () => {
    expect(sentenceHighlight(sentence, ['nope'])).toBeUndefined();
  });

  it('rebuilds the whole sentence from its parts', () => {
    const parts = sentenceHighlight(sentence, ['t6'])!;
    expect(parts.before + parts.word + parts.after).toBe('Un matin, un corbeau trouve un fromage.');
  });
});

describe('savedWordsLine', () => {
  it('joins saved words with a middle dot', () => {
    expect(savedWordsLine([{ sourceWord: 'branche' }, { sourceWord: 'plumage' }])).toBe(
      'branche · plumage',
    );
  });

  it('de-duplicates repeats, keeping first-seen order', () => {
    expect(
      savedWordsLine([
        { sourceWord: 'branche' },
        { sourceWord: 'plumage' },
        { sourceWord: 'branche' },
      ]),
    ).toBe('branche · plumage');
  });

  it('returns undefined when the book has no saved words', () => {
    expect(savedWordsLine([])).toBeUndefined();
  });
});
