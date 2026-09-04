/**
 * Domain models shared by the content pipeline, the client, and the server
 * (planning/CONTRACTS.md §2b, §3).
 */
import type { LanguageDefinition } from './languages.ts';

export type BookLevel = 'A0' | 'A1' | 'A2';
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
  chapters: ChapterSummary[];
}

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
  chapterCount: number;
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
