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

export function createToolContext(
  store: StoreAccessor,
  bookId: string,
  chapterId: string,
  sourceLocale: string,
  explanationLocale: string,
): ToolExecutionContext {
  const getChapter = () => store.getState().chapters[`${bookId}:${chapterId}`];
  const getPositionTokenId = () => store.getState().progress[bookId]?.tokenId;

  const findTokenAndSentence = (tokenId: string) => {
    const chapter = getChapter();
    if (!chapter) return undefined;
    for (const block of chapter.blocks) {
      for (const sentence of block.sentences) {
        const token = sentence.tokens.find((tk) => tk.id === tokenId);
        if (token) return { token, sentence };
      }
    }
    return undefined;
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

    saveWord: (tokenId, translation) => {
      const found = findTokenAndSentence(tokenId);
      if (!found) return { ok: false, error: `unknown tokenId: ${tokenId}` };
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
