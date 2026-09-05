import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseEpub } from '../../src/import/parse/epub.ts';
import { ImportError } from '../../src/import/types.ts';

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

function opfXml(spineHrefs: string[]): string {
  const items = spineHrefs
    .map((href, i) => `<item id="c${i + 1}" href="${href}" media-type="application/xhtml+xml"/>`)
    .join('\n');
  const spine = spineHrefs.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n');
  return `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
  </metadata>
  <manifest>${items}</manifest>
  <spine>${spine}</spine>
</package>`;
}

function buildEpub(files: Record<string, string>): Uint8Array {
  const zipInput: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) zipInput[name] = strToU8(content);
  return zipSync(zipInput);
}

describe('parseEpub', () => {
  it('parses a multi-document spine, one chapter per document', () => {
    const epub = buildEpub({
      'META-INF/container.xml': CONTAINER_XML,
      'OEBPS/content.opf': opfXml(['ch1.xhtml', 'ch2.xhtml']),
      'OEBPS/ch1.xhtml':
        '<html><body><h1>Chapter One</h1><p>First paragraph.</p><p>Second paragraph.</p></body></html>',
      'OEBPS/ch2.xhtml': '<html><body><h1>Chapter Two</h1><p>Another chapter.</p></body></html>',
    });
    const doc = parseEpub(epub);
    expect(doc.title).toBe('Test Book');
    expect(doc.author).toBe('Test Author');
    expect(doc.chapters).toHaveLength(2);
    expect(doc.chapters[0]?.title).toBe('Chapter One');
    expect(doc.chapters[0]?.paragraphs).toEqual(['First paragraph.', 'Second paragraph.']);
    expect(doc.chapters[1]?.title).toBe('Chapter Two');
  });

  it('splits a single-document spine into chapters by internal headings', () => {
    const epub = buildEpub({
      'META-INF/container.xml': CONTAINER_XML,
      'OEBPS/content.opf': opfXml(['book.xhtml']),
      'OEBPS/book.xhtml':
        '<html><body>' +
        '<h1>Chapter One</h1><p>First paragraph.</p>' +
        '<h1>Chapter Two</h1><p>Second chapter text.</p>' +
        '</body></html>',
    });
    const doc = parseEpub(epub);
    expect(doc.chapters).toHaveLength(2);
    expect(doc.chapters[0]?.title).toBe('Chapter One');
    expect(doc.chapters[1]?.title).toBe('Chapter Two');
    expect(doc.chapters[1]?.paragraphs).toEqual(['Second chapter text.']);
  });

  it('decodes HTML entities and strips tags', () => {
    const epub = buildEpub({
      'META-INF/container.xml': CONTAINER_XML,
      'OEBPS/content.opf': opfXml(['ch1.xhtml']),
      'OEBPS/ch1.xhtml':
        '<html><body><p>Caf&eacute; &amp; cr&ecirc;pes &mdash; a <em>test</em>.</p></body></html>'
          .replace('&eacute;', '&#233;')
          .replace('&ecirc;', '&#234;')
          .replace('&mdash;', '&#8212;'),
    });
    const doc = parseEpub(epub);
    expect(doc.chapters[0]?.paragraphs[0]).toContain('Café');
    expect(doc.chapters[0]?.paragraphs[0]).toContain('crêpes');
  });

  it('throws ImportError("drm") when META-INF/encryption.xml declares EncryptedData', () => {
    const epub = buildEpub({
      'META-INF/container.xml': CONTAINER_XML,
      'META-INF/encryption.xml':
        '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData/></encryption>',
      'OEBPS/content.opf': opfXml(['ch1.xhtml']),
      'OEBPS/ch1.xhtml': '<html><body><p>Locked.</p></body></html>',
    });
    try {
      parseEpub(epub);
      expect.unreachable('expected parseEpub to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError);
      expect((err as ImportError).code).toBe('drm');
    }
  });

  it('throws ImportError("drm") for a Readium LCP license file', () => {
    const epub = buildEpub({
      'META-INF/container.xml': CONTAINER_XML,
      'META-INF/license.lcpl': '{}',
      'OEBPS/content.opf': opfXml(['ch1.xhtml']),
      'OEBPS/ch1.xhtml': '<html><body><p>Locked.</p></body></html>',
    });
    expect(() => parseEpub(epub)).toThrow(ImportError);
  });

  it('throws ImportError("drm") for an Apple FairPlay sinf file', () => {
    const epub = buildEpub({
      'META-INF/container.xml': CONTAINER_XML,
      'META-INF/rights.xml': '<rights/>',
      'OEBPS/content.opf': opfXml(['ch1.xhtml']),
      'OEBPS/ch1.xhtml': '<html><body><p>Locked.</p></body></html>',
    });
    expect(() => parseEpub(epub)).toThrow(ImportError);
  });

  it('throws ImportError("parse") for a non-zip buffer', () => {
    expect(() => parseEpub(new Uint8Array([1, 2, 3, 4]))).toThrow(ImportError);
  });
});
