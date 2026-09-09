/**
 * Pure vocabulary selection and construction for tutor transcript captions.
 * The UI renders `TranscriptSegment`s in order, attaches a save action only
 * to word segments, and calls `buildTranscriptSavedWord` once it has a
 * meaning when one is needed.
 */
import {
  getLanguage,
  tokenizeSentence,
  type Chapter,
  type SavedWord,
  type Sentence,
  type Token,
} from '@sotto/core';
import { buildSavedWord } from '../state/vocabulary';

export interface TranscriptWordSegment {
  text: string;
  start: number;
  end: number;
  isWord: true;
  normalized: string;
  /** Passage taps retain the exact occurrence, including its contextual gloss. */
  chapterTokenId?: string;
  /** The selected word's sentence, kept small even when a caption has several turns. */
  contextSentence: string;
}

export interface TranscriptNonWordSegment {
  text: string;
  start: number;
  end: number;
  isWord: false;
  contextSentence: string;
}

export type TranscriptSegment = TranscriptWordSegment | TranscriptNonWordSegment;

export type TranscriptVocabularyResult =
  | {
      kind: 'ready';
      word: SavedWord;
      matchedChapterToken: boolean;
      /** A chapter gloss which can be shown and edited before saving. */
      suggestedMeaning?: string;
    }
  | {
      kind: 'meaning-required';
      selection: TranscriptWordSegment;
      matchedChapterToken: boolean;
      /** Lets the UI check the existing store item before asking for meaning. */
      tokenId: string;
    };

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const SENTENCE_END_RE = /[.!?。！？]/u;

/** Same matching key as the tutor tool path: preserve accents and internal
 * apostrophes, normalize curly apostrophes, and ignore surrounding marks. */
export function normalizeTranscriptWord(text: string): string {
  return text
    .trim()
    .normalize('NFC')
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, '');
}

/** Stable across captions, so the existing store's tokenId+bookId dedup
 * treats repeated tutor-only words as one review item. */
export function syntheticTranscriptTokenId(sourceLocale: string, normalizedWord: string): string {
  return `tutor:${encodeURIComponent(sourceLocale)}:${encodeURIComponent(
    normalizeTranscriptWord(normalizedWord),
  )}`;
}

function sentenceContext(text: string, offset: number): string {
  let start = offset;
  while (start > 0 && !SENTENCE_END_RE.test(text[start - 1] ?? '')) start -= 1;
  while (start < text.length && /\s/u.test(text[start] ?? '')) start += 1;

  let end = offset;
  while (end < text.length && !SENTENCE_END_RE.test(text[end] ?? '')) end += 1;
  if (end < text.length) end += 1;
  return text.slice(start, end).trim();
}

function wordSegment(
  text: string,
  start: number,
  end: number,
  contextSentence: string,
  normalized = normalizeTranscriptWord(text),
): TranscriptWordSegment {
  return {
    text,
    start,
    end,
    isWord: true,
    normalized: normalizeTranscriptWord(normalized),
    contextSentence,
  };
}

function nonWordSegment(
  text: string,
  start: number,
  end: number,
  contextSentence: string,
): TranscriptNonWordSegment {
  return { text, start, end, isWord: false, contextSentence };
}

type IntlSegment = { segment: string; index: number; isWordLike?: boolean };

