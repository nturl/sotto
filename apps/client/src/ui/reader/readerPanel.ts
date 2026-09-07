/**
 * Pure view-model helpers for the reader's translation panel (run 8 lane
 * D; PLAN.md decision 11). Kept framework-free — `react-native` cannot be
 * imported under vitest, so the ordering decision and the two text
 * derivations live here and the screen only renders what they return.
 */
import type { Sentence } from '@sotto/core';

/** Every row the panel can render, in the order decision 11 fixes. Each id
 * is also the row's `testID` in the reader, so an e2e script can assert the
 * rendered order without depending on visible copy. */
export type PanelRowId =
  | 'reader-panel-word'
  | 'reader-panel-gloss'
  | 'reader-panel-form'
  | 'reader-panel-speaker'
  | 'reader-panel-save'
  | 'reader-panel-details'
  | 'reader-panel-report'
  | 'reader-panel-passage'
  | 'reader-panel-your-words'
  | 'reader-panel-talk';

export interface PanelState {
  /** A token or span is selected (false = the empty state). */
  hasSelection: boolean;
  /** The selection is exactly one token: only then do Save/Details apply. */
  isSingleWord: boolean;
  /** The token carries lemma / part-of-speech data. Today's `Token` model
   * has neither field, so this is always false — see D-report.md. */
  hasForm: boolean;
  /** The selection has playable audio (narration slice or word sprite). */
  hasSpeaker: boolean;
  /** The containing sentence could be split around the selection. */
  hasPassage: boolean;
  /** This book has at least one saved word. */
  hasYourWords: boolean;
}

/**
 * The panel's row order. The empty state keeps only the tutor row (the
 * caption itself is not a row); everything else follows decision 11, with
 * a row omitted rather than rendered as a placeholder whenever its data is
 * missing. The talk row is always last.
 */
export function panelRowOrder(state: PanelState): PanelRowId[] {
  if (!state.hasSelection) return ['reader-panel-talk'];
  const rows: PanelRowId[] = ['reader-panel-word', 'reader-panel-gloss'];
  if (state.hasForm) rows.push('reader-panel-form');
  if (state.hasSpeaker) rows.push('reader-panel-speaker');
  if (state.isSingleWord) rows.push('reader-panel-save', 'reader-panel-details');
  rows.push('reader-panel-report');
  if (state.hasPassage) rows.push('reader-panel-passage');
  if (state.hasYourWords) rows.push('reader-panel-your-words');
  rows.push('reader-panel-talk');
  return rows;
}

/**
 * "In this passage": the containing sentence split into the text before the
 * selection, the selected run itself, and the text after — so the screen can
 * render the middle piece carrying the saved-word marker. Rebuilt from the
 * sentence's own tokens (honoring `spaceBefore`) rather than by searching
 * `sentence.text`, so a word that occurs twice highlights the right one and
 * punctuation never gains a space. Returns undefined when no token in
 * `tokenIds` belongs to this sentence.
 */
export function sentenceHighlight(
  sentence: Sentence,
  tokenIds: readonly string[],
): { before: string; word: string; after: string } | undefined {
  const wanted = new Set(tokenIds);
  const first = sentence.tokens.findIndex((token) => wanted.has(token.id));
  if (first === -1) return undefined;
  let last = first;
  for (let i = sentence.tokens.length - 1; i >= first; i -= 1) {
    if (wanted.has(sentence.tokens[i]!.id)) {
      last = i;
      break;
    }
  }

  const render = (from: number, to: number, dropLeadingSpace: boolean): string => {
    let out = '';
    for (let i = from; i < to; i += 1) {
      const token = sentence.tokens[i]!;
      const space = token.spaceBefore !== false && !(dropLeadingSpace && i === from) ? ' ' : '';
      out += `${space}${token.text}`;
    }
    return out;
  };

  // The gap before the selection belongs to `before` and the gap after it to
  // `after`, so that concatenating the three pieces reproduces the sentence
  // exactly while the middle piece is the bare selected run.
  const gapBefore = sentence.tokens[first]!.spaceBefore !== false && first > 0 ? ' ' : '';
  return {
    // The sentence's own first token never contributes a leading space.
    before: render(0, first, true) + gapBefore,
    word: render(first, last + 1, true),
    after: render(last + 1, sentence.tokens.length, false),
  };
}

/**
 * "Your words in this book": the book's saved words joined by " · ", first
 * occurrence wins. Undefined (not an empty string) when there are none, so
 * the screen can drop the whole block.
 */
export function savedWordsLine(words: readonly { sourceWord: string }[]): string | undefined {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const { sourceWord } of words) {
    if (seen.has(sourceWord)) continue;
    seen.add(sourceWord);
    parts.push(sourceWord);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
