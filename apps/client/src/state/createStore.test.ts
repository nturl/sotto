import { describe, expect, it } from 'vitest';
import type { ReadingProgress, SavedWord, VoiceSessionRecord } from '@sotto/core';
import type { Persistence } from '../platform/persistence.types';
import { createSottoStore, DEFAULT_PREFERENCES } from './createStore';

function createFakePersistence(): Persistence {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}

const PROGRESS: ReadingProgress = {
  bookId: 'fr-chat-botte',
  chapterId: 'fr-chat-botte-01',
  audioPositionMs: 4200,
  percentComplete: 0.4,
  updatedAt: '2026-09-04T10:00:00.000Z',
};

const SAVED_WORD: SavedWord = {
  id: 'word-1',
  bookId: 'fr-chat-botte',
  chapterId: 'fr-chat-botte-01',
  tokenId: 'b1.s1.t1',
  sentenceId: 'b1.s1',
  sourceLocale: 'fr-FR',
  explanationLocale: 'en',
  sourceWord: 'meunier',
  normalizedWord: 'meunier',
  translation: 'miller',
  contextSentence: 'Un meunier vivait ici.',
  savedAt: '2026-09-04T10:00:00.000Z',
  review: { ease: 2.5, intervalDays: 0, dueAt: '2026-09-04T10:00:00.000Z', reps: 0, lapses: 0 },
};

const SESSION: VoiceSessionRecord = {
  id: 'session-1',
  bookId: 'fr-chat-botte',
  chapterId: 'fr-chat-botte-01',
  mode: 'discuss',
  status: 'paused',
  startedAt: '2026-09-04T10:00:00.000Z',
  transcriptSummary: 'On a parlé du chat.',
};

describe('createSottoStore persistence round trip', () => {
  it('persists preferences/progress/vocabulary/session and restores them into a fresh store', async () => {
    const persistence = createFakePersistence();

    const a = createSottoStore(persistence);
    await a.hydrate();
    a.useStore.getState().setPreference('learningLocale', 'es-419');
    a.useStore.getState().setProgress(PROGRESS);
    a.useStore.getState().saveWord(SAVED_WORD);
    a.useStore.getState().setSessionRecord(SESSION);

    // A second store sharing the same backing storage should hydrate to an
    // equivalent state — this is the actual "round trip" (write via one
    // store instance, read back via a fresh one), which is a closer
    // approximation of app-restart behavior than reading the first store's
    // own in-memory state back.
    const b = createSottoStore(persistence);
    await b.hydrate();
    const state = b.useStore.getState();

    expect(state.preferences).toEqual({ ...DEFAULT_PREFERENCES, learningLocale: 'es-419' });
    expect(state.progress[PROGRESS.bookId]).toEqual(PROGRESS);
    expect(state.savedWords).toEqual([SAVED_WORD]);
    expect(state.sessionRecord).toEqual(SESSION);
  });

  it('hydrates to defaults when storage is empty', async () => {
    const persistence = createFakePersistence();
    const { useStore, hydrate } = createSottoStore(persistence);
    await hydrate();
    const state = useStore.getState();

    expect(state.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(state.progress).toEqual({});
    expect(state.completedBooks).toEqual([]);
    expect(state.savedWords).toEqual([]);
    expect(state.sessionRecord).toBeNull();
  });

  it('clears the session key in storage when the session ends', async () => {
    const persistence = createFakePersistence();
    const { useStore, hydrate } = createSottoStore(persistence);
    await hydrate();
    useStore.getState().setSessionRecord(SESSION);
    useStore.getState().setSessionRecord(null);

    const fresh = createSottoStore(persistence);
    await fresh.hydrate();
    expect(fresh.useStore.getState().sessionRecord).toBeNull();
  });
});

describe('createSottoStore vocabulary + progress', () => {
  it('rateWord applies the core SM-2-lite scheduler', async () => {
    const persistence = createFakePersistence();
    const { useStore, hydrate } = createSottoStore(persistence);
    await hydrate();
    useStore.getState().saveWord(SAVED_WORD);

    useStore.getState().rateWord(SAVED_WORD.id, 'easy', new Date('2026-09-05T00:00:00.000Z'));
    const word = useStore.getState().savedWords[0]!;
    expect(word.review.reps).toBe(1);
    expect(word.review.lastRating).toBe('easy');
    expect(word.review.intervalDays).toBeGreaterThan(0);
  });

  it('removeWord by savedWordId and by tokenId both remove exactly one word', async () => {
    const persistence = createFakePersistence();
    const { useStore, hydrate } = createSottoStore(persistence);
    await hydrate();
    useStore.getState().saveWord(SAVED_WORD);

    expect(useStore.getState().removeWord({ tokenId: 'unknown' })).toBe(false);
    expect(useStore.getState().removeWord({ savedWordId: SAVED_WORD.id })).toBe(true);
    expect(useStore.getState().savedWords).toEqual([]);
  });

  it('setProgress + markCompleted track per-book progress and completion', async () => {
    const persistence = createFakePersistence();
    const { useStore, hydrate } = createSottoStore(persistence);
    await hydrate();
    useStore.getState().setProgress(PROGRESS);
    useStore.getState().markCompleted(PROGRESS.bookId);

    expect(useStore.getState().progress[PROGRESS.bookId]?.percentComplete).toBe(0.4);
    expect(useStore.getState().completedBooks).toEqual([PROGRESS.bookId]);
  });
});

// ADVERSARIAL-REVIEW.md §1.9: a streamed utterance's final caption must
// replace its own partial fragments, not pile up alongside them.
describe('createSottoStore pushCaption', () => {
  it("replaces the tutor's trailing streamed partials with the final caption", async () => {
    const persistence = createFakePersistence();
    const { useStore, hydrate } = createSottoStore(persistence);
    await hydrate();

    useStore
      .getState()
      .pushCaption({ speaker: 'tutor', text: 'La palabra "cigarra" está guardada.', final: false });
    useStore
      .getState()
      .pushCaption({ speaker: 'tutor', text: '¿Quieres que te explique algo más?', final: false });
    useStore.getState().pushCaption({
      speaker: 'tutor',
      text: 'La palabra "cigarra" está guardada. ¿Quieres que te explique algo más?',
      final: true,
    });

    const captions = useStore.getState().captions;
    expect(captions).toHaveLength(1);
    expect(captions[0]!.final).toBe(true);
    expect(captions[0]!.text).toBe(
      'La palabra "cigarra" está guardada. ¿Quieres que te explique algo más?',
    );
  });

  it("replaces the learner's own partial with their final, without touching an unrelated prior tutor line", async () => {
    const persistence = createFakePersistence();
    const { useStore, hydrate } = createSottoStore(persistence);
    await hydrate();

    useStore.getState().pushCaption({ speaker: 'tutor', text: 'Bonjour.', final: true });
    useStore.getState().pushCaption({ speaker: 'learner', text: 'Je vou...', final: false });
    useStore
      .getState()
      .pushCaption({ speaker: 'learner', text: 'Je voudrais un mot.', final: true });

    const captions = useStore.getState().captions;
    expect(captions.map((c) => ({ speaker: c.speaker, text: c.text, final: c.final }))).toEqual([
      { speaker: 'tutor', text: 'Bonjour.', final: true },
      { speaker: 'learner', text: 'Je voudrais un mot.', final: true },
    ]);
  });
});
