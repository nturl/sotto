/**
 * Zustand store factory (CONTRACTS.md §4): preferences / library / progress
 * / vocabulary / session / ui slices, plus a persistence layer built on a
 * `Persistence` adapter (`apps/client/src/platform/persistence.{web,native}`).
 *
 * Factory shape (rather than one module-level singleton) so tests can pass
 * an in-memory `Persistence` fake without needing Metro's platform-extension
 * resolution (`.web.ts`/`.native.ts`), which plain Node/vitest doesn't do —
 * `state/store.ts` is the thin singleton the app actually imports.
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import {
  scheduleReview,
  type Book,
  type BookSummary,
  type Chapter,
  type Pack,
  type ReadingProgress,
  type ReviewRating,
  type SavedWord,
  type UserPreferences,
  type VoiceSessionRecord,
} from '@sotto/core';
import type { Persistence } from '../platform/persistence.types';
import { warmBookCache } from '../platform/swCache';
import { assetUrl, fetchBook, fetchChapter, fetchPacks } from './contentApi';
import { PRIVATE_INDEX_KEY, privateBookKey, privateChapterKey } from '../import/privateKeys';
import {
  type CaptionEntry,
  type LoadStatus,
  type ToastEntry,
  type ToolEventEntry,
  type VoiceState,
  genId,
} from './types';

export const DEFAULT_PREFERENCES: UserPreferences = {
  interfaceLocale: 'fr',
  explanationLocale: 'en',
  learningLocale: 'fr-FR',
  level: 'A1',
  immersionMode: false,
  defaultTutorMode: 'read_to_me',
  captionsEnabled: true,
  turnDetection: 'auto',
  correctionFrequency: 'normal',
  speakingPace: 'normal',
  narrationSpeed: 1,
  onboarded: false,
  colorScheme: 'system',
};

const MAX_CAPTIONS = 50;
const MAX_TOOL_EVENTS = 20;

const KEYS = {
  preferences: 'sotto.preferences',
  progress: 'sotto.progress',
  vocabulary: 'sotto.vocabulary',
  session: 'sotto.session',
  privateIndex: PRIVATE_INDEX_KEY,
} as const;

export interface SottoState {
  // ---- preferences ----
  preferences: UserPreferences;
  setPreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void;
  setPreferences(partial: Partial<UserPreferences>): void;

  // ---- library ----
  packs: Pack[];
  packsStatus: LoadStatus;
  books: Record<string, Book>;
  chapters: Record<string, Chapter>;
  loadPacks(): Promise<void>;
  loadBook(bookId: string): Promise<Book | undefined>;
  loadChapter(bookId: string, chapterId: string, file: string): Promise<Chapter | undefined>;
  bookLocale(bookId: string): string | undefined;

  // ---- private (imported) books (R3-I) ----
  /** Index of every private book on this device (BookSummary, private:
   * true). Book/chapter JSON itself lives under `sotto.private.book.<id>`/
   * `sotto.private.chapter.<id>.<chapterId>` via the same Persistence
   * adapter — never fetched from a server, never in packages/content/packs. */
  privateBooks: BookSummary[];
  /** Persists a freshly-imported (or newly-narrated) book + its chapters
   * and adds/updates it in the private index. Audio bytes are stored
   * separately by the caller via import/privateAudio.{web,native}.ts —
   * this only handles the Persistence-adapter (string) side. */
  addPrivateBook(book: Book, chapters: Chapter[]): Promise<void>;
  /** Deletes every `sotto.private.*` key for one book (book, all chapters,
   * index entry). Does not touch audio — the caller deletes that first via
   * import/privateAudio.{web,native}.ts's `deleteAudioAssets`, which needs
   * the book's own chapter/audio file list before it's gone. */
  removePrivateBook(bookId: string): Promise<void>;

  // ---- progress ----
  progress: Record<string, ReadingProgress>;
  completedBooks: string[];
  setProgress(progress: ReadingProgress): void;
  markCompleted(bookId: string): void;

  // ---- vocabulary ----
  savedWords: SavedWord[];
  saveWord(word: SavedWord): void;
  removeWord(ref: { savedWordId?: string; tokenId?: string; bookId?: string }): boolean;
  rateWord(savedWordId: string, rating: ReviewRating, now?: Date): void;

  // ---- session (voice) ----
  sessionRecord: VoiceSessionRecord | null;
  voiceState: VoiceState;
  captions: CaptionEntry[];
  lastToolEvents: ToolEventEntry[];
  /** Live UI state driven by tool calls / `reading` events — not part of
   * CONTRACTS §4's literal session-slice field list, but needed so the
   * voice screen can re-derive its display after a background session
   * resumes in a fresh component mount (see sessionManager.ts). Ephemeral,
   * never persisted. */
  readingTokenIds: string[];
  explanation: { tokenId?: string; title: string; body: string; kind: string } | null;
  voiceError: { code?: string; message: string; recoverable: boolean } | null;
  // 'cap' (R3-S): the cloud voice path's minute cap ran out mid-session
  // (CLOUD-API.md `{t:'limit', reason:'cap'}`).
  limitReason: 'max_duration' | 'idle' | 'cap' | null;
  /** R3-S: cloud-path minutes-remaining, from `{t:'usage'}` messages. Null
   * on every non-cloud path (nothing ever sets it). */
  remainingSeconds: number | null;
  setSessionRecord(record: VoiceSessionRecord | null): void;
  patchSessionRecord(patch: Partial<VoiceSessionRecord>): void;
  setVoiceState(state: VoiceState): void;
  pushCaption(entry: Omit<CaptionEntry, 'id' | 'createdAt'>): void;
  pushToolEvent(entry: Omit<ToolEventEntry, 'id' | 'createdAt'>): void;
  setReadingTokenIds(ids: string[]): void;
  setExplanation(payload: SottoState['explanation']): void;
  setVoiceError(err: SottoState['voiceError']): void;
  setLimitReason(reason: SottoState['limitReason']): void;
  setRemainingSeconds(seconds: number | null): void;
  clearSessionEphemeral(): void;

  // ---- ui ----
  toasts: ToastEntry[];
  pushToast(message: string): string;
  dismissToast(id: string): void;

  // ---- bulk ----
  resetAll(): void;
  replaceUserData(data: {
    preferences: UserPreferences;
    progress: ReadingProgress[];
    savedWords: SavedWord[];
    completedBooks: string[];
  }): void;
}

