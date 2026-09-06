/**
 * Voice session hook (CONTRACTS §5, TASK §E). A thin wrapper around
 * `sessionManager` (the actual connection lives there so it survives the
 * screen unmounting) that resolves book/chapter data, starts or resumes the
 * session, and reads all live state from the store.
 */
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import type { TutorMode } from '@sotto/core';
import { useMe } from '../cloud/useMe';
import { useSottoStore } from '../state/store';
import { selectDueWords, selectVocabularyForBook } from '../state/selectors';
import { fetchHealth } from '../state/contentApi';
import { DESKTOP_BREAKPOINT } from '../ui/Shell';
import {
  cloudPathUsable,
  resolveAvailability,
  type VoiceAvailability,
  type VoicePath,
} from './availability';
import { buildPassageWindow } from './passage';
import * as sessionManager from './sessionManager';
import { startControlState, type StartControlState } from './voiceStartGate';

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
  const remainingSeconds = useSottoStore((s) => s.remainingSeconds);
  const setExplanation = useSottoStore((s) => s.setExplanation);

  // R3-S cloud gate: signed-in + a paid plan with minutes left. `useMe()`
  // is a no-op ('no-cloud') when there's no CloudAdapter, so this adds
  // nothing to the OSS/NullCloud build's behavior.
  const me = useMe();
  const cloudUsable = cloudPathUsable(me);
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const [pathChoice, setPathChoice] = useState<VoicePath | null>(null);

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
    // through to the in-browser tutor when there isn't one (the static host),
    // and now also to the cloud path when it's usable (see availability.ts).
    void fetchHealth()
      .then((health) => resolveAvailability(health, { cloudUsable, isDesktop }))
      .then((next) => {
        if (!cancelled) setAvailability(next);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, isFakeProvider, gateNonce, cloudUsable, isDesktop]);

  // Reset a desktop chip choice whenever the underlying gate re-runs with a
  // different verdict, so a stale choice from a previous book doesn't leak.
  useEffect(() => {
    setPathChoice(null);
  }, [availability.status, bookId]);

  const activePath: VoicePath | undefined =
    availability.status === 'ready' ? (pathChoice ?? availability.path) : undefined;

  const bookWords = useMemo(
    () => selectVocabularyForBook(savedWords, bookId),
    [savedWords, bookId],
  );
  const savedWordList = useMemo(() => {
    const words = reviewOnly ? selectDueWords(bookWords) : bookWords;
    return [...new Set(words.map((w) => w.normalizedWord))];
  }, [bookWords, reviewOnly]);

  // R6-B3: capture (getUserMedia/AudioContext) must never start before a
  // tap (B1 candidate 2, B2's screenshot evidence — auto-starting in this
  // effect raised iOS's mic sheet on mount, with no user gesture behind
  // it). This effect now only resumes an *already-active* session's UI on
  // remount; a brand-new session is only ever begun by `start()` below,
  // called synchronously from the voice screen's own tap handler so the
  // gesture survives into the `getUserMedia` call inside it.
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!chapter || !chapterId) return undefined;

    if (sessionManager.isSessionActiveFor(bookId) && !pathChoice) {
      sessionManager.resumeSessionUI();
      setStarted(true);
    }

    return () => {
      if (sessionManager.isSessionActiveFor(bookId)) sessionManager.pauseSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapterId, !!chapter, pathChoice]);

  const beginSession = (path: VoicePath): void => {
    if (!chapter || !chapterId) return;
    sessionManager.startSession({
      path,
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
      cloudProvider: me.status === 'signed-in' ? me.me.entitlement.provider : undefined,
    });
    setStarted(true);
  };

  const startControl: StartControlState = startControlState(availability.status, started);

  return {
    availability,
    /** R3-S: the path actually driving the live session right now (a
     * chip-row choice, when one was made, otherwise whatever the gate
     * picked) — distinct from `availability.path`, which is just the
     * gate's default recommendation. */
    activePath,
    /** Called by the download panel once models are installed/removed. */
    recheckAvailability: () => setGateNonce((n) => n + 1),
    /** R6-B3: what the screen's primary control area should show —
     * `'hidden'` (still checking), `'start'` (a Start button, no capture
     * requested yet), or `'active'` (the live in-session controls). */
    startControl,
    /** R6-B3: called synchronously from the Start tap's press handler so
     * the resulting `getUserMedia` call keeps the browser's user
     * activation. A no-op until the availability probe has resolved
     * `activePath` — the button stays up rather than starting late. */
    start: () => {
      if (activePath) beginSession(activePath);
    },
    voiceState,
    captions,
    mode,
    setMode: (next: TutorMode) => sessionManager.setMode(next),
    readingTokenIds,
    explanation,
    dismissExplanation: () => setExplanation(null),
    error: voiceError,
    limitReason,
    /** R3-S: cloud-path minutes-remaining ticker, null on every other path. */
    remainingSeconds,
    /** R3-S: the voice screen's chip row calls this to switch between an
     * offered `availability.alternatives` entry (desktop only — phones
     * never get more than one path to choose from). */
    switchPath: (path: VoicePath) => {
      setPathChoice(path);
      // A chip tap is itself a user gesture, and if a session is already
      // running the learner is deliberately swapping tutors mid-session —
      // restart on the new path directly, synchronously in this handler,
      // rather than waiting on a second Start tap.
      if (started) beginSession(path);
    },
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
