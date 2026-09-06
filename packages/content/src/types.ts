/**
 * Source bundle schema (planning/CONTRACTS.md §2a) and a few pack-side
 * types that don't belong in @sotto/core (attribution metadata is
 * content-pipeline-only, not part of the app's domain model).
 */
import { z } from 'zod';

const GlossMap = z.record(z.string(), z.string());

export const SourceSentenceSchema = z
  .object({
    text: z.string().min(1),
    translation: GlossMap,
  })
  .strict();

export const SourceParagraphSchema = z
  .object({
    sentences: z.array(SourceSentenceSchema).min(1),
  })
  .strict();

export const SourceChapterSchema = z
  .object({
    title: z.string().min(1),
    paragraphs: z.array(SourceParagraphSchema).min(1),
  })
  .strict();

export const VocabularyEntrySchema = z
  .object({
    word: z.string().min(1),
    /** zh only: pronunciation aid for this headword. */
    pinyin: z.string().optional(),
    gloss: GlossMap,
  })
  .strict();

export const ComprehensionQuestionSchema = z
  .object({
    question: GlossMap,
  })
  .strict();

export const LicenseSchema = z
  .object({
    spdx: z.string().min(1),
    attribution: z.string().min(1),
  })
  .strict();

export const TutorNotesBlockSchema = z
  .object({
    pronunciation: z.string(),
    grammar: z.string(),
    culture: z.string(),
    commonErrors: z.string(),
  })
  .strict();

/** A glossary entry: gloss-locale -> translation, plus optional zh pinyin. */
export const GlossaryEntrySchema = z.record(z.string(), z.string());

export const SourceBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    bookId: z.string().regex(/^[a-z][a-z0-9-]*$/, 'bookId must be kebab-case'),
    contentLocale: z.string(),
    editions: z.array(z.string()).optional(),
    title: z.string().min(1),
    author: z.string().min(1),
    sourceEdition: z.string().min(1),
    sourceUrl: z.string().min(1),
    sourceJurisdiction: z.string().min(1),
    adaptationEditor: z.string().min(1),
    reviewStatus: z.enum(['draft', 'reviewed', 'stable']),
    reviewedBy: z.string().optional(),
    level: z.enum(['A0', 'A1', 'A2', 'B1', 'B2', 'C1']),
    categories: z
      .array(z.enum(['tales', 'fables', 'adventure', 'classics', 'folk', 'idioms', 'daily']))
      .min(1),
    estimatedMinutes: z.number().positive(),
    localizedTitles: GlossMap,
    premise: GlossMap,
    summary: GlossMap,
    contentWarning: z.string().nullable(),
    tutorNotes: TutorNotesBlockSchema,
    vocabulary: z.array(VocabularyEntrySchema).min(1),
    comprehension: z.array(ComprehensionQuestionSchema).min(1),
    license: LicenseSchema,
    chapters: z.array(SourceChapterSchema).min(1),
    glossary: z.record(z.string(), GlossaryEntrySchema),
    /** zh only: simplified word -> traditional word, used to derive a zh-TW edition. */
    hantOverrides: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type SourceBundle = z.infer<typeof SourceBundleSchema>;

/** `books/<bookId>/attribution.json` — machine-readable provenance + licenses. */
export interface AttributionFile {
  schemaVersion: 1;
  bookId: string;
  text: {
    author: string;
    sourceEdition: string;
    sourceUrl: string;
    sourceJurisdiction: string;
    adaptationEditor: string;
    license: { spdx: string; attribution: string };
  };
  glosses: {
    editor: string;
    license: { spdx: string; attribution: string };
  };
  cover: {
    generator: string;
    license: { spdx: string; attribution: string };
  };
  audio?: {
    engine: string;
    license: { spdx: string; attribution: string };
  };
}

export interface MissingGlossesFile {
  bookId: string;
  contentLocale: string;
  missingWords: string[];
}
