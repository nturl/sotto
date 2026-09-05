/**
 * DRM-free EPUB parsing.
 *
 * Deps: `fflate` (a small, dependency-free, pure-JS zip reader — EPUB is a
 * zip container, and fflate's `unzipSync` needs no native addon, works
 * identically in Node and in a browser bundle if this library is ever run
 * client-side) and `fast-xml-parser` (a small, dependency-free, pure-JS
 * XML parser — used for container.xml/OPF/XHTML, all of which are XML;
 * both are already-vetted, widely used, MIT-licensed packages with no
 * further transitive deps of their own).
 */
import { unzipSync, type UnzipFileInfo } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { ImportError, type ParsedChapter, type ParsedDocument } from '../types.ts';
import {
  EPUB_INFLATION_RATIO,
  EPUB_MAX_ENTRIES,
  hardSplitParagraphs,
  MAX_CHAPTERS,
} from '../limits.ts';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'itemref', 'rootfile'].includes(name),
});

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

/** Normalizes to an array regardless of whether fast-xml-parser gave back
 * one object or an array (depends on whether isArray matched, and on
 * whether there was exactly one element). */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function joinPath(base: string, relative: string): string {
  if (relative.startsWith('/')) return relative.slice(1);
  const baseDir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const combined = (baseDir + relative).split('/');
  const out: string[] = [];
  for (const part of combined) {
    if (part === '.' || part === '') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

const ENCRYPTION_XML_NAME = 'META-INF/encryption.xml';

/**
 * DRM detection (planning/LEDGER.md R3-I): Adobe ADEPT / any generic
 * container-level encryption declares `META-INF/encryption.xml` with an
 * `<EncryptedData>` element; Apple FairPlay ships a `META-INF/sinf` (or
 * `rights.xml`) signature file; Readium LCP ships `META-INF/license.lcpl`.
 * Any of the three means the book cannot be parsed — refuse cleanly rather
 * than producing garbage from still-encrypted XHTML bytes.
 *
 * Runs on entry NAMES only (finding 7, adversarial review 3) — the caller
 * collects `names` from the zip's central directory without inflating any
 * entry, so a DRM'd (or zip-bomb) archive is refused before any real
 * decompression happens. The one exception is `encryption.xml` itself,
 * whose content (not just its presence) decides the verdict; the caller
 * inflates that single, bounded entry as part of the same name-collection
 * pass, never the rest of the archive.
 */
function detectDrm(names: string[], encryptionXmlContent: string | undefined): void {
  if (names.some((n) => /^META-INF\/license\.lcpl$/i.test(n))) {
    throw new ImportError('drm', 'this EPUB is protected by Readium LCP');
  }
  if (names.some((n) => /^META-INF\/(rights\.xml|.*sinf)$/i.test(n))) {
    throw new ImportError('drm', 'this EPUB is protected by Apple FairPlay');
  }
  if (encryptionXmlContent?.includes('EncryptedData')) {
    throw new ImportError('drm', 'this EPUB is protected by DRM (encryption.xml)');
  }
}

function findOpfPath(files: Record<string, Uint8Array>): string {
  const containerBytes = files['META-INF/container.xml'];
  if (!containerBytes) {
    throw new ImportError('parse', 'not a valid EPUB: missing META-INF/container.xml');
  }
  const container = xmlParser.parse(decode(containerBytes));
  const rootfile = asArray(container?.container?.rootfiles?.rootfile)[0];
  const opfPath = rootfile?.['@_full-path'];
  if (!opfPath || typeof opfPath !== 'string') {
    throw new ImportError('parse', 'not a valid EPUB: container.xml has no rootfile');
  }
  return opfPath;
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
}

interface Opf {
  title?: string;
  author?: string;
  manifest: Map<string, ManifestItem>;
  spineIds: string[];
}

/** dc:creator can come back as a plain string, or as `{ '#text': '...' }`
 * when the element carries attributes (e.g. opf:role). */
function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return textOf(value[0]);
  if (value && typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return textOf((value as Record<string, unknown>)['#text']);
  }
  return undefined;
}

function parseOpf(opfXml: string): Opf {
  const doc = xmlParser.parse(opfXml);
  const pkg = doc.package ?? {};
  const title = textOf(pkg.metadata?.['dc:title']);
  const author = textOf(pkg.metadata?.['dc:creator']);
  const items = asArray(pkg.manifest?.item);
  const manifest = new Map<string, ManifestItem>();
  for (const item of items) {
    const id = item['@_id'];
    const href = item['@_href'];
    const mediaType = item['@_media-type'] ?? '';
    if (id && href) manifest.set(id, { id, href, mediaType });
  }
  const spineIds = asArray(pkg.spine?.itemref)
    .map((ref) => ref['@_idref'])
    .filter((id): id is string => typeof id === 'string');
  return { title, author, manifest, spineIds };
}

/** Strips XHTML/HTML down to paragraph text: block-level tags become
 * paragraph breaks, everything else is dropped, entities are decoded. */
function xhtmlToParagraphs(xhtml: string): { paragraphs: string[]; headings: string[] } {
  // Drop non-content elements first so their text doesn't leak into paragraphs.
  let body = xhtml.replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  const headings: string[] = [];
  body = body.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_m, inner: string) => {
    const text = decodeEntities(stripTags(inner)).trim();
    if (text) headings.push(text);
    return `\n\n${text}\n\n`;
  });

  // Block-level boundaries become paragraph breaks.
  body = body.replace(/<\s*(p|div|br|li|blockquote)\b[^>]*\/?>/gi, '\n\n');
  body = body.replace(/<\/\s*(p|div|li|blockquote)\s*>/gi, '\n\n');

  const text = decodeEntities(stripTags(body));
  const paragraphs = hardSplitParagraphs(
    text
      .split(/\n\s*\n+/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 0),
  );

  return { paragraphs, headings };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)));
}

