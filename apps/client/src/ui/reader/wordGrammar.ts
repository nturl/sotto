/**
 * Pure helpers for the panel's lemma / grammar lines. `Token.lemma` and
 * `Token.grammar` are optional (books built before the pipeline filled
 * them carry neither), so every helper returns undefined or an empty list
 * when there is nothing to show and the screen renders nothing extra.
 */
import type { Token } from '@sotto/core';

/** Most words a span breakdown lists; longer drags are cut, not scrolled. */
export const SPAN_BREAKDOWN_CAP = 6;

export interface WordForm {
  /** Dictionary form, only when it differs from the word as written. */
  lemma?: string;
  /** Grammar tag in the explanation locale, falling back to English. */
  grammar?: string;
}

/** Same fallback as glosses: the explanation locale, then English. */
export function grammarFor(token: Token, locale: string): string | undefined {
  return token.grammar?.[locale] || token.grammar?.en || undefined;
}

/** A token's lemma + grammar, or undefined when neither is worth showing. */
export function wordForm(token: Token, locale: string): WordForm | undefined {
  if (!token.isWord) return undefined;
  const raw = token.lemma?.trim();
  const lemma = raw && raw.toLocaleLowerCase() !== token.text.toLocaleLowerCase() ? raw : undefined;
  const grammar = grammarFor(token, locale);
  if (!lemma && !grammar) return undefined;
  return { ...(lemma ? { lemma } : {}), ...(grammar ? { grammar } : {}) };
}

export interface SpanBreakdownRow extends WordForm {
  id: string;
  word: string;
}

/**
 * Per-word rows for a multi-word selection: word tokens only, capped at
 * SPAN_BREAKDOWN_CAP. Empty when no word in the span has lemma or grammar,
 * so the screen can skip the whole block.
 */
export function spanBreakdown(tokens: readonly Token[], locale: string): SpanBreakdownRow[] {
  const words = tokens.filter((tk) => tk.isWord).slice(0, SPAN_BREAKDOWN_CAP);
  const rows = words.map((tk) => ({ id: tk.id, word: tk.text, ...wordForm(tk, locale) }));
  return rows.some((r) => r.lemma || r.grammar) ? rows : [];
}