function segmentCjkWithIntl(text: string, locale: string): TranscriptSegment[] | null {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity?: string },
      ) => { segment(input: string): Iterable<IntlSegment> };
    }
  ).Segmenter;
  if (typeof Segmenter !== 'function') return null;
  try {
    const result: TranscriptSegment[] = [];
    for (const part of new Segmenter(locale, { granularity: 'word' }).segment(text)) {
      const start = part.index;
      const end = start + part.segment.length;
      const context = sentenceContext(text, start);
      result.push(
        part.isWordLike
          ? wordSegment(part.segment, start, end, context)
          : nonWordSegment(part.segment, start, end, context),
      );
    }
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

function segmentWithTokenizer(
  text: string,
  sourceLocale: string,
  offset = 0,
  contextText = text,
  strategy = getLanguage(sourceLocale).tokenizer,
): TranscriptSegment[] {
  const tokens = tokenizeSentence(text, strategy);
  const result: TranscriptSegment[] = [];
  let cursor = 0;

  for (const token of tokens) {
    const start = text.indexOf(token.text, cursor);
    // The tokenizer returns source substrings in order. If an unfamiliar
    // runtime breaks that contract, retain the untouched tail rather than
    // make an offset up and let the UI save the wrong selection.
    if (start === -1) break;
    // A decomposed accent was absorbed into the preceding word below, but
    // core's tokenizer still reports it as its own punctuation draft. It is
    // already represented in the source segment, so move on to the next token.
    if (start < cursor) continue;
    if (start > cursor) {
      result.push(
        nonWordSegment(
          text.slice(cursor, start),
          offset + cursor,
          offset + start,
          sentenceContext(contextText, offset + cursor),
        ),
      );
    }
    let end = start + token.text.length;
    if (token.isWord) end += text.slice(end).match(/^\p{M}+/u)?.[0]?.length ?? 0;
    const surface = text.slice(start, end);
    const context = sentenceContext(contextText, offset + start);
    result.push(
      token.isWord
        ? wordSegment(surface, offset + start, offset + end, context)
        : nonWordSegment(surface, offset + start, offset + end, context),
    );
    cursor = end;
  }
  if (cursor < text.length) {
    result.push(
      nonWordSegment(
        text.slice(cursor),
        offset + cursor,
        offset + text.length,
        sentenceContext(contextText, offset + cursor),
      ),
    );
  }
  return result;
}

function segmentCjkFallback(text: string, sourceLocale: string): TranscriptSegment[] {
  const result: TranscriptSegment[] = [];
  let offset = 0;
  let tokenizerRunStart = 0;
  const addTokenizerRun = (end: number) => {
    if (tokenizerRunStart >= end) return;
    result.push(
      ...segmentWithTokenizer(
        text.slice(tokenizerRunStart, end),
        sourceLocale,
        tokenizerRunStart,
        text,
        'latin',
      ),
    );
  };
  for (const char of text) {
    const end = offset + char.length;
    const context = sentenceContext(text, offset);
    if (CJK_RE.test(char)) {
      addTokenizerRun(offset);
      result.push(wordSegment(char, offset, end, context));
      tokenizerRunStart = end;
    }
    offset = end;
  }
  addTokenizerRun(text.length);
  return result;
}

/**
 * Segments a caption without changing it: all whitespace and punctuation
 * remain explicit non-word segments, and every selectable word carries its
 * original surface spelling, offsets, normalized match key, and sentence.
 */
export function segmentTranscriptWords(caption: string, sourceLocale: string): TranscriptSegment[] {
  if (!caption) return [];
  if (!CJK_RE.test(caption)) return segmentWithTokenizer(caption, sourceLocale);
  return segmentCjkWithIntl(caption, sourceLocale) ?? segmentCjkFallback(caption, sourceLocale);
}

function findChapterWord(
  chapter: Chapter,
  normalized: string,
  tokenId?: string,
): { token: Token; sentence: Sentence } | undefined {
  const wanted = normalizeTranscriptWord(normalized);
  for (const block of chapter.blocks) {
    for (const sentence of block.sentences) {
      const token = sentence.tokens.find(
        (entry) =>
          entry.isWord &&
          (tokenId ? entry.id === tokenId : normalizeTranscriptWord(entry.normalized) === wanted),
      );
      if (token) return { token, sentence };
    }
  }
  return undefined;
}

function meaningful(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/**
 * Builds a reviewable saved word from a transcript selection. A real chapter
 * token wins only on an exact normalized match; otherwise a stable synthetic
 * token is used and a learner-entered meaning is required.
 */
export function buildTranscriptSavedWord(params: {
  selection: TranscriptWordSegment;
  chapter: Chapter;
  bookId: string;
  chapterId: string;
  sourceLocale: string;
  explanationLocale: string;
  meaning?: string;
  now?: Date;
}): TranscriptVocabularyResult {
  const explicitMeaning = meaningful(params.meaning);
  const found = findChapterWord(
    params.chapter,
    params.selection.normalized,
    params.selection.chapterTokenId,
  );

  if (found) {
    const suggestedMeaning =
      meaningful(found.token.glosses?.[params.explanationLocale]) ??
      meaningful(found.token.glosses?.en);
    const translation = explicitMeaning ?? suggestedMeaning;
    if (!translation) {
      return {
        kind: 'meaning-required',
        selection: params.selection,
        matchedChapterToken: true,
        tokenId: found.token.id,
      };
    }
    return {
      kind: 'ready',
      word: buildSavedWord({
        bookId: params.bookId,
        chapterId: params.chapterId,
        sourceLocale: params.sourceLocale,
        explanationLocale: params.explanationLocale,
        token: found.token,
        sentence: found.sentence,
        translationOverride: translation,
        now: params.now,
      }),
      matchedChapterToken: true,
      ...(suggestedMeaning ? { suggestedMeaning } : {}),
    };
  }

  if (!explicitMeaning) {
    return {
      kind: 'meaning-required',
      selection: params.selection,
      matchedChapterToken: false,
      tokenId: syntheticTranscriptTokenId(params.sourceLocale, params.selection.normalized),
    };
  }

  const tokenId = syntheticTranscriptTokenId(params.sourceLocale, params.selection.normalized);
  const token: Token = {
    id: tokenId,
    text: params.selection.text,
    normalized: params.selection.normalized,
    isWord: true,
    spaceBefore: false,
  };
  const sentence: Sentence = {
    id: `${tokenId}:sentence`,
    text: params.selection.contextSentence,
    translations: {},
    tokens: [token],
  };
  return {
    kind: 'ready',
    word: buildSavedWord({
      bookId: params.bookId,
      chapterId: params.chapterId,
      sourceLocale: params.sourceLocale,
      explanationLocale: params.explanationLocale,
      token,
      sentence,
      translationOverride: explicitMeaning,
      now: params.now,
    }),
    matchedChapterToken: false,
  };
}
