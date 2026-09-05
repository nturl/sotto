/**
 * `@sotto/content/import/parse` — the client-safe subset of the import
 * library: format parsing + language detection, no Node builtins anywhere
 * in this module's graph (fflate/fast-xml-parser are pure JS), so Metro
 * can bundle it for apps/client/app/import/index.tsx's preview step
 * (parses the picked file locally, before any network call reaches the
 * server's LLM/TTS/STT-backed `POST /import`). The full pipeline
 * (`importBook`, which needs Node's fs/crypto for narration/gloss caching)
 * stays under the `@sotto/content/import` subpath, for server/CLI only.
 */
export { detectFormat, parseSource } from './dispatch.ts';
export { parseEpub } from './epub.ts';
export { parseMarkdown } from './markdown.ts';
export { parseText } from './text.ts';
export { detectLanguage } from '../detect.ts';
export { ImportError } from '../types.ts';
export type { DetectionResult } from '../detect.ts';
export type { ImportErrorCode, ParsedChapter, ParsedDocument } from '../types.ts';
