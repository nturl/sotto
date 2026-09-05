/**
 * Book import library (planning/LEDGER.md "R3-I Importer", PAID-TIER-PLAN.md
 * Lane I): shared types for parse/*, detect.ts and pipeline.ts.
 */
import type { Book, Chapter } from '@sotto/core';

/** A parsed chapter before tokenization/glossing/translation — just plain
 * text paragraphs, one string per paragraph, in reading order. */
export interface ParsedChapter {
  title: string;
  paragraphs: string[];
}

/** What every format parser (epub/text/markdown) produces. */
export interface ParsedDocument {
  /** Best-effort title from the source metadata/first heading, if any. */
  title?: string;
  /** Best-effort author from source metadata (EPUB dc:creator), if any. */
  author?: string;
  chapters: ParsedChapter[];
}

export type ImportErrorCode = 'drm' | 'unsupported' | 'empty' | 'parse';

/** Thrown by parsers/pipeline for conditions the UI must present specially
 * (DRM refusal in particular — see import/[jobId].tsx and IMPORT.md §5). */
export class ImportError extends Error {
  readonly code: ImportErrorCode;
  constructor(code: ImportErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ImportError';
    this.code = code;
  }
}

export type ImportStage = 'parsing' | 'detecting' | 'glossing' | 'translating' | 'narrating';

export interface ImportProgress {
  stage: ImportStage;
  /** 1-based chapter number this progress event refers to, when applicable
   * (glossing/translating/narrating are per-chapter; parsing/detecting are
   * whole-document). */
  chapter?: number;
  totalChapters?: number;
  done: number;
  total: number;
  etaMs?: number;
}

export interface ImportLlmOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface ImportTtsOptions {
  baseUrl: string;
  voice?: string;
  apiKey?: string;
}

export interface ImportSttOptions {
  baseUrl: string;
  apiKey?: string;
}

export type NarrationMode = 'none' | 'first' | 'all';

export interface ImportOptions {
  /** Content locale to import into, e.g. "fr-FR". Required — detection only
   * suggests one, the caller (UI/CLI) decides. */
  contentLocale: string;
  /** UI catalog locale the reader explains words in, e.g. "en". Reserved
   * for future per-import defaults; not currently read by the pipeline
   * (glosses/translations always cover every GLOSS_LOCALES entry, matching
   * the seeded-content pipeline). */
  explanationLocale?: string;
  glossLocales?: string[];
  level?: 'A0' | 'A1' | 'A2';
  llm: ImportLlmOptions;
  tts?: ImportTtsOptions;
  stt?: ImportSttOptions;
  narrate: NarrationMode;
  signal?: AbortSignal;
  onProgress?: (event: ImportProgress) => void;
}

export interface ImportStats {
  chapters: number;
  wordCount: number;
  wordTokenCount: number;
  missingGlosses: number;
  detectionConfidence: number;
  elapsedMs: {
    parsing: number;
    detecting: number;
    glossing: number;
    translating: number;
    narrating: number;
  };
}

export interface ImportAttribution {
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
}

export interface ImportResult {
  book: Book;
  chapters: Chapter[];
  /** chapter file name (e.g. "01.mp3") -> encoded audio bytes. Only present
   * for chapters narrate covered (per `opts.narrate`). */
  audio: Map<string, Uint8Array>;
  attribution: ImportAttribution;
  stats: ImportStats;
}
