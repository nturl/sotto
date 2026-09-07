import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book, ReadingProgress, SavedWord, VoiceSessionRecord } from '@sotto/core';
import type { Persistence } from '../platform/persistence.types';
import { bookCacheUrls, createSottoStore, DEFAULT_PREFERENCES } from './createStore';
import { BYOK_STORAGE_KEY, removeByokKey } from '../voice/byokKey';

function fakeLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

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

  it('drops a stray non-final fragment that arrives after its own final (R-adversarial finding 2)', async () => {
    const persistence = createFakePersistence();
    const { useStore, hydrate } = createSottoStore(persistence);
    await hydrate();

    const full =
      "Oui, la Provence est en France. C'est une région dans le sud. " +
      "C'est célèbre pour son soleil et ses villages charmants. " +
      'As-tu envie de visiter la France un jour ?';
    useStore.getState().pushCaption({ speaker: 'tutor', text: full, final: true });
    // The server (or a second tool-loop pass) emits one more per-sentence
    // caption after the merged final — the reviewer's exact repro. It must
    // not become a second, duplicated tutor bubble.
    useStore.getState().pushCaption({
      speaker: 'tutor',
      text: "C'est célèbre pour son soleil et ses villages charmants.",
      final: false,
    });

    const captions = useStore.getState().captions;
    expect(captions).toHaveLength(1);
    expect(captions[0]!.final).toBe(true);
    expect(captions[0]!.text).toBe(full);
  });

  it('still appends a genuinely new non-final turn from the same speaker after a final', async () => {
    const persistence = createFakePersistence();
    const { useStore, hydrate } = createSottoStore(persistence);
    await hydrate();

    useStore.getState().pushCaption({ speaker: 'tutor', text: 'Bonjour.', final: true });
    useStore.getState().pushCaption({ speaker: 'tutor', text: 'Comment ç...', final: false });

    const captions = useStore.getState().captions;
    expect(captions.map((c) => ({ text: c.text, final: c.final }))).toEqual([
      { text: 'Bonjour.', final: true },
      { text: 'Comment ç...', final: false },
    ]);
  });
});

describe('private (imported) books', () => {
  const PRIVATE_BOOK = {
    schemaVersion: 1 as const,
    bookId: 'private-abcdef01',
    contentLocale: 'fr-FR',
    title: 'Mon livre',
    author: 'Anonymous',
    sourceEdition: 'Imported from "mon-livre.txt"',
    sourceUrl: '',
    sourceJurisdiction: 'Unknown',
    adaptationEditor: 'Imported by the reader (no editor)',
    reviewStatus: 'draft' as const,
    level: 'A1' as const,
    categories: ['daily' as const],
    estimatedMinutes: 3,
    localizedTitles: {},
    premise: {},
    summary: {},
    contentWarning: null,
    tutorNotes: { pronunciation: '', grammar: '', culture: '', commonErrors: '' },
    vocabulary: [],
    comprehension: [],
    license: { spdx: 'private', attribution: 'Uploaded by the reader for private use' },
    cover: 'cover.svg',
    chapters: [
      {
        id: 'private-abcdef01-01',
        title: 'Chapitre 1',
        order: 1,
        file: 'chapters/01.json',
        wordCount: 3,
      },
    ],
    private: true,
  };
  const PRIVATE_CHAPTER = {
    id: 'private-abcdef01-01',
    bookId: 'private-abcdef01',
    title: 'Chapitre 1',
    order: 1,
    blocks: [],
  };

  it('addPrivateBook adds it to the index and loadBook/loadChapter read it back without a server', async () => {
    const persistence = createFakePersistence();
    const { useStore, hydrate } = createSottoStore(persistence);
    await hydrate();

    await useStore.getState().addPrivateBook(PRIVATE_BOOK, [PRIVATE_CHAPTER]);

    expect(useStore.getState().privateBooks.map((b) => b.bookId)).toEqual(['private-abcdef01']);
    expect(useStore.getState().bookLocale('private-abcdef01')).toBe('fr-FR');

    // Fresh store over the same persistence — simulates a reload.
    const reopened = createSottoStore(persistence);
    await reopened.hydrate();
    expect(reopened.useStore.getState().privateBooks.map((b) => b.bookId)).toEqual([
      'private-abcdef01',
    ]);
    const book = await reopened.useStore.getState().loadBook('private-abcdef01');
    expect(book?.title).toBe('Mon livre');
    const chapter = await reopened.useStore
      .getState()
      .loadChapter('private-abcdef01', 'private-abcdef01-01', 'chapters/01.json');
    expect(chapter?.id).toBe('private-abcdef01-01');
  });

  it('removePrivateBook deletes the index entry, book, and every chapter key', async () => {
    const persistence = createFakePersistence();
    const { useStore, hydrate } = createSottoStore(persistence);
    await hydrate();
    await useStore.getState().addPrivateBook(PRIVATE_BOOK, [PRIVATE_CHAPTER]);

    await useStore.getState().removePrivateBook('private-abcdef01');

    expect(useStore.getState().privateBooks).toEqual([]);
    expect(await persistence.getItem('sotto.private.book.private-abcdef01')).toBeNull();
    expect(
      await persistence.getItem('sotto.private.chapter.private-abcdef01.private-abcdef01-01'),
    ).toBeNull();
    expect(await useStore.getState().loadBook('private-abcdef01')).toBeUndefined();
  });
});

