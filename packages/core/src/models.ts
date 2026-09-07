/**
 * Domain models shared by the content pipeline, the client, and the server
 * (planning/CONTRACTS.md §2b, §3).
 */
import type { LanguageDefinition } from './languages.ts';

export const BOOK_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type BookLevel = (typeof BOOK_LEVELS)[number];
export type BookCategory =
  'tales' | 'fables' | 'adventure' | 'classics' | 'folk' | 'idioms' | 'daily';
export type ReviewStatus = 'draft' | 'reviewed' | 'stable';

export interface License {
  spdx: string;
  attribution: string;
}

export interface TutorNotesBlock {
  pronunciation: string;
  grammar: string;
  culture: string;
  commonErrors: string;
}

export interface VocabularyEntry {
  word: string;
  /** zh only: pronunciation aid for this headword. */
  pinyin?: string;
  gloss: Record<string, string>;
}

export interface ComprehensionQuestion {
  question: Record<string, string>;
}

export interface ChapterSummary {
  id: string;
  title: string;
  order: number;
  /** Path relative to the book dir, e.g. "chapters/01.json". */
  file: string;
  /** Path relative to the book dir, e.g. "audio/01.mp3". Absent when narration hasn't run for this locale. */
  audio?: string;
  durationMs?: number;
  wordCount: number;
  /**
   * STT/token alignment quality for this chapter's narration (set by
   * `sotto-content narrate` / `sotto-content align`). Absent when the
   * chapter hasn't been narrated yet.
   */
  alignment?: { matched: number; total: number; method: string };
}

/** `books/<bookId>/book.json` — bundle metadata minus chapters/glossary, plus generated fields. */
export interface Book {
  schemaVersion: 1;
  bookId: string;
  contentLocale: string;
  /** Set only on a generated script edition, e.g. "zh-TW". */
  edition?: string;
  /** Set only on a generated script edition: the bookId it was converted from. */
  sourceBookId?: string;
  title: string;
  author: string;
  sourceEdition: string;
  sourceUrl: string;
  sourceJurisdiction: string;
  adaptationEditor: string;
  reviewStatus: ReviewStatus;
  reviewedBy?: string;
  level: BookLevel;
  categories: BookCategory[];
  estimatedMinutes: number;
  localizedTitles: Record<string, string>;
  premise: Record<string, string>;
  summary: Record<string, string>;
  contentWarning: string | null;
  tutorNotes: TutorNotesBlock;
  vocabulary: VocabularyEntry[];
  comprehension: ComprehensionQuestion[];
  license: License;
  cover: string;
  /** See `CoverInk`. Present only when `cover` is hand-authored art. */
  coverInk?: CoverInk;
  chapters: ChapterSummary[];
  /**
   * Set by `sotto-content word-audio` (R3-W): a sprite of every unique
   * word token synthesized alone with Kokoro, for the reader's speaker
   * button to play a clean isolated pronunciation instead of a slice cut
   * out of the chapter narration. Absent until that command has run for
   * this book.
   */
  wordAudio?: {
    file: 'audio/words.mp3' | 'audio/words.wav';
    index: 'audio/words.json';
    count: number;
  };
  /**
   * R3-I importer: set on a book produced by `importBook` (packages/content/
   * src/import/pipeline.ts) from a reader-supplied file. Private books live
   * only in the client's on-device storage (never under packages/content/
   * packs), are never shared or deduplicated across readers, and are
   * deleted with the rest of the reader's data. Absent (not `false`) on
   * every seeded/community book.
   */
  private?: boolean;
}

/**
 * Which of the two text colours the app prints over a hand-authored cover's
 * bottom band (planning/design/COVERS-DIRECTIONS-SPEC.md, direction B). Set
 * from `packages/content/covers/covers.json` by `sotto-content build`, and
 * absent on a book whose cover is the deterministic generated one.
 */
export type CoverInk = 'ink' | 'canvas';

