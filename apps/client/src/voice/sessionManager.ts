/**
 * Module-level singleton that owns the live VoiceProvider connection.
 *
 * The voice screen's hook is a thin, component-scoped wrapper (TASK §E:
 * "Leaving the voice screen keeps the session (paused) for resume"): the
 * session bar must keep showing live state while the learner is elsewhere
 * in the app, so the provider and its event wiring cannot live inside the
 * screen's own component tree — they'd be torn down on navigation. This
 * manager lives outside React and writes every live update straight into
 * the store (voiceState/captions/readingTokenIds/...); `SessionBar` and any
 * mounted voice screen just read that store state, no connection of their
 * own needed.
 */
import type { TutorMode } from '@sotto/core';
import {
  BrowserCascadeProvider,
  FakeVoiceProvider,
  LocalCascadeProvider,
  systemClock,
  type PassageContext,
  type SessionOptions,
  type VoiceProvider,
} from '@sotto/voice';
import { createAudioAdapter } from '../platform/audio-adapter';
import { serverUrl } from '../state/contentApi';
import { genId } from '../state/types';
import { useSottoStore } from '../state/store';
import type { VoicePath } from './availability';
import { createVoiceController } from './controller';
import { createToolContext } from './toolContext';

/**
 * Which provider runs this session (planning/BROWSER-TUTOR.md).
 *
 * `EXPO_PUBLIC_VOICE=fake` always wins (screenshot e2e, unit tests). After
 * that the capability gate has already decided — `availability.path` is
 * 'local' when apps/server answered /health healthy, and 'browser' on the
 * static host with WebGPU and the models cached — so this only has to build
 * the matching provider. Both implement the same VoiceProvider interface and
 * emit the same VoiceEvents, so nothing downstream of here can tell them
 * apart.
 */
function pickProvider(path: VoicePath): VoiceProvider {
  if (process.env.EXPO_PUBLIC_VOICE === 'fake') return new FakeVoiceProvider(systemClock);
  if (path === 'browser') return new BrowserCascadeProvider({ audio: createAudioAdapter() });
  return new LocalCascadeProvider({ serverUrl: serverUrl(), audio: createAudioAdapter() });
}

interface ActiveSession {
  bookId: string;
  chapterId: string;
  provider: VoiceProvider;
  unsubscribe: () => void;
}

let active: ActiveSession | null = null;

export function activeBookId(): string | undefined {
  return active?.bookId;
}

export function getProvider(): VoiceProvider | null {
  return active?.provider ?? null;
}

/** Starts a new session, ending any previous one first. */
export function startSession(params: {
  bookId: string;
  chapterId: string;
  mode: TutorMode;
  learner: SessionOptions['learner'];
  passage: PassageContext;
  savedWords: string[];
  /** Which tutor the capability gate picked. Defaults to the local server. */
  path?: VoicePath;
}): void {
  if (active) endSession();

  const { bookId, chapterId, mode, learner, passage, savedWords } = params;
  const provider = pickProvider(params.path ?? 'local');
  const ctx = createToolContext(
    useSottoStore,
    bookId,
    chapterId,
    learner.learningLocale,
    learner.explanationLocale,
  );

  const { unsubscribe } = createVoiceController(provider, ctx, {
    onState: (state) => useSottoStore.getState().setVoiceState(state),
    onCaption: (entry) => {
      useSottoStore.getState().pushCaption(entry);
      if (entry.speaker === 'tutor' && entry.final) {
        useSottoStore.getState().patchSessionRecord({ transcriptSummary: entry.text });
      }
    },
    onReading: (tokenIds) => useSottoStore.getState().setReadingTokenIds(tokenIds),
    onLimit: (reason) => useSottoStore.getState().setLimitReason(reason),
    onError: (entry) =>
      useSottoStore.getState().setVoiceError({
        code: entry.code,
        message: entry.message,
        recoverable: entry.recoverable,
      }),
    onToolEvent: (entry) => useSottoStore.getState().pushToolEvent(entry),
  });

  active = { bookId, chapterId, provider, unsubscribe };

  useSottoStore.getState().setSessionRecord({
    id: genId('session'),
    bookId,
    chapterId,
    mode,
    status: 'active',
    startedAt: new Date().toISOString(),
  });

  void provider.connect({ bookId, chapterId, mode, learner, passage, savedWords });
}

/** True when a session is already running for this book (so the hook
 * should attach/resume rather than start a fresh connection). */
export function isSessionActiveFor(bookId: string): boolean {
  return active?.bookId === bookId;
}

/** Called when the voice screen unmounts without an explicit `end()` — the
 * provider keeps running, only the store's session status changes. */
export function pauseSession(): void {
  if (!active) return;
  useSottoStore.getState().patchSessionRecord({ status: 'paused' });
}

/** Called when the voice screen remounts for the same book. */
export function resumeSessionUI(): void {
  if (!active) return;
  useSottoStore.getState().patchSessionRecord({ status: 'active' });
}

export function setMode(mode: TutorMode): void {
  if (!active) return;
  active.provider.setMode(mode);
  useSottoStore.getState().patchSessionRecord({ mode });
}

export function setMuted(muted: boolean): void {
  active?.provider.setMuted(muted);
}

export function pushToTalk(activeState: boolean): void {
  active?.provider.pushToTalk(activeState);
}

export function interrupt(): void {
  active?.provider.interrupt();
}

export function replayLast(): void {
  active?.provider.replayLast();
}

export function sendText(text: string): void {
  active?.provider.sendText(text);
}

export function endSession(): void {
  if (!active) return;
  const { provider, unsubscribe } = active;
  unsubscribe();
  void provider.disconnect();
  active = null;
  useSottoStore.getState().setSessionRecord(null);
  useSottoStore.getState().clearSessionEphemeral();
}
