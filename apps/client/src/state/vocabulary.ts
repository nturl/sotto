/**
 * Shared SavedWord construction (TASK §F: tapping "Save" in the reader and
 * the tutor's `save_vocabulary` tool call must produce identical state) —
 * both call this, then `store.saveWord(...)`.
 */
import { initialReview, type Sentence, type SavedWord, type Token } from '@sotto/core';
import { genId } from './types';

export function buildSavedWord(params: {
  bookId: string;
  chapterId: string;
  sourceLocale: string;
  explanationLocale: string;
  token: Token;
  sentence: Sentence;
  translationOverride?: string;
  now?: Date;
}): SavedWord {
  const now = params.now ?? new Date();
  const translation =
    params.translationOverride ??
    params.token.glosses?.[params.explanationLocale] ??
    params.token.glosses?.en ??
    params.token.normalized;

  return {
    id: genId('word'),
    bookId: params.bookId,
    chapterId: params.chapterId,
    tokenId: params.token.id,
    sentenceId: params.sentence.id,
    sourceLocale: params.sourceLocale,
    explanationLocale: params.explanationLocale,
    sourceWord: params.token.text,
    normalizedWord: params.token.normalized,
    translation,
    pronunciationGuide: params.token.pinyin,
    contextSentence: params.sentence.text,
    savedAt: now.toISOString(),
    review: initialReview(now),
  };
}