export type SottoStore = UseBoundStore<StoreApi<SottoState>>;

function safeParse<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Every URL a just-opened book needs for offline reading (F1.2): its
 * book.json, every chapter file, the cover, and each chapter's narration
 * audio (absent for locales with no narration yet). Handed to the service
 * worker's `cache-book` message so a stranger's first opened book doesn't
 * need a second load before it's offline-ready. */
function bookCacheUrls(locale: string, book: Book): string[] {
  const urls = [
    assetUrl(locale, book.bookId, 'book.json'),
    assetUrl(locale, book.bookId, book.cover),
  ];
  for (const chapter of book.chapters) {
    urls.push(assetUrl(locale, book.bookId, chapter.file));
    if (chapter.audio) urls.push(assetUrl(locale, book.bookId, chapter.audio));
  }
  return urls;
}

export function createSottoStore(persistence: Persistence): {
  useStore: SottoStore;
  hydrate(): Promise<void>;
} {
  const useStore = create<SottoState>()((set, get) => ({
    preferences: { ...DEFAULT_PREFERENCES },
    setPreference: (key, value) =>
      set((s) => ({ preferences: { ...s.preferences, [key]: value } })),
    setPreferences: (partial) => set((s) => ({ preferences: { ...s.preferences, ...partial } })),

    packs: [],
    packsStatus: 'idle',
    books: {},
    chapters: {},
    privateBooks: [],
    bookLocale: (bookId) =>
      get().privateBooks.find((b) => b.bookId === bookId)?.contentLocale ??
      get().packs.find((p) => p.books.some((b) => b.bookId === bookId))?.locale,
    loadPacks: async () => {
      if (get().packsStatus === 'loading' || get().packsStatus === 'ready') return;
      set({ packsStatus: 'loading' });
      try {
        const packs = await fetchPacks();
        set({ packs, packsStatus: 'ready' });
      } catch {
        set({ packsStatus: 'error' });
      }
    },
    loadBook: async (bookId) => {
      const existing = get().books[bookId];
      if (existing) return existing;
      // Private books never live on a server — check on-device storage
      // first (and only), by convention (bookId prefix from pipeline.ts).
      if (bookId.startsWith('private-')) {
        const stored = safeParse<Book>(await persistence.getItem(privateBookKey(bookId)));
        if (stored) set((s) => ({ books: { ...s.books, [bookId]: stored } }));
        return stored;
      }
      const cacheKey = `sotto.content.book.${bookId}`;
      const cached = safeParse<Book>(await persistence.getItem(cacheKey));
      if (cached) {
        set((s) => ({ books: { ...s.books, [bookId]: cached } }));
        const cachedLocale = get().bookLocale(bookId);
        if (cachedLocale) void warmBookCache(bookCacheUrls(cachedLocale, cached));
        return cached;
      }
      const locale = get().bookLocale(bookId);
      if (!locale) return undefined;
      try {
        const book = await fetchBook(locale, bookId);
        set((s) => ({ books: { ...s.books, [bookId]: book } }));
        void persistence.setItem(cacheKey, JSON.stringify(book));
        void warmBookCache(bookCacheUrls(locale, book));
        return book;
      } catch {
        return undefined;
      }
    },
    loadChapter: async (bookId, chapterId, file) => {
      const cacheStateKey = `${bookId}:${chapterId}`;
      const existing = get().chapters[cacheStateKey];
      if (existing) return existing;
      if (bookId.startsWith('private-')) {
        const stored = safeParse<Chapter>(
          await persistence.getItem(privateChapterKey(bookId, chapterId)),
        );
        if (stored) set((s) => ({ chapters: { ...s.chapters, [cacheStateKey]: stored } }));
        return stored;
      }
      const cacheKey = `sotto.content.chapter.${bookId}.${chapterId}`;
      const cached = safeParse<Chapter>(await persistence.getItem(cacheKey));
      if (cached) {
        set((s) => ({ chapters: { ...s.chapters, [cacheStateKey]: cached } }));
        return cached;
      }
      const locale = get().bookLocale(bookId);
      if (!locale) return undefined;
      try {
        const chapter = await fetchChapter(locale, bookId, file);
        set((s) => ({ chapters: { ...s.chapters, [cacheStateKey]: chapter } }));
        void persistence.setItem(cacheKey, JSON.stringify(chapter));
        return chapter;
      } catch {
        return undefined;
      }
    },

    addPrivateBook: async (book, chapters) => {
      const summary: BookSummary = {
        bookId: book.bookId,
        contentLocale: book.contentLocale,
        edition: book.edition,
        title: book.title,
        author: book.author,
        level: book.level,
        categories: book.categories,
        estimatedMinutes: book.estimatedMinutes,
        localizedTitles: book.localizedTitles,
        premise: book.premise,
        reviewStatus: book.reviewStatus,
        cover: book.cover,
        chapterCount: book.chapters.length,
        private: true,
      };
      await persistence.setItem(privateBookKey(book.bookId), JSON.stringify(book));
      await Promise.all(
        chapters.map((chapter) =>
          persistence.setItem(privateChapterKey(book.bookId, chapter.id), JSON.stringify(chapter)),
        ),
      );
      set((s) => ({
        privateBooks: [...s.privateBooks.filter((b) => b.bookId !== summary.bookId), summary],
        books: { ...s.books, [book.bookId]: book },
        chapters: chapters.reduce(
          (acc, chapter) => ({ ...acc, [`${book.bookId}:${chapter.id}`]: chapter }),
          s.chapters,
        ),
      }));
    },
    removePrivateBook: async (bookId) => {
      const bookRaw = await persistence.getItem(privateBookKey(bookId));
      const book = safeParse<Book>(bookRaw);
      await persistence.removeItem(privateBookKey(bookId));
      if (book) {
        await Promise.all(
          book.chapters.map((c) => persistence.removeItem(privateChapterKey(bookId, c.id))),
        );
      }
      set((s) => ({
        privateBooks: s.privateBooks.filter((b) => b.bookId !== bookId),
        books: Object.fromEntries(Object.entries(s.books).filter(([id]) => id !== bookId)),
        chapters: Object.fromEntries(
          Object.entries(s.chapters).filter(([key]) => !key.startsWith(`${bookId}:`)),
        ),
      }));
    },

    progress: {},
    completedBooks: [],
    setProgress: (progress) =>
      set((s) => ({ progress: { ...s.progress, [progress.bookId]: progress } })),
    markCompleted: (bookId) =>
      set((s) => ({
        completedBooks: s.completedBooks.includes(bookId)
          ? s.completedBooks
          : [...s.completedBooks, bookId],
      })),

    savedWords: [],
    saveWord: (word) =>
      set((s) => ({
        savedWords: s.savedWords.some((w) => w.tokenId === word.tokenId && w.bookId === word.bookId)
          ? s.savedWords
          : [...s.savedWords, word],
      })),
    removeWord: (ref) => {
      const before = get().savedWords;
      const after = before.filter((w) => {
        if (ref.savedWordId) return w.id !== ref.savedWordId;
        if (ref.tokenId)
          return !(w.tokenId === ref.tokenId && (!ref.bookId || w.bookId === ref.bookId));
        return true;
      });
      if (after.length === before.length) return false;
      set({ savedWords: after });
      return true;
    },
    rateWord: (savedWordId, rating, now = new Date()) =>
      set((s) => ({
        savedWords: s.savedWords.map((w) =>
          w.id === savedWordId ? { ...w, review: scheduleReview(w.review, rating, now) } : w,
        ),
      })),

    sessionRecord: null,
    voiceState: 'idle',
    captions: [],
    lastToolEvents: [],
    readingTokenIds: [],
    explanation: null,
    voiceError: null,
    limitReason: null,
    remainingSeconds: null,
    setSessionRecord: (record) => set({ sessionRecord: record }),
    patchSessionRecord: (patch) =>
      set((s) => ({
        sessionRecord: s.sessionRecord ? { ...s.sessionRecord, ...patch } : s.sessionRecord,
      })),
    setVoiceState: (state) => set({ voiceState: state }),
    pushCaption: (entry) =>
      set((s) => {
        // ADVERSARIAL-REVIEW.md §1.9: the tutor (and the learner) streams an
        // utterance as several non-final fragments followed by one final
        // caption; appending unconditionally left both the fragments and
        // the final in the transcript (duplicated/triplicated captions).
        // The final one supersedes — by utterance, not by whole-list — so
        // only the trailing same-speaker, non-final run is dropped.
        let captions = s.captions;
        if (entry.final) {
          let cut = captions.length;
          while (
            cut > 0 &&
            !captions[cut - 1]!.final &&
            captions[cut - 1]!.speaker === entry.speaker
          ) {
            cut -= 1;
          }
          captions = captions.slice(0, cut);
        }
        return {
          captions: [...captions, { ...entry, id: genId('cap'), createdAt: Date.now() }].slice(
            -MAX_CAPTIONS,
          ),
        };
      }),
    pushToolEvent: (entry) =>
      set((s) => ({
        lastToolEvents: [
          ...s.lastToolEvents,
          { ...entry, id: genId('tool'), createdAt: Date.now() },
        ].slice(-MAX_TOOL_EVENTS),
      })),
    setReadingTokenIds: (ids) => set({ readingTokenIds: ids }),
    setExplanation: (payload) => set({ explanation: payload }),
    setVoiceError: (err) => set({ voiceError: err }),
    setLimitReason: (reason) => set({ limitReason: reason }),
    setRemainingSeconds: (seconds) => set({ remainingSeconds: seconds }),
    clearSessionEphemeral: () =>
      set({
        captions: [],
        lastToolEvents: [],
        voiceState: 'idle',
        readingTokenIds: [],
        explanation: null,
        voiceError: null,
        limitReason: null,
        remainingSeconds: null,
      }),

    toasts: [],
    pushToast: (message) => {
      const id = genId('toast');
      set((s) => ({ toasts: [...s.toasts, { id, message }] }));
      return id;
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    resetAll: () =>
      set({
        preferences: { ...DEFAULT_PREFERENCES },
        progress: {},
        completedBooks: [],
        savedWords: [],
        sessionRecord: null,
        captions: [],
        lastToolEvents: [],
        voiceState: 'idle',
        readingTokenIds: [],
        explanation: null,
        voiceError: null,
        limitReason: null,
        remainingSeconds: null,
      }),
    replaceUserData: (data) =>
      set({
        preferences: data.preferences,
        progress: Object.fromEntries(data.progress.map((p) => [p.bookId, p])),
        completedBooks: data.completedBooks,
        savedWords: data.savedWords,
      }),
  }));

  // ---- persistence: hydrate once, then auto-persist slices on change ----
  async function hydrate(): Promise<void> {
    const [prefsRaw, progressRaw, vocabRaw, sessionRaw, privateIndexRaw] = await Promise.all([
      persistence.getItem(KEYS.preferences),
      persistence.getItem(KEYS.progress),
      persistence.getItem(KEYS.vocabulary),
      persistence.getItem(KEYS.session),
      persistence.getItem(KEYS.privateIndex),
    ]);
    const preferences = safeParse<UserPreferences>(prefsRaw);
    const progressData = safeParse<{ progress: ReadingProgress[]; completedBooks: string[] }>(
      progressRaw,
    );
    const savedWords = safeParse<SavedWord[]>(vocabRaw);
    const sessionRecord = safeParse<VoiceSessionRecord>(sessionRaw);
    const privateBooks = safeParse<BookSummary[]>(privateIndexRaw);

    useStore.setState({
      preferences: preferences
        ? { ...DEFAULT_PREFERENCES, ...preferences }
        : { ...DEFAULT_PREFERENCES },
      progress: progressData
        ? Object.fromEntries(progressData.progress.map((p) => [p.bookId, p]))
        : {},
      completedBooks: progressData?.completedBooks ?? [],
      savedWords: savedWords ?? [],
      sessionRecord: sessionRecord ?? null,
      privateBooks: privateBooks ?? [],
    });

    let prev = useStore.getState();
    useStore.subscribe((state) => {
      if (state.preferences !== prev.preferences) {
        void persistence.setItem(KEYS.preferences, JSON.stringify(state.preferences));
      }
      if (state.progress !== prev.progress || state.completedBooks !== prev.completedBooks) {
        void persistence.setItem(
          KEYS.progress,
          JSON.stringify({
            progress: Object.values(state.progress),
            completedBooks: state.completedBooks,
          }),
        );
      }
      if (state.savedWords !== prev.savedWords) {
        void persistence.setItem(KEYS.vocabulary, JSON.stringify(state.savedWords));
      }
      if (state.sessionRecord !== prev.sessionRecord) {
        if (state.sessionRecord) {
          void persistence.setItem(KEYS.session, JSON.stringify(state.sessionRecord));
        } else {
          void persistence.removeItem(KEYS.session);
        }
      }
      if (state.privateBooks !== prev.privateBooks) {
        void persistence.setItem(KEYS.privateIndex, JSON.stringify(state.privateBooks));
      }
      prev = state;
    });
  }

  return { useStore, hydrate };
}
