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
  OpenAIDirectProvider,
  OpenAIRealtimeProvider,
  systemClock,
  type AudioAdapter,
  type PassageContext,
  type SessionOptions,
  type VoiceProvider,
  type WorkerInitPayload,
} from '@sotto/voice';
import { createAudioAdapter } from '../platform/audio-adapter';
import { claimAudio, releaseAudio } from '../platform/audioBus';
import { detectPlatform, getCloudAdapter } from '../cloud/provider';
import type { CloudProviderId } from '../cloud/types';
import { serverUrl } from '../state/contentApi';
import { genId } from '../state/types';
import { useSottoStore } from '../state/store';
import type { VoicePath } from './availability';
import { cachedByokKey } from './byokKey';
import { createVoiceController } from './controller';
import { createToolContext } from './toolContext';
import { createListeningGate } from './voiceStartGate';

/**
 * R6-B3: wraps the real `AudioAdapter` so `startSession` can tell whether
 * the capture transport has an actual microphone stream yet, independent
 * of whatever a provider (or, for the local path, the server over its own
 * websocket — see `voiceStartGate.ts`) reports as `listening`. Every path
 * that touches a real microphone (local/browser/byok/cloud-cascade) shares
 * one wrapped adapter per session so the gate reflects the one real
 * `getUserMedia` call this session makes.
 */
function wrapAudioForGating(
  inner: AudioAdapter,
  onCaptureReady: () => void,
): {
  adapter: AudioAdapter;
  captureReady: () => boolean;
} {
  let ready = false;
  const adapter: AudioAdapter = {
    startCapture: async (onPcm16) => {
      await inner.startCapture(onPcm16);
      ready = true;
      onCaptureReady();
    },
    stopCapture: () => {
      ready = false;
      inner.stopCapture();
    },
    playPcm: (buf, sampleRate) => inner.playPcm(buf, sampleRate),
    stopPlayback: () => inner.stopPlayback(),
  };
  return { adapter, captureReady: () => ready };
}

const REALTIME_PROVIDER_IDS = new Set<CloudProviderId>(['realtime-mini', 'realtime']);

/**
 * Which provider runs this session (planning/BROWSER-TUTOR.md).
 *
 * `EXPO_PUBLIC_VOICE=fake` always wins (screenshot e2e, unit tests). After
 * that the capability gate has already decided — `availability.path` is
 * 'local' when apps/server answered /health healthy, 'browser' on the
 * static host with WebGPU and the models cached, and 'byok' (R4-B2) when
 * the learner has stored their own OpenAI key — so this only has to build
 * the matching provider. They all implement the same VoiceProvider
 * interface and emit the same VoiceEvents, so nothing downstream of here
 * can tell them apart.
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
function cloudCascadeProvider(audio: AudioAdapter): VoiceProvider {
  const cloud = getCloudAdapter();
  return new LocalCascadeProvider({
    serverUrl: serverUrl(),
    audio,
    createSession: (opts) => cloud.voiceSession(opts),
  });
}

function pickProvider(
  path: VoicePath,
  cloudProvider: CloudProviderId | undefined,
  sessionOptions: SessionOptions,
  audio: AudioAdapter,
): VoiceProvider {
  if (process.env.EXPO_PUBLIC_VOICE === 'fake') return new FakeVoiceProvider(systemClock);
  if (path === 'browser') {
    return new BrowserCascadeProvider({ audio, debug: debugOverride() });
  }
  if (path === 'byok') {
    // R4-B2: the learner's own OpenAI key, read from device storage
    // (byokKey.ts) — never from the persisted store, never logged. The
    // availability gate only picks this path after `hasByokKey()` resolved
    // true, which warms `cachedByokKey()`; a null here means the key was
    // removed between the gate and this call, so fall back to the default
    // local provider rather than constructing a provider with no
    // credentials (which would fail opaquely on every request — the 401
    // body is unreadable browser-direct, see docs/byok.md).
    const apiKey = cachedByokKey();
    if (apiKey) {
      return new OpenAIDirectProvider({ apiKey, audio });
    }
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
    return cloudCascadeProvider(audio);
  }
  return new LocalCascadeProvider({ serverUrl: serverUrl(), audio });
}

interface ActiveSession {
  bookId: string;
  chapterId: string;
  provider: VoiceProvider;
  unsubscribe: () => void;
}

type StartSessionParams = Parameters<typeof startSession>[0];

let active: ActiveSession | null = null;
// run7/F1 directive 4: remembered so `retry()` can re-enter the exact same
// book/chapter/mode after a connection failure, without the caller (the
// voice screen) having to reconstruct `SessionOptions` itself. Cleared by
// `endSession()` (a deliberate end, not a failure) so a stale retry can
// never fire after the learner has actually left.
let lastStartParams: StartSessionParams | null = null;

/** Tears down the live provider without touching the store's transcript or
 * error state — `endSession()` layers that on top for a deliberate end;
 * `retry()` skips it so `captions` (CaptionEntry[]) survives a reconnect. */
