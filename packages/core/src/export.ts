/**
 * Export/import (planning/CONTRACTS.md §3).
 */
import { z } from 'zod';
import type {
  ExportFile,
  ReadingProgress,
  SavedWord,
  UserPreferences,
  VoiceSessionRecord,
} from './models.ts';

const TutorModeSchema = z.enum(['read_to_me', 'read_with_me', 'pronunciation', 'discuss']);

const UserPreferencesSchema = z
  .object({
    interfaceLocale: z.string(),
    explanationLocale: z.string(),
    learningLocale: z.string(),
    level: z.enum(['A0', 'A1', 'A2']),
    immersionMode: z.boolean(),
    tutorVoice: z.string().optional(),
    defaultTutorMode: TutorModeSchema,
    captionsEnabled: z.boolean(),
    turnDetection: z.enum(['auto', 'push']),
    correctionFrequency: z.enum(['low', 'normal', 'high']),
    speakingPace: z.enum(['slow', 'normal']),
    narrationSpeed: z.union([z.literal(0.75), z.literal(1), z.literal(1.25)]),
    onboarded: z.boolean(),
  })
  .strict() satisfies z.ZodType<UserPreferences>;

const ReadingProgressSchema = z
  .object({
    bookId: z.string(),
    chapterId: z.string(),
    tokenId: z.string().optional(),
    audioPositionMs: z.number(),
    percentComplete: z.number(),
    updatedAt: z.string(),
    completedAt: z.string().optional(),
  })
  .strict() satisfies z.ZodType<ReadingProgress>;

const WordReviewSchema = z.object({
  ease: z.number(),
  intervalDays: z.number(),
  dueAt: z.string(),
  reps: z.number(),
  lapses: z.number(),
  lastRating: z.enum(['again', 'hard', 'easy']).optional(),
});

const SavedWordSchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    chapterId: z.string(),
    tokenId: z.string(),
    sentenceId: z.string(),
    sourceLocale: z.string(),
    explanationLocale: z.string(),
    sourceWord: z.string(),
    normalizedWord: z.string(),
    translation: z.string(),
    pronunciationGuide: z.string().optional(),
    contextSentence: z.string(),
    savedAt: z.string(),
    review: WordReviewSchema,
  })
  .strict() satisfies z.ZodType<SavedWord>;

const VoiceSessionRecordSchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    chapterId: z.string(),
    mode: TutorModeSchema,
    status: z.enum(['active', 'paused', 'ended']),
    startedAt: z.string(),
    endedAt: z.string().optional(),
    lastTokenId: z.string().optional(),
    transcriptSummary: z.string().optional(),
  })
  .strict() satisfies z.ZodType<VoiceSessionRecord>;

export const ExportFileSchema = z
  .object({
    format: z.literal('sotto-export'),
    version: z.number(),
    exportedAt: z.string(),
    preferences: UserPreferencesSchema,
    progress: z.array(ReadingProgressSchema),
    savedWords: z.array(SavedWordSchema),
    completedBooks: z.array(z.string()),
    sessions: z.array(VoiceSessionRecordSchema),
  })
  .strict();

export interface ExportState {
  preferences: UserPreferences;
  progress: ReadingProgress[];
  savedWords: SavedWord[];
  completedBooks: string[];
  sessions: VoiceSessionRecord[];
}

export function buildExport(state: ExportState, now: Date = new Date()): ExportFile {
  return {
    format: 'sotto-export',
    version: 1,
    exportedAt: now.toISOString(),
    preferences: state.preferences,
    progress: state.progress,
    savedWords: state.savedWords,
    completedBooks: state.completedBooks,
    sessions: state.sessions,
  };
}

export type ParseImportResult = { ok: true; data: ExportFile } | { ok: false; error: string };

export function parseImport(json: unknown): ParseImportResult {
  if (
    typeof json === 'object' &&
    json !== null &&
    'version' in json &&
    typeof (json as { version: unknown }).version === 'number' &&
    (json as { version: number }).version > 1
  ) {
    return { ok: false, error: 'import.unsupportedVersion' };
  }

  const parsed = ExportFileSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'import.invalid' };
  }
  return { ok: true, data: parsed.data as ExportFile };
}