/** The condensed form of a Book listed in `pack.json`. */
export interface BookSummary {
  bookId: string;
  contentLocale: string;
  edition?: string;
  title: string;
  author: string;
  level: BookLevel;
  categories: BookCategory[];
  estimatedMinutes: number;
  localizedTitles: Record<string, string>;
  premise: Record<string, string>;
  reviewStatus: ReviewStatus;
  cover: string;
  /** See `Book.coverInk`. */
  coverInk?: CoverInk;
  chapterCount: number;
  /** See `Book.private`. */
  private?: boolean;
}

/** `pack.json` */
export interface Pack {
  schemaVersion: 1;
  locale: string;
  language: LanguageDefinition;
  books: BookSummary[];
  generatedAt: string;
}

/** `books/<bookId>/chapters/<nn>.json` */
export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  order: number;
  blocks: Block[];
}

export interface Block {
  id: string;
  sentences: Sentence[];
}

export interface Sentence {
  id: string;
  text: string;
  translations: Record<string, string>;
  tokens: Token[];
}

export interface Token {
  id: string;
  text: string;
  normalized: string;
  isWord: boolean;
  /**
   * WS-1 addition, not present in CONTRACTS §2b's Token shape as written:
   * whether whitespace preceded this token in the source sentence. Needed
   * to re-render latin-script text without losing/adding spaces around
   * punctuation and clitics. See the WS-1 report for the exact rationale.
   */
  spaceBefore: boolean;
  glosses?: Record<string, string>;
  pinyin?: string;
  startMs?: number;
  endMs?: number;
}

export interface ReadingProgress {
  bookId: string;
  chapterId: string;
  tokenId?: string;
  audioPositionMs: number;
  percentComplete: number;
  updatedAt: string;
  completedAt?: string;
}

export type ReviewRating = 'again' | 'hard' | 'easy';

export interface WordReview {
  ease: number;
  intervalDays: number;
  dueAt: string;
  reps: number;
  lapses: number;
  lastRating?: ReviewRating;
}

export interface SavedWord {
  id: string;
  bookId: string;
  chapterId: string;
  tokenId: string;
  sentenceId: string;
  sourceLocale: string;
  explanationLocale: string;
  sourceWord: string;
  normalizedWord: string;
  translation: string;
  pronunciationGuide?: string;
  contextSentence: string;
  savedAt: string;
  review: WordReview;
}

export type TutorMode = 'read_to_me' | 'read_with_me' | 'pronunciation' | 'discuss';

export interface UserPreferences {
  interfaceLocale: string;
  explanationLocale: string;
  learningLocale: string;
  level: BookLevel;
  immersionMode: boolean;
  tutorVoice?: string;
  defaultTutorMode: TutorMode;
  captionsEnabled: boolean;
  turnDetection: 'auto' | 'push';
  correctionFrequency: 'low' | 'normal' | 'high';
  speakingPace: 'slow' | 'normal';
  narrationSpeed: 0.75 | 1 | 1.25;
  onboarded: boolean;
  /** 'system' resolves to the OS/browser preference; absent on old exports
   * (client treats missing as 'system'). */
  colorScheme?: 'system' | 'light' | 'dark';
  /** In-browser tutor download size (packages/voice `TUTOR_TIERS`): the
   * 'standard' models run on a phone or an 8 GB laptop, 'large' listens and
   * answers better but needs a capable computer. Absent on old exports and
   * on any device that never opened the setting; the client treats missing
   * as 'standard', the same convention as `colorScheme`/'system'. */
  tutorModelTier?: 'standard' | 'large';
}

export interface VoiceSessionRecord {
  id: string;
  bookId: string;
  chapterId: string;
  mode: TutorMode;
  status: 'active' | 'paused' | 'ended';
  startedAt: string;
  endedAt?: string;
  lastTokenId?: string;
  transcriptSummary?: string;
}

export interface TutorEvent {
  id: string;
  sessionId: string;
  type: 'caption' | 'tool_call' | 'tool_result' | 'state' | 'error';
  speaker?: 'learner' | 'tutor';
  text?: string;
  payload?: unknown;
  tokenIds?: string[];
  createdAt: string;
}

export interface ExportFile {
  format: 'sotto-export';
  version: 1;
  exportedAt: string;
  preferences: UserPreferences;
  progress: ReadingProgress[];
  savedWords: SavedWord[];
  completedBooks: string[];
  sessions: VoiceSessionRecord[];
}
