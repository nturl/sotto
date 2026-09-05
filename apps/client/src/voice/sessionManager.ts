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
  OpenAIRealtimeProvider,
  systemClock,
  type PassageContext,
  type SessionOptions,
  type VoiceProvider,
  type WorkerInitPayload,
} from '@sotto/voice';
import { createAudioAdapter } from '../platform/audio-adapter';
import { detectPlatform, getCloudAdapter } from '../cloud/provider';
import type { CloudProviderId } from '../cloud/types';
import { serverUrl } from '../state/contentApi';
import { genId } from '../state/types';
import { useSottoStore } from '../state/store';
import type { VoicePath } from './availability';
import { createVoiceController } from './controller';
import { createToolContext } from './toolContext';

const REALTIME_PROVIDER_IDS = new Set<CloudProviderId>(['realtime-mini', 'realtime']);

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
/**
 * Diagnostic-only escape hatch for the STT/LLM-contention experiments
 * (docs/evidence/browser-tutor-stt-regression-2026-09-05.log). The e2e
 * harness sets `window.__SOTTO_TUTOR_DEBUG__` via `page.addInitScript`
 * before the app loads; the normal app never sets this global, so
 * production sessions always get `undefined` here.
 */
function debugOverride(): WorkerInitPayload['debug'] | undefined {
  const g = globalThis as { __SOTTO_TUTOR_DEBUG__?: WorkerInitPayload['debug'] };
  return g.__SOTTO_TUTOR_DEBUG__;
}

// R3-S: reuses LocalCascadeProvider's WS protocol handling (the cloud
// broker speaks the same wire protocol per CLOUD-API.md's "Voice broker
// (C3)") rather than a second provider class — `createSession` swaps out
// only how the session is created, since the cloud broker's
// `POST /voice/session` already needs cookie/bearer auth this class
// doesn't otherwise send, and returns a pre-signed `wsUrl` directly.
function cloudCascadeProvider(): VoiceProvider {
  const cloud = getCloudAdapter();
  return new LocalCascadeProvider({
    serverUrl: serverUrl(),
    audio: createAudioAdapter(),
    createSession: (opts) => cloud.voiceSession(opts),
  });
}

function pickProvider(
  path: VoicePath,
  cloudProvider: CloudProviderId | undefined,
  sessionOptions: SessionOptions,
): VoiceProvider {
  if (process.env.EXPO_PUBLIC_VOICE === 'fake') return new FakeVoiceProvider(systemClock);
  if (path === 'browser') {
    return new BrowserCascadeProvider({ audio: createAudioAdapter(), debug: debugOverride() });
  }
  if (path === 'cloud') {
    // Finding 3 (adversarial review 3): the Realtime path's two
    // client-side defenses (a real OpenAIRealtimeProvider construction,
    // and calling POST /voice/realtime/end) didn't exist in the shipped
    // app, so a Realtime session was only ever closed by the server's
    // reaper at the full ceiling. Wire it in — web only; native has no
    // WebRTC transport (packages/voice/src/transports/openai-realtime.ts
    // throws NotSupportedError there), so it keeps the existing cascade
    // path unconditionally rather than ever attempting to mint a secret
    // it can't use.
    if (cloudProvider && REALTIME_PROVIDER_IDS.has(cloudProvider) && detectPlatform() === 'web') {
      const cloud = getCloudAdapter();
      return new OpenAIRealtimeProvider({
        mintSecret: () => cloud.realtimeSecret(sessionOptions),
        onEnd: (report) =>
          void cloud.realtimeEnd(report.callId, {
            audioSecondsIn: report.audioSecondsIn,
            audioSecondsOut: report.audioSecondsOut,
          }),
        platform: 'web',
      });
    }
    return cloudCascadeProvider();
  }
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
  /** Signed-in learner's entitlement.provider (CLOUD-API.md `/me`) — only
   * meaningful when `path === 'cloud'`; decides Realtime vs the cascade
   * broker for that path. */
  cloudProvider?: CloudProviderId;
}): void {
  if (active) endSession();

  const { bookId, chapterId, mode, learner, passage, savedWords } = params;
  const sessionOptions: SessionOptions = { bookId, chapterId, mode, learner, passage, savedWords };
  const ctx = createToolContext(
    useSottoStore,
    bookId,
    chapterId,
    learner.learningLocale,
    learner.explanationLocale,
  );

  const attach = (provider: VoiceProvider, isRealtimeAttempt: boolean): void => {
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
      onUsage: (entry) => useSottoStore.getState().setRemainingSeconds(entry.remainingSeconds),
    });

    active = { bookId, chapterId, provider, unsubscribe };

    void provider.connect(sessionOptions).catch((err: unknown) => {
      // The Realtime provider throws NotSupportedError on native (no
      // WebRTC transport there yet), and the server answers 503
      // `realtime_unavailable` until SOTTO_CLOUD_REALTIME_ENABLED is set —
      // both surface as a rejected connect() rather than a VoiceEvent.
      // Fall back to the cascade session instead of leaving the learner
      // on a dead connection.
      if (!isRealtimeAttempt) return;
      unsubscribe();
      useSottoStore.getState().pushCaption({
        speaker: 'tutor',
        text: 'Switching to the standard voice tutor.',
        final: true,
      });
      attach(cloudCascadeProvider(), false);
    });
  };

  useSottoStore.getState().setSessionRecord({
    id: genId('session'),
    bookId,
    chapterId,
    mode,
    status: 'active',
    startedAt: new Date().toISOString(),
  });

  const provider = pickProvider(params.path ?? 'local', params.cloudProvider, sessionOptions);
  const isRealtimeAttempt = provider instanceof OpenAIRealtimeProvider;
  attach(provider, isRealtimeAttempt);
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
