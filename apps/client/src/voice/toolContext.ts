/**
 * Builds a @sotto/core `ToolExecutionContext` (CONTRACTS §5c) that mutates
 * the real store — the same store actions the reader's tap-to-save path
 * uses, via `buildSavedWord` (TASK §F: identical state from both paths).
 *
 * Reads everything it needs (chapter data, reading position) from the
 * store rather than component refs, so the context stays valid for the
 * lifetime of a background session (TASK §E: the session survives the
 * voice screen unmounting) — see sessionManager.ts.
 */
import type { ToolExecutionContext } from '@sotto/core';
import { buildSavedWord } from '../state/vocabulary';
import type { SottoState } from '../state/createStore';
import { buildPassageWindow } from './passage';

/** `store` is injected (rather than importing the app singleton directly)
 * so this is testable against an isolated store — see toolContext.test.ts —
 * and so it never touches the singleton's platform Persistence adapter. */
export interface StoreAccessor {
  getState: () => SottoState;
}

/** Case-, apostrophe- and edge-punctuation-insensitive word key, so a model
 * passing "Cigarra," still matches the token "cigarra". */
function normalizeWord(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function createToolContext(
  store: StoreAccessor,
  bookId: string,
  chapterId: string,
  sourceLocale: string,
  explanationLocale: string,
): ToolExecutionContext {
  const getChapter = () => store.getState().chapters[`${bookId}:${chapterId}`];
  const getPositionTokenId = () => store.getState().progress[bookId]?.tokenId;

  const flatTokens = () => {
    const chapter = getChapter();
    if (!chapter) return [];
    return chapter.blocks.flatMap((b) =>
      b.sentences.flatMap((sentence) => sentence.tokens.map((token) => ({ token, sentence }))),
    );
  };

  const findTokenAndSentence = (tokenId: string) =>
    flatTokens().find((entry) => entry.token.id === tokenId);

  /**
   * Resolves the token to save. The model is reliable about the *word* and
   * unreliable about the *id* (ids get guessed by counting words, and
   * punctuation tokens throw the count off — the live "save cigarra" run
   * saved the adjacent "verano"). So when it names the word, the id is
   * checked against it: on a mismatch we re-resolve to the nearest token in
   * the chapter with that text, and if there is none we fail rather than
   * silently save a different word.
   */
  const resolveWordToken = (tokenId: string, word?: string) => {
    const found = findTokenAndSentence(tokenId);
    if (word === undefined) {
      return found ?? { error: `unknown tokenId: ${tokenId}` };
    }
    const wanted = normalizeWord(word);
    if (found && normalizeWord(found.token.text) === wanted) return found;

    const all = flatTokens();
    const anchorId = found?.token.id ?? getPositionTokenId();
    const anchor = anchorId ? all.findIndex((e) => e.token.id === anchorId) : -1;
    const candidates = all
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.token.isWord && normalizeWord(entry.token.text) === wanted);
    if (candidates.length === 0) {
      const actual = found ? `"${found.token.text}"` : 'unknown';
      return { error: `word "${word}" not found in chapter (tokenId ${tokenId} is ${actual})` };
    }
    const nearest =
      anchor < 0
        ? candidates[0]!
        : candidates.reduce((best, c) =>
            Math.abs(c.index - anchor) < Math.abs(best.index - anchor) ? c : best,
          );
    return nearest.entry;
  };

  return {
    getPassage: () => {
      const chapter = getChapter();
      if (!chapter) return { chapterTitle: '', sentences: [], positionTokenId: null };
      return buildPassageWindow(chapter, getPositionTokenId());
    },

    setPosition: (id) => {
      const found = findTokenAndSentence(id);
      if (!found) return { ok: false, error: `unknown token or sentence: ${id}` };
      const state = store.getState();
      const prev = state.progress[bookId];
      state.setProgress({
        bookId,
        chapterId,
        audioPositionMs: prev?.audioPositionMs ?? 0,
        percentComplete: prev?.percentComplete ?? 0,
        updatedAt: new Date().toISOString(),
        tokenId: found.token.id,
      });
      return { ok: true };
    },

    saveWord: (tokenId, translation, wordHint) => {
      const found = resolveWordToken(tokenId, wordHint);
      if ('error' in found) return { ok: false, error: found.error };
      const word = buildSavedWord({
        bookId,
        chapterId,
        sourceLocale,
        explanationLocale,
        token: found.token,
        sentence: found.sentence,
        translationOverride: translation,
      });
      store.getState().saveWord(word);
      return { ok: true, savedWordId: word.id };
    },

    removeWord: (ref) => {
      const removed = store.getState().removeWord({ ...ref, bookId });
      return removed ? { ok: true } : { ok: false, error: 'no matching saved word' };
    },

    showExplanation: (payload) => {
      store.getState().setExplanation(payload);
      return { ok: true };
    },

    setMode: (mode) => {
      store.getState().patchSessionRecord({ mode });
      return { ok: true };
    },

    markComplete: () => {
      const state = store.getState();
      const book = state.books[bookId];
      const isLast = book ? book.chapters[book.chapters.length - 1]?.id === chapterId : false;
      state.markCompleted(bookId);
      state.setProgress({
        bookId,
        chapterId,
        audioPositionMs: 0,
        percentComplete: 1,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      return { ok: true, advanced: !isLast };
    },
  };
}