function teardownActive(): void {
  if (!active) return;
  const { provider, unsubscribe } = active;
  unsubscribe();
  void provider.disconnect();
  active = null;
  // run7/G directive 2: release the audio-arbitration bus if this session
  // was still holding it (e.g. torn down mid-speech) — releaseAudio is a
  // no-op if 'tutor' isn't the current owner, so this is safe unconditionally.
  releaseAudio('tutor');
}

export function activeBookId(): string | undefined {
  return active?.bookId;
}

export function getProvider(): VoiceProvider | null {
  return active?.provider ?? null;
}

/** Starts a new session, ending any previous one first. */
export function startSession(params: {
  bookId: string;
  /** run7/G directive 1(d): the book's real title (scout-T-tutor.md §4's
   * id-vs-title finding) — threaded into `SessionOptions.bookTitle` for the
   * prompt's "Book:" line. Optional; providers fall back to `bookId`. */
  bookTitle?: string;
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
  lastStartParams = params;
  if (active) endSession();
  beginSession(params);
}

/**
 * run7/F1 directive 4: reconnects for the same book/chapter/mode after a
 * connection failure or a `reconnecting` state, without wiping
 * `useSottoStore`'s `captions`/`voiceError` — that's what makes this
 * different from calling `startSession(lastStartParams)` again, which goes
 * through `endSession()`'s `clearSessionEphemeral()` and would lose the
 * transcript the learner was mid-conversation on. A no-op when nothing has
 * ever been started (nothing to retry) or after a deliberate `endSession()`
 * (which clears `lastStartParams` for exactly this reason).
 */
export function retry(): void {
  if (!lastStartParams) return;
  teardownActive();
  useSottoStore.getState().setVoiceError(null);
  useSottoStore.getState().setLimitReason(null);
  beginSession(lastStartParams);
}

/** run7/F1: the tap action for a `playback_blocked` error event. */
export function resumePlayback(): void {
  active?.provider.resumePlayback?.();
}

function beginSession(params: StartSessionParams): void {
  const { bookId, bookTitle, chapterId, mode, learner, passage, savedWords } = params;
  const sessionOptions: SessionOptions = {
    bookId,
    bookTitle,
    chapterId,
    mode,
    learner,
    passage,
    savedWords,
  };
  const ctx = createToolContext(
    useSottoStore,
    bookId,
    chapterId,
    learner.learningLocale,
    learner.explanationLocale,
  );

  // R6-B3: one gated adapter per session, shared by every cascade provider
  // this session might construct (the initial pick and, for a failed
  // Realtime attempt, its cascade fallback) — the Realtime provider itself
  // uses WebRTC directly and has no local capture to gate, so it always
  // reports `captureReady`. `listeningGate` also handles the local path's
  // one-shot `listening` announcement (apps/server/src/voice/session.ts's
  // constructor sends it once, at websocket-session creation, and never
  // repeats it): a `listening` gated down to `connecting` is flushed back
  // to `listening` the moment `startCapture` actually resolves, rather
  // than leaving the screen stuck at `connecting` forever.
  const isFakeProvider = process.env.EXPO_PUBLIC_VOICE === 'fake';
  const listeningGate = createListeningGate(() => gatedAudio?.captureReady() ?? true);
  const gatedAudio: ReturnType<typeof wrapAudioForGating> | null = isFakeProvider
    ? null
    : wrapAudioForGating(createAudioAdapter(), () => {
        const flushed = listeningGate.onCaptureReady();
        if (flushed) useSottoStore.getState().setVoiceState(flushed);
      });

  const attach = (provider: VoiceProvider, isRealtimeAttempt: boolean): void => {
    const { unsubscribe } = createVoiceController(provider, ctx, {
      onState: (state) => {
        const mapped = isRealtimeAttempt ? state : listeningGate.onProviderState(state);
        // run7/G directive 2: register tutor speech with lane D's
        // audio-arbitration bus (src/platform/audioBus.ts) so it and
        // narration/word-tap audio (src/platform/audio.ts, both already
        // wired to the bus) never sound at once. Claiming 'tutor' while
        // speaking lets a narration/word tap cut this session's TTS
        // mid-sentence (their own claimAudio call invokes the `stop`
        // callback below, i.e. `provider.interrupt()`); claiming again on
        // every subsequent 'speaking' state cuts back into whatever
        // narration/word audio started since the last time this session
        // spoke. Any other state releases the bus (a no-op if this session
        // wasn't the current owner).
        if (mapped === 'speaking') claimAudio('tutor', () => provider.interrupt());
        else releaseAudio('tutor');
        useSottoStore.getState().setVoiceState(mapped);
      },
      onCaption: (entry) => {
        useSottoStore.getState().pushCaption(entry);
        if (entry.speaker === 'tutor' && entry.final) {
          useSottoStore.getState().patchSessionRecord({ transcriptSummary: entry.text });
        }
      },
      onReading: (tokenIds) => useSottoStore.getState().setReadingTokenIds(tokenIds),
      onLimit: (reason) => useSottoStore.getState().setLimitReason(reason),
      onError: (entry) => {
        useSottoStore.getState().setVoiceError({
          code: entry.code,
          message: entry.message,
          recoverable: entry.recoverable,
        });
        // BUGS-TUTOR-RUN5.md #3: a recoverable error (429, network blip)
        // returns the session straight to `listening` with no `isBroken`
        // panel — previously the learner just got silence with no
        // indication anything happened. The non-recoverable case still
        // gets its own dedicated panel (voice screen's `isBroken`), so it
        // does not need a caption too.
        if (entry.recoverable) {
          useSottoStore.getState().pushCaption({
            speaker: 'tutor',
            text: 'Sorry, something went wrong there. Please try again.',
            final: true,
          });
        }
      },
      onToolEvent: (entry) => useSottoStore.getState().pushToolEvent(entry),
      onUsage: (entry) => useSottoStore.getState().setRemainingSeconds(entry.remainingSeconds),
    });

    active = { bookId, chapterId, provider, unsubscribe };

    void provider.connect(sessionOptions).catch(() => {
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
      attach(cloudCascadeProvider(gatedAudio!.adapter), false);
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

  const provider = pickProvider(
    params.path ?? 'local',
    params.cloudProvider,
    sessionOptions,
    gatedAudio?.adapter as AudioAdapter,
  );
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

/** run7/G directive 1(a): the speaker/output toggle — mutes tutor playback
 * without ending capture. No-op on a provider that doesn't implement it
 * (Realtime's `<audio>` element, the fake provider). */
export function setOutputMuted(muted: boolean): void {
  active?.provider.setOutputMuted?.(muted);
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

/** run7/G directive 1(b): the Replay action on a `notSpoken` transcript
 * turn — re-synthesizes and plays that exact sentence. No-op on a provider
 * that never emits `notSpoken` in the first place (only `OpenAIDirectProvider`
 * does today). */
export function replaySentence(text: string): void {
  active?.provider.replaySentence?.(text);
}

export function sendText(text: string): void {
  active?.provider.sendText(text);
}

export function endSession(): void {
  if (!active) return;
  teardownActive();
  lastStartParams = null;
  useSottoStore.getState().setSessionRecord(null);
  useSottoStore.getState().clearSessionEphemeral();
}
