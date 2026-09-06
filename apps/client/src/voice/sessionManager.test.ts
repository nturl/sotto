/**
 * Covers review finding #2 (ADVERSARIAL-REVIEW.md §1.2): tapping a tutor-mode
 * chip must update `sessionRecord.mode` — the field `SessionBar` and the
 * voice screen's chip highlight both read — not just tell the provider.
 *
 * Mocks `../state/store` with an isolated in-memory store (same pattern as
 * toolContext.test.ts) rather than the real singleton, so the test never
 * touches the native persistence module. `EXPO_PUBLIC_VOICE=fake` makes
 * sessionManager pick FakeVoiceProvider (no network/audio adapter).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSottoStore } from '../state/createStore';
import type { Persistence } from '../platform/persistence.types';
import { __resetAudioBusForTests, currentAudioOwner } from '../platform/audioBus';

function fakePersistence(): Persistence {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}

const testStore = createSottoStore(fakePersistence());

vi.mock('../state/store', () => ({
  useSottoStore: testStore.useStore,
}));

// sessionManager imports this eagerly to build a LocalCascadeProvider; the
// native implementation pulls in expo-audio, which throws (`__DEV__ is not
// defined`) outside a real Expo/RN host. EXPO_PUBLIC_VOICE=fake means this
// factory is never actually called, so a stub is enough.
vi.mock('../platform/audio-adapter', () => ({
  createAudioAdapter: () => ({
    startCapture: async () => {},
    stopCapture: async () => {},
    playPcm: () => {},
    stopPlayback: () => {},
  }),
}));

const ORIGINAL_VOICE_ENV = process.env.EXPO_PUBLIC_VOICE;

beforeEach(() => {
  process.env.EXPO_PUBLIC_VOICE = 'fake';
});

afterEach(() => {
  process.env.EXPO_PUBLIC_VOICE = ORIGINAL_VOICE_ENV;
});

const PASSAGE = { chapterTitle: 'Chapitre 1', sentences: [], positionTokenId: null };

describe('sessionManager.setMode', () => {
  it('patches sessionRecord.mode so the chip highlight and SessionBar label update', async () => {
    const sessionManager = await import('./sessionManager');

    sessionManager.startSession({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'read_to_me',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
    });

    expect(testStore.useStore.getState().sessionRecord?.mode).toBe('read_to_me');

    sessionManager.setMode('discuss');

    expect(testStore.useStore.getState().sessionRecord?.mode).toBe('discuss');

    sessionManager.endSession();
  });

  it('does nothing when there is no active session', async () => {
    const sessionManager = await import('./sessionManager');

    sessionManager.endSession(); // ensure no leftover session from another test
    expect(testStore.useStore.getState().sessionRecord).toBeNull();

    expect(() => sessionManager.setMode('discuss')).not.toThrow();
    expect(testStore.useStore.getState().sessionRecord).toBeNull();
  });
});

// BUGS-TUTOR-RUN5.md #3, second candidate mechanism: `failTurn` sets
// `voiceState` back to 'listening' for a recoverable error, so the voice
// screen's `isBroken` panel (gated on voiceState === 'error') never shows —
// a transient 429 or network blip during STT/LLM previously left the
// learner with dead silence and zero indication anything happened, reading
// as "the tutor ignored me". `onError` must surface a recoverable error
// somewhere the learner can see it even when the session stays usable.
describe('sessionManager onError', () => {
  afterEach(async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.endSession();
  });

  it('surfaces a recoverable error as a caption instead of failing silently', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
    });

    const provider = sessionManager.getProvider() as unknown as {
      emit: (e: { type: 'error'; code: string; message: string; recoverable: boolean }) => void;
    };
    const captionsBefore = testStore.useStore.getState().captions.length;
    provider.emit({
      type: 'error',
      code: 'stt_failed',
      message: 'network blip',
      recoverable: true,
    });

    const state = testStore.useStore.getState();
    expect(state.voiceError).toMatchObject({ code: 'stt_failed', recoverable: true });
    expect(state.captions.length).toBeGreaterThan(captionsBefore);
    expect(state.captions.at(-1)).toMatchObject({ speaker: 'tutor' });
  });

  it('does not caption a non-recoverable error (the broken-session panel handles that)', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
    });

    const provider = sessionManager.getProvider() as unknown as {
      emit: (e: { type: 'error'; code: string; message: string; recoverable: boolean }) => void;
    };
    const captionsBefore = testStore.useStore.getState().captions.length;
    provider.emit({
      type: 'error',
      code: 'provider_rejected_setting',
      message: 'bad key',
      recoverable: false,
    });

    expect(testStore.useStore.getState().captions.length).toBe(captionsBefore);
  });
});

// run7/F1 directive 4: `retry()` re-enters the same book/chapter after a
// connection failure without wiping the transcript the way calling
// `startSession()` again would (that goes through `endSession()`'s
// `clearSessionEphemeral()`).
describe('sessionManager.retry', () => {
  afterEach(async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.endSession();
  });

  it('reconnects for the same book/chapter without wiping the transcript', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
    });
    const firstProvider = sessionManager.getProvider();

    testStore.useStore.getState().pushCaption({ speaker: 'tutor', text: 'Bonjour', final: true });
    testStore.useStore
      .getState()
      .setVoiceError({ code: 'connection_lost', message: 'dropped', recoverable: true });
    const captionsBefore = testStore.useStore.getState().captions.length;

    sessionManager.retry();

    const state = testStore.useStore.getState();
    // The transcript survived — this is the whole point of retry() existing
    // instead of just calling startSession(lastParams) again.
    expect(state.captions.length).toBe(captionsBefore);
    expect(state.captions.at(-1)).toMatchObject({ text: 'Bonjour' });
    // The mid-session error panel's trigger is cleared so the reconnect
    // doesn't immediately look broken again.
    expect(state.voiceError).toBeNull();
    expect(state.sessionRecord?.bookId).toBe('fr-chat-botte');
    expect(state.sessionRecord?.chapterId).toBe('fr-chat-botte-01');
    // A fresh provider/connection, not the same dead one.
    expect(sessionManager.getProvider()).not.toBe(firstProvider);
  });

  it('is a no-op when nothing has ever been started', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.endSession();
    expect(() => sessionManager.retry()).not.toThrow();
    expect(testStore.useStore.getState().sessionRecord).toBeNull();
  });

  it('does nothing after a deliberate endSession (no stale retry)', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
    });
    sessionManager.endSession();

    sessionManager.retry();

    expect(testStore.useStore.getState().sessionRecord).toBeNull();
  });
});

// run7/F1 directive 2: the tap action for a `playback_blocked` error event.
describe('sessionManager.resumePlayback', () => {
  afterEach(async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.endSession();
  });

  it('delegates to the active provider', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
    });
    const provider = sessionManager.getProvider() as unknown as { resumePlayback?: () => void };
    let calls = 0;
    provider.resumePlayback = () => {
      calls += 1;
    };

    sessionManager.resumePlayback();

    expect(calls).toBe(1);
  });

  it('does nothing when there is no active session', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.endSession();
    expect(() => sessionManager.resumePlayback()).not.toThrow();
  });
});

// run7/G directive 1(a): the speaker/output toggle.
describe('sessionManager.setOutputMuted', () => {
  afterEach(async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.endSession();
  });

  it('delegates to the active provider', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
    });
    const provider = sessionManager.getProvider() as unknown as {
      setOutputMuted?: (muted: boolean) => void;
    };
    const calls: boolean[] = [];
    provider.setOutputMuted = (muted) => calls.push(muted);

    sessionManager.setOutputMuted(true);

    expect(calls).toEqual([true]);
  });

  it('does nothing when there is no active session', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.endSession();
    expect(() => sessionManager.setOutputMuted(true)).not.toThrow();
  });
});

// run7/G directive 1(b): the Replay action on a `notSpoken` transcript turn.
describe('sessionManager.replaySentence', () => {
  afterEach(async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.endSession();
  });

  it('delegates the exact sentence text to the active provider', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
    });
    const provider = sessionManager.getProvider() as unknown as {
      replaySentence?: (text: string) => void;
    };
    const calls: string[] = [];
    provider.replaySentence = (text) => calls.push(text);

    sessionManager.replaySentence('Bonjour, comment ça va ?');

    expect(calls).toEqual(['Bonjour, comment ça va ?']);
  });

  it('does nothing when there is no active session', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.endSession();
    expect(() => sessionManager.replaySentence('hi')).not.toThrow();
  });
});

// run7/G directive 2: tutor speech registers with lane D's audio-arbitration
// bus (src/platform/audioBus.ts) so narration/word-tap audio and tutor
// speech never sound at once.
describe('sessionManager audio-arbitration wiring', () => {
  beforeEach(() => {
    __resetAudioBusForTests();
  });

  afterEach(async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.endSession();
    __resetAudioBusForTests();
  });

  it("claims the bus as 'tutor' while the session is speaking, releases it otherwise", async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
    });
    expect(currentAudioOwner()).not.toBe('tutor');

    const provider = sessionManager.getProvider() as unknown as {
      emit: (e: { type: 'state'; state: string }) => void;
    };
    provider.emit({ type: 'state', state: 'speaking' });
    expect(currentAudioOwner()).toBe('tutor');

    provider.emit({ type: 'state', state: 'listening' });
    expect(currentAudioOwner()).not.toBe('tutor');
  });

  it('releases the bus on teardown even if the session was mid-speech', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
    });
    const provider = sessionManager.getProvider() as unknown as {
      emit: (e: { type: 'state'; state: string }) => void;
    };
    provider.emit({ type: 'state', state: 'speaking' });
    expect(currentAudioOwner()).toBe('tutor');

    sessionManager.endSession();
    expect(currentAudioOwner()).toBeNull();
  });

  it("a different owner claiming the bus invokes the tutor's stop callback (provider.interrupt)", async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
    });
    const provider = sessionManager.getProvider() as unknown as {
      emit: (e: { type: 'state'; state: string }) => void;
      interrupt: () => void;
    };
    let interrupted = 0;
    const originalInterrupt = provider.interrupt.bind(provider);
    provider.interrupt = () => {
      interrupted += 1;
      originalInterrupt();
    };
    provider.emit({ type: 'state', state: 'speaking' });
    expect(currentAudioOwner()).toBe('tutor');

    const { claimAudio } = await import('../platform/audioBus');
    claimAudio('narration', () => {});

    expect(interrupted).toBe(1);
    expect(currentAudioOwner()).toBe('narration');
  });
});
