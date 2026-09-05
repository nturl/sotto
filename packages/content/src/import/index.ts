/**
 * Public entry point for `@sotto/content/import` (planning/LEDGER.md
 * "R3-I Importer"): the library API apps/server and packages/content/src/
 * cli.ts's `import` command both build on.
 */
export { importBook, narrateChapter, parseSource } from './pipeline.ts';
export { detectLanguage } from './detect.ts';
export { ImportError } from './types.ts';
export type { DetectionResult } from './detect.ts';
export type {
  ImportAttribution,
  ImportErrorCode,
  ImportLlmOptions,
  ImportOptions,
  ImportProgress,
  ImportResult,
  ImportSttOptions,
  ImportStage,
  ImportStats,
  ImportTtsOptions,
  NarrationMode,
  ParsedChapter,
  ParsedDocument,
} from './types.ts';
export type { NarrateChapterOptions } from './pipeline.ts';
