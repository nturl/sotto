/**
 * Format dispatch: picks the right parser by file extension. Deliberately
 * has no Node-builtin imports (unlike pipeline.ts, which also pulls in
 * narrate.ts/gloss-fill.ts's `node:fs` usage) so it — together with
 * detect.ts and the three parse/*.ts files it calls — can be bundled for
 * the client (apps/client/app/import/index.tsx's preview step parses a
 * picked file locally, before any network call) via the `@sotto/content/
 * import/parse` subpath. `pipeline.ts`'s `parseSource` re-exports this
 * exact function rather than duplicating it, so the CLI/server and the
 * client's preview step share one implementation.
 */
import { ImportError, type ParsedDocument } from '../types.ts';
import { parseEpub } from './epub.ts';
import { parseMarkdown } from './markdown.ts';
import { parseText } from './text.ts';

export function detectFormat(filename: string): 'epub' | 'txt' | 'md' {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'epub') return 'epub';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'txt') return 'txt';
  throw new ImportError(
    'unsupported',
    `unsupported file type ".${ext}" — Sotto imports DRM-free EPUB, TXT, and Markdown`,
  );
}

export function parseSource(bytes: Uint8Array, filename: string): ParsedDocument {
  const format = detectFormat(filename);
  if (format === 'epub') return parseEpub(bytes);
  const text = new TextDecoder('utf-8').decode(bytes);
  return format === 'md' ? parseMarkdown(text) : parseText(text);
}