export function parseEpub(bytes: Uint8Array): ParsedDocument {
  // Pass 1: walk the central directory without inflating anything, except
  // encryption.xml itself (small, bounded) whose content the DRM check
  // needs. `filter` is called once per entry with metadata only; returning
  // false means fflate never decompresses that entry.
  const names: string[] = [];
  let namePass: Record<string, Uint8Array>;
  try {
    namePass = unzipSync(bytes, {
      filter: (info: UnzipFileInfo) => {
        names.push(info.name);
        return info.name === ENCRYPTION_XML_NAME;
      },
    });
  } catch (err) {
    throw new ImportError(
      'parse',
      `not a valid EPUB (zip read failed): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (names.length > EPUB_MAX_ENTRIES) {
    throw new ImportError('parse', `this EPUB has ${names.length} entries, more than supported`);
  }
  const encryptionXmlBytes = namePass[ENCRYPTION_XML_NAME];
  detectDrm(names, encryptionXmlBytes ? decode(encryptionXmlBytes) : undefined);

  // Pass 2: the archive is DRM-free and entry-count-bounded — now inflate
  // the rest, refusing once cumulative decompressed bytes pass a ceiling
  // relative to the archive's own (compressed) size, guarding against a
  // high-ratio zip bomb regardless of what any single entry declares.
  const inflationCeiling = Math.max(bytes.length, 1) * EPUB_INFLATION_RATIO;
  let cumulativeBytes = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (info: UnzipFileInfo) => {
        cumulativeBytes += info.originalSize;
        if (cumulativeBytes > inflationCeiling) {
          throw new ImportError('parse', 'this EPUB decompresses far beyond its archive size');
        }
        return true;
      },
    });
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError(
      'parse',
      `not a valid EPUB (zip read failed): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const opfPath = findOpfPath(files);
  const opfBytes = files[opfPath];
  if (!opfBytes) {
    throw new ImportError('parse', `EPUB is missing its package document (${opfPath})`);
  }
  const opf = parseOpf(decode(opfBytes));

  const spineHrefs = opf.spineIds
    .map((id) => opf.manifest.get(id))
    .filter((item): item is ManifestItem => !!item && /xhtml|html/.test(item.mediaType));

  if (spineHrefs.length === 0) {
    throw new ImportError('empty', 'this EPUB has no readable spine documents');
  }

  const documents = spineHrefs.map((item) => {
    const fullPath = joinPath(opfPath, item.href);
    const contentBytes = files[fullPath];
    if (!contentBytes) return { paragraphs: [], headings: [] };
    return xhtmlToParagraphs(decode(contentBytes));
  });

  // "Headings become chapter titles when the spine has a single document":
  // a one-XHTML-file EPUB (common for short public-domain texts) needs its
  // own internal <h1>/<h2> headings to define chapters; a multi-document
  // spine treats each spine item as one chapter already.
  let chapters: ParsedChapter[];
  if (documents.length === 1) {
    const doc = documents[0] as { paragraphs: string[]; headings: string[] };
    if (doc.headings.length > 1) {
      chapters = splitSingleDocByHeadings(doc.paragraphs, doc.headings);
    } else {
      chapters = [
        { title: doc.headings[0] ?? opf.title ?? 'Chapter 1', paragraphs: doc.paragraphs },
      ];
    }
  } else {
    chapters = documents.map((doc, i) => {
      const title = doc.headings[0] ?? `Chapter ${i + 1}`;
      // xhtmlToParagraphs emits each heading's text as its own paragraph
      // too (so a single-document spine can split on it) — for a
      // multi-document spine the first heading became this chapter's
      // title, so drop just that one paragraph to avoid repeating it.
      const paragraphs =
        doc.headings[0] !== undefined
          ? doc.paragraphs.filter((p, idx) => !(idx === 0 && p === doc.headings[0]))
          : doc.paragraphs;
      return { title, paragraphs };
    });
  }

  chapters = chapters.filter((c) => c.paragraphs.length > 0);
  if (chapters.length === 0) {
    throw new ImportError('empty', 'this EPUB has no readable text');
  }

  return { title: opf.title, author: opf.author, chapters };
}

/** A single-XHTML-document EPUB: paragraphs that are themselves a heading
 * text (xhtmlToParagraphs emits the heading text as its own paragraph)
 * become chapter boundaries. */
function splitSingleDocByHeadings(paragraphs: string[], headings: string[]): ParsedChapter[] {
  const headingSet = new Set(headings);
  const chapters: ParsedChapter[] = [];
  let currentTitle: string | undefined;
  let currentParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    if (headingSet.has(paragraph)) {
      if (currentTitle !== undefined || currentParagraphs.length > 0) {
        chapters.push({
          title: currentTitle ?? `Chapter ${chapters.length + 1}`,
          paragraphs: currentParagraphs,
        });
      }
      currentTitle = paragraph;
      currentParagraphs = [];
    } else {
      currentParagraphs.push(paragraph);
    }
  }
  if (currentTitle !== undefined || currentParagraphs.length > 0) {
    chapters.push({
      title: currentTitle ?? `Chapter ${chapters.length + 1}`,
      paragraphs: currentParagraphs,
    });
  }
  return chapters.filter((c) => c.paragraphs.length > 0);
}