describe('createSottoStore ownProviderStatus (run7 lane E, the settings/hub stale-control fix)', () => {
  it('defaults to disconnected, and one setter call is the single source every reader sees', async () => {
    const { useStore } = createSottoStore(createFakePersistence());
    expect(useStore.getState().ownProviderStatus).toBe('disconnected');

    // The guided flow's "Connect and use this key" action: one call updates
    // the field every screen (hub row, TutorModelsPanel, voice screen) reads
    // — this is the fix for the P0 "saved but the toggle still reads off"
    // defect (root cause: profile.tsx's own useState never re-ran).
    useStore.getState().setOwnProviderStatus('connected');
    expect(useStore.getState().ownProviderStatus).toBe('connected');
  });

  it('walks through every truthful state named in the run-7 card', async () => {
    const { useStore } = createSottoStore(createFakePersistence());
    const order: Array<ReturnType<typeof useStore.getState>['ownProviderStatus']> = [
      'connecting',
      'connected',
      'active',
      'invalid',
      'unavailable',
      'disconnected',
    ];
    for (const status of order) {
      useStore.getState().setOwnProviderStatus(status);
      expect(useStore.getState().ownProviderStatus).toBe(status);
    }
  });

  describe('survives reload (R-adversarial finding 1)', () => {
    let storage: Storage;

    beforeEach(() => {
      storage = fakeLocalStorage();
      vi.stubGlobal('localStorage', storage);
    });

    afterEach(async () => {
      await removeByokKey();
      vi.unstubAllGlobals();
    });

    it('derives connected on hydrate when a key is already stored on this device', async () => {
      storage.setItem(BYOK_STORAGE_KEY, 'sk-test-stored');
      const { useStore, hydrate } = createSottoStore(createFakePersistence());
      // Before hydrate resolves, the field still defaults the same way it
      // always has — this is not about the initial paint, only reload.
      await hydrate();
      expect(useStore.getState().ownProviderStatus).toBe('connected');
    });

    it('stays disconnected on hydrate when no key is stored', async () => {
      const { useStore, hydrate } = createSottoStore(createFakePersistence());
      await hydrate();
      expect(useStore.getState().ownProviderStatus).toBe('disconnected');
    });

    it('does not clobber a status the flow already set before hydrate ran', async () => {
      storage.setItem(BYOK_STORAGE_KEY, 'sk-test-stored');
      const { useStore, hydrate } = createSottoStore(createFakePersistence());
      useStore.getState().setOwnProviderStatus('invalid');
      await hydrate();
      // A key can be present yet rejected (401) — hydrate must not paper
      // over that with a bare "a key exists so it's connected" read.
      expect(useStore.getState().ownProviderStatus).toBe('invalid');
    });
  });
});

describe('bookCacheUrls (R6-C2 commit 3)', () => {
  const BASE_BOOK: Book = {
    schemaVersion: 1,
    bookId: 'fr-chat-botte',
    contentLocale: 'fr-FR',
    title: 'Le Chat botté',
    author: 'Charles Perrault',
    sourceEdition: '',
    sourceUrl: '',
    sourceJurisdiction: 'public-domain',
    adaptationEditor: '',
    reviewStatus: 'stable',
    level: 'A1',
    categories: ['tales'],
    estimatedMinutes: 10,
    localizedTitles: {},
    premise: {},
    summary: {},
    contentWarning: null,
    tutorNotes: { pronunciation: '', grammar: '', culture: '', commonErrors: '' },
    vocabulary: [],
    comprehension: [],
    license: { spdx: 'CC0-1.0', attribution: '' },
    cover: 'cover.svg',
    chapters: [{ id: 'c1', title: 'Chapitre 1', order: 1, file: 'chapters/01.json', wordCount: 3 }],
  };

  it('includes the word-audio sprite and index when the book has one', () => {
    const book: Book = {
      ...BASE_BOOK,
      wordAudio: { file: 'audio/words.mp3', index: 'audio/words.json', count: 42 },
    };
    const urls = bookCacheUrls('fr-FR', book);
    expect(urls).toContain(
      'http://localhost:8790/content/packs/fr-FR/books/fr-chat-botte/audio/words.mp3',
    );
    expect(urls).toContain(
      'http://localhost:8790/content/packs/fr-FR/books/fr-chat-botte/audio/words.json',
    );
  });

  it('omits word-audio urls when the book has none', () => {
    const urls = bookCacheUrls('fr-FR', BASE_BOOK);
    expect(urls.some((u) => u.includes('words.mp3') || u.includes('words.json'))).toBe(false);
  });
});
