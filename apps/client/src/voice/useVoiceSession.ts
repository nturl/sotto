/**
 * Voice session hook (CONTRACTS §5, TASK §E). A thin wrapper around
 * `sessionManager` (the actual connection lives there so it survives the
 * screen unmounting) that resolves book/chapter data, starts or resumes the
 * session, and reads all live state from the store.
 */
import { useEffect, useMemo, useState } from 'react';
import type { TutorMode } from '@sotto/core';
import { useSottoStore } from '../state/store';
import { selectDueWords, selectVocabularyForBook } from '../state/selectors';
import { fetchHealth } from '../state/contentApi';
import { resolveAvailability, type VoiceAvailability } from './availability';
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
  const packsStatus = useSottoStore((s) => s.packsStatus);
  const loadPacks = useSottoStore((s) => s.loadPacks);

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
    // Unlike the reader/library/home screens, the voice screen never calls
    // useLibrary(), so nothing else triggers loadPacks() on a direct deep
    // link to /voice/[bookId] — packsStatus would stay 'idle' forever and
    // bookLocale(bookId) would never resolve. (WS-6 fix.)
    if (packsStatus === 'idle') void loadPacks();
  }, [packsStatus, loadPacks]);

  useEffect(() => {
    // Same fix as the reader screen: deep-linking straight to /voice/[bookId]
    // (a full page load) mounts before `packs` has loaded, so
    // bookLocale(bookId) resolves undefined and loadBook's locale lookup
    // silently bails — retry once packsStatus reaches 'ready'.
    void loadBook(bookId);
  }, [bookId, loadBook, packsStatus]);

  useEffect(() => {
    if (bookId && chapterId && chapterSummary)
      void loadChapter(bookId, chapterId, chapterSummary.file);
  }, [bookId, chapterId, chapterSummary, loadChapter]);

  // The fake provider (screenshot e2e, unit tests) needs no server at all,
  // so skip the probe entirely and treat availability as ready. Otherwise
  // probe once per bookId before ever attempting a connection — starting a
  // session against a tutor that can't run just fails silently later.
  const isFakeProvider = process.env.EXPO_PUBLIC_VOICE === 'fake';
  const [availability, setAvailability] = useState<VoiceAvailability>(
    isFakeProvider ? { status: 'ready', path: 'local' } : { status: 'checking' },
  );
  // Bumped by the download panel so the gate re-runs after models land.
  const [gateNonce, setGateNonce] = useState(0);

  useEffect(() => {
    if (isFakeProvider) return undefined;
    let cancelled = false;
    setAvailability({ status: 'checking' });
    // The probe answers "is there a server?"; resolveAvailability then falls
    // through to the in-browser tutor when there isn't one (the static host).
    void fetchHealth()
      .then((health) => resolveAvailability(health))
      .then((next) => {
        if (!cancelled) setAvailability(next);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, isFakeProvider, gateNonce]);

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
    } else if (availability.status === 'ready') {
      sessionManager.startSession({
        path: availability.path,
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
    // Only (re)connect on book/chapter identity changes, plus availability
    // flipping to 'ready' (so the gated startSession above actually fires
    // once the health probe resolves) — not on every store update
    // (savedWordList/progress churn while the session runs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapterId, !!chapter, availability.status]);

  return {
    availability,
    /** Called by the download panel once models are installed/removed. */
    recheckAvailability: () => setGateNonce((n) => n + 1),
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
