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
import { MAX_CHAPTERS, MAX_IMPORT_CHARS } from '../limits.ts';
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
  const parsed =
    format === 'epub'
      ? parseEpub(bytes)
      : format === 'md'
        ? parseMarkdown(new TextDecoder('utf-8').decode(bytes))
        : parseText(new TextDecoder('utf-8').decode(bytes));

  if (parsed.chapters.length > MAX_CHAPTERS) {
    throw new ImportError(
      'unsupported',
      `this book has ${parsed.chapters.length} chapters, more than the ${MAX_CHAPTERS} supported`,
    );
  }
  const totalChars = parsed.chapters.reduce(
    (sum, c) => sum + c.paragraphs.reduce((s, p) => s + p.length, 0),
    0,
  );
  if (totalChars > MAX_IMPORT_CHARS) {
    throw new ImportError(
      'unsupported',
      `this book is ${totalChars.toLocaleString()} characters, more than the ${MAX_IMPORT_CHARS.toLocaleString()} supported`,
    );
  }
  return parsed;
}
