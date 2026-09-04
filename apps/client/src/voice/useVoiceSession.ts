/**
 * Voice session hook (CONTRACTS §5, TASK §E). A thin wrapper around
 * `sessionManager` (the actual connection lives there so it survives the
 * screen unmounting) that resolves book/chapter data, starts or resumes the
 * session, and reads all live state from the store.
 */
import { useEffect, useMemo } from 'react';
import type { TutorMode } from '@sotto/core';
import { useSottoStore } from '../state/store';
import { selectDueWords, selectVocabularyForBook } from '../state/selectors';
import { buildPassageWindow } from './passage';
import * as sessionManager from './sessionManager';

export interface UseVoiceSessionArgs {
  bookId: string;
  mode?: TutorMode;
  reviewOnly?: boolean;
}

export function useVoiceSession({ bookId, mode: modeParam, reviewOnly }: UseVoiceSessionArgs) {
  const preferences = useSottoStore((s) => s.preferences);
  const books = useSottoStore((s) => s.books);
  const chapters = useSottoStore((s) => s.chapters);
  const progress = useSottoStore((s) => s.progress);
  const savedWords = useSottoStore((s) => s.savedWords);
  const loadBook = useSottoStore((s) => s.loadBook);
  const loadChapter = useSottoStore((s) => s.loadChapter);
  const bookLocale = useSottoStore((s) => s.bookLocale);

  const sessionRecord = useSottoStore((s) => s.sessionRecord);
  const voiceState = useSottoStore((s) => s.voiceState);
  const captions = useSottoStore((s) => s.captions);
  const readingTokenIds = useSottoStore((s) => s.readingTokenIds);
  const explanation = useSottoStore((s) => s.explanation);
  const voiceError = useSottoStore((s) => s.voiceError);
  const limitReason = useSottoStore((s) => s.limitReason);
  const setExplanation = useSottoStore((s) => s.setExplanation);

  const book = books[bookId];
  const chapterId = progress[bookId]?.chapterId ?? book?.chapters[0]?.id;
  const chapterSummary = book?.chapters.find((c) => c.id === chapterId);
  const chapter = chapterId ? chapters[`${bookId}:${chapterId}`] : undefined;
  const locale = bookLocale(bookId) ?? preferences.learningLocale;
  const mode = sessionRecord?.mode ?? modeParam ?? preferences.defaultTutorMode;

  useEffect(() => {
    void loadBook(bookId);
  }, [bookId, loadBook]);

  useEffect(() => {
    if (bookId && chapterId && chapterSummary)
      void loadChapter(bookId, chapterId, chapterSummary.file);
  }, [bookId, chapterId, chapterSummary, loadChapter]);

  const bookWords = useMemo(
    () => selectVocabularyForBook(savedWords, bookId),
    [savedWords, bookId],
  );
  const savedWordList = useMemo(() => {
    const words = reviewOnly ? selectDueWords(bookWords) : bookWords;
    return [...new Set(words.map((w) => w.normalizedWord))];
  }, [bookWords, reviewOnly]);

  useEffect(() => {
    if (!chapter || !chapterId) return undefined;

    if (sessionManager.isSessionActiveFor(bookId)) {
      sessionManager.resumeSessionUI();
    } else {
      sessionManager.startSession({
        bookId,
        chapterId,
        mode,
        learner: {
          level: preferences.level,
          learningLocale: locale,
          explanationLocale: preferences.explanationLocale,
        },
        passage: buildPassageWindow(chapter, progress[bookId]?.tokenId),
        savedWords: savedWordList,
      });
    }

    return () => {
      if (sessionManager.isSessionActiveFor(bookId)) sessionManager.pauseSession();
    };
    // Only (re)connect on book/chapter identity changes — not on every
    // store update (savedWordList/progress churn while the session runs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapterId, !!chapter]);

  return {
    voiceState,
    captions,
    mode,
    setMode: (next: TutorMode) => sessionManager.setMode(next),
    readingTokenIds,
    explanation,
    dismissExplanation: () => setExplanation(null),
    error: voiceError,
    limitReason,
    chapter,
    chapterTitle: chapterSummary?.title,
    setMuted: (muted: boolean) => sessionManager.setMuted(muted),
    pushToTalk: (activeState: boolean) => sessionManager.pushToTalk(activeState),
    interrupt: () => sessionManager.interrupt(),
    replayLast: () => sessionManager.replayLast(),
    sendText: (text: string) => sessionManager.sendText(text),
    end: () => sessionManager.endSession(),
  };
}
