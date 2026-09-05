/**
 * Finding 3 (adversarial review 3): pickProvider() (sessionManager.ts,
 * not exported) must construct a real OpenAIRealtimeProvider for the
 * cloud path when the signed-in learner's plan provider is
 * 'realtime-mini'/'realtime' AND the platform is web — and must NOT on
 * native (no WebRTC transport there), where it keeps the existing cloud
 * cascade path. Exercised through the public `startSession`/`getProvider`
 * surface with a fake CloudAdapter and a mocked `detectPlatform`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalCascadeProvider, OpenAIDirectProvider, OpenAIRealtimeProvider } from '@sotto/voice';
import { createSottoStore } from '../state/createStore';
import { removeByokKey, setByokKey } from './byokKey';
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

vi.mock('../platform/audio-adapter', () => ({
  createAudioAdapter: () => ({
    startCapture: async () => {},
    stopCapture: async () => {},
    playPcm: () => {},
    stopPlayback: () => {},
  }),
}));

let mockPlatform: 'web' | 'native' = 'web';
const fakeCloudAdapter = {
  enabled: true,
  realtimeSecret: vi.fn(async () => ({
    value: 'ek_test',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    model: 'gpt-realtime-mini',
    maxSeconds: 600,
    callId: 'call-1',
  })),
  realtimeEnd: vi.fn(async () => undefined),
  voiceSession: vi.fn(async () => ({
    sessionId: 's1',
    wsUrl: 'wss://cloud.test/ws',
    sampleRate: 16000,
    limits: { maxMs: 600_000, idleMs: 60_000 },
    provider: 'cascade-open',
    remainingSeconds: 600,
  })),
};

vi.mock('../cloud/provider', () => ({
  getCloudAdapter: () => fakeCloudAdapter,
  detectPlatform: () => mockPlatform,
}));

const PASSAGE = { chapterTitle: 'Chapter 1', sentences: [], positionTokenId: null };
const ORIGINAL_VOICE_ENV = process.env.EXPO_PUBLIC_VOICE;

beforeEach(() => {
  // These tests exercise real provider selection, not the fake shortcut
  // the rest of this suite uses.
  delete process.env.EXPO_PUBLIC_VOICE;
  mockPlatform = 'web';
});

afterEach(async () => {
  process.env.EXPO_PUBLIC_VOICE = ORIGINAL_VOICE_ENV;
  const sessionManager = await import('./sessionManager');
  sessionManager.endSession();
  await removeByokKey();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Minimal localStorage stand-in — vitest/Node has none, and byokKey.ts
 * reads `globalThis.localStorage` at call time (see byokKey.test.ts). */
function stubLocalStorage(): void {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  } as unknown as Storage);
}

describe('cloud voice provider selection (finding 3)', () => {
  it('constructs OpenAIRealtimeProvider for a realtime-capable plan on web', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'es-fabulas',
      chapterId: 'es-fabulas-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'es-419', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
      path: 'cloud',
      cloudProvider: 'realtime',
    });

    expect(sessionManager.getProvider()).toBeInstanceOf(OpenAIRealtimeProvider);
  });

  it('constructs OpenAIRealtimeProvider for realtime-mini too', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'es-fabulas',
      chapterId: 'es-fabulas-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'es-419', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
      path: 'cloud',
      cloudProvider: 'realtime-mini',
    });

    expect(sessionManager.getProvider()).toBeInstanceOf(OpenAIRealtimeProvider);
  });

  it('stays on the cascade broker for a cascade-only plan', async () => {
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'es-fabulas',
      chapterId: 'es-fabulas-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'es-419', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
      path: 'cloud',
      cloudProvider: 'cascade-openai',
    });

    expect(sessionManager.getProvider()).toBeInstanceOf(LocalCascadeProvider);
    expect(sessionManager.getProvider()).not.toBeInstanceOf(OpenAIRealtimeProvider);
  });

  it('never constructs OpenAIRealtimeProvider on native, even with a realtime plan', async () => {
    mockPlatform = 'native';
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'es-fabulas',
      chapterId: 'es-fabulas-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'es-419', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
      path: 'cloud',
      cloudProvider: 'realtime',
    });

    expect(sessionManager.getProvider()).toBeInstanceOf(LocalCascadeProvider);
    expect(sessionManager.getProvider()).not.toBeInstanceOf(OpenAIRealtimeProvider);
  });
});

describe('byok voice provider selection (R4-B2)', () => {
  it('constructs OpenAIDirectProvider when a key is stored on this device', async () => {
    stubLocalStorage();
    await setByokKey('sk-test-not-a-real-credential');
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'es-fabulas',
      chapterId: 'es-fabulas-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'es-419', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
      path: 'byok',
    });

    expect(sessionManager.getProvider()).toBeInstanceOf(OpenAIDirectProvider);
  });

  it('falls back to the local provider when the key was removed after the gate ran', async () => {
    stubLocalStorage();
    await removeByokKey();
    const sessionManager = await import('./sessionManager');
    sessionManager.startSession({
      bookId: 'es-fabulas',
      chapterId: 'es-fabulas-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'es-419', explanationLocale: 'en-US' },
      passage: PASSAGE,
      savedWords: [],
      path: 'byok',
    });

    expect(sessionManager.getProvider()).toBeInstanceOf(LocalCascadeProvider);
    expect(sessionManager.getProvider()).not.toBeInstanceOf(OpenAIDirectProvider);
  });
});
