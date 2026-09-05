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
