/**
 * Pure helpers for reader span selection (O2-C task C1). A "span" is a
 * contiguous run of tokens within one block (paragraph) — chosen by
 * click-drag (web/mouse) or long-press-drag (touch) — as opposed to the
 * pre-existing single-tap word selection or the long-press-a-sentence
 * shortcut. Kept dependency-free and framework-free so they're trivial to
 * unit test.
 */
import type { Block, Sentence, Token } from '@sotto/core';

export interface FlatBlockToken {
  token: Token;
  sentence: Sentence;
  /** Index within the flattened token list for this block (all sentences concatenated). */
  index: number;
}

/** Flattens every sentence's tokens in one block into reading order. */
export function flattenBlockTokens(block: Block): FlatBlockToken[] {
  const flat: FlatBlockToken[] = [];
  let index = 0;
  for (const sentence of block.sentences) {
    for (const token of sentence.tokens) {
      flat.push({ token, sentence, index });
      index += 1;
    }
  }
  return flat;
}

/**
 * Given the anchor (drag-start) and focus (current pointer) token ids,
 * returns every token between them inclusive, in reading order (so
 * dragging backward from the focus toward the anchor works the same as
 * forward). Returns an empty array if either id isn't found.
 */
export function computeSpan(
  flat: FlatBlockToken[],
  anchorTokenId: string,
  focusTokenId: string,
): FlatBlockToken[] {
  const anchorIdx = flat.findIndex((f) => f.token.id === anchorTokenId);
  const focusIdx = flat.findIndex((f) => f.token.id === focusTokenId);
  if (anchorIdx === -1 || focusIdx === -1) return [];
  const [lo, hi] = anchorIdx <= focusIdx ? [anchorIdx, focusIdx] : [focusIdx, anchorIdx];
  return flat.slice(lo, hi + 1);
}

/**
 * True when `spanTokenIds` covers every WORD token of the sentence (a drag
 * can only start/end on a word — punctuation tokens aren't drag targets —
 * so a "whole sentence" drag naturally runs first-word to last-word, not
 * including a trailing "." or closing quote; comparing against every
 * token including punctuation would make this unreachable by dragging).
 */
export function isWholeSentenceSpan(sentence: Sentence, spanTokenIds: readonly string[]): boolean {
  const sentenceWordIds = sentence.tokens.filter((t) => t.isWord).map((t) => t.id);
  const spanSet = new Set(spanTokenIds);
  if (sentenceWordIds.length === 0) return false;
  return sentenceWordIds.every((id) => spanSet.has(id));
}

/** True when every token in the span belongs to the same sentence. */
export function isSingleSentenceSpan(span: FlatBlockToken[]): boolean {
  if (span.length === 0) return true;
  const sentenceId = span[0]?.sentence.id;
  return span.every((f) => f.sentence.id === sentenceId);
}

/** Renders the span's own text back out, preserving spaceBefore (skips the
 * very first token's leading space, matching how sentences render). */
export function spanText(span: FlatBlockToken[]): string {
  return span
    .map((f, i) => (i > 0 && f.token.spaceBefore !== false ? ` ${f.token.text}` : f.token.text))
    .join('');
}

/**
 * Composed gloss line (O2-C C1): the glosses of the span's WORD tokens,
 * joined with " · ", in `locale` with an `en` fallback per word. Returns
 * undefined if no word token in the span has any gloss at all (nothing
 * useful to show).
 */
export function composedGlossLine(span: FlatBlockToken[], locale: string): string | undefined {
  const parts = span
    .filter((f) => f.token.isWord)
    .map((f) => f.token.glosses?.[locale] ?? f.token.glosses?.en)
    .filter((g): g is string => !!g);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** True when the composed gloss line had to fall back to English for at
 * least one word (drives the existing "shown in English" caption). */
export function composedGlossUsedFallback(span: FlatBlockToken[], locale: string): boolean {
  return span.some((f) => f.token.isWord && !f.token.glosses?.[locale] && !!f.token.glosses?.en);
}
