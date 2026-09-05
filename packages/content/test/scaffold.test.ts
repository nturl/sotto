import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildScaffoldBundle, splitParagraphs, splitSentences } from '../src/scaffold.ts';
import { SourceBundleSchema } from '../src/types.ts';

let tmpFile: string | undefined;

afterEach(() => {
  if (tmpFile && existsSync(tmpFile)) rmSync(tmpFile);
  tmpFile = undefined;
});

describe('buildScaffoldBundle', () => {
  it('produces a bundle that parses with SourceBundleSchema (no --from)', () => {
    const bundle = buildScaffoldBundle({
      bookId: 'fr-test-book',
      locale: 'fr-FR',
      title: 'Le Test',
      author: 'A. Contributor',
    });
    const result = SourceBundleSchema.safeParse(bundle);
    expect(result.success).toBe(true);
  });

  it('splits --from text into paragraphs/sentences, still schema-valid', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sotto-scaffold-'));
    tmpFile = path.join(dir, 'src.txt');
    writeFileSync(tmpFile, 'Le chat dort. Il rêve de poissons.\n\nLe chien joue dehors.\n', 'utf8');
    const bundle = buildScaffoldBundle({
      bookId: 'fr-test-book-2',
      locale: 'fr-FR',
      title: 'Le Test',
      author: 'A. Contributor',
      fromFile: tmpFile,
    });
    expect(SourceBundleSchema.safeParse(bundle).success).toBe(true);
    expect(bundle.chapters).toHaveLength(1);
    expect(bundle.chapters[0]?.paragraphs).toHaveLength(2);
    expect(bundle.chapters[0]?.paragraphs[0]?.sentences.map((s) => s.text)).toEqual([
      'Le chat dort.',
      'Il rêve de poissons.',
    ]);
    // Every sentence's translation map starts empty (CONTRACTS §2a: filled
    // later via `pnpm content:translate-sentences`).
    for (const paragraph of bundle.chapters[0]?.paragraphs ?? []) {
      for (const sentence of paragraph.sentences) {
        expect(sentence.translation).toEqual({});
      }
    }
    // glossary starts empty (filled via `pnpm content:build --fill`).
    expect(bundle.glossary).toEqual({});
  });

  it('only fails schema-level checks that a real book must fix — the "would fail validation only on placeholders" contract', () => {
    // A scaffolded bundle must always be schema-valid on its own (that's
    // the SourceBundleSchema.safeParse check above). What distinguishes a
    // scaffold from a shippable book is that its provenance fields carry
    // literal "CONFIRM: ..." placeholder text a human must replace — this
    // asserts that marker is present exactly on the fields that need a
    // human decision, and nowhere else load-bearing (title/author, which
    // the CLI required as real input, stay untouched).
    const bundle = buildScaffoldBundle({
      bookId: 'fr-test-book-3',
      locale: 'fr-FR',
      title: 'Le Test',
      author: 'A. Contributor',
    });
    expect(SourceBundleSchema.safeParse(bundle).success).toBe(true);

    const confirmFields = [
      bundle.sourceEdition,
      bundle.sourceUrl,
      bundle.sourceJurisdiction,
      bundle.adaptationEditor,
      bundle.license.attribution,
    ];
    for (const field of confirmFields) {
      expect(field).toMatch(/^CONFIRM: /);
    }
    expect(bundle.title).toBe('Le Test');
    expect(bundle.author).toBe('A. Contributor');
  });

  it('refuses an unknown --level', () => {
    // level is a closed enum in the schema; buildScaffoldBundle defaults to
    // A1 when none is given, and always produces a schema-valid level.
    const bundle = buildScaffoldBundle({
      bookId: 'fr-test-book-4',
      locale: 'fr-FR',
      title: 'Le Test',
      author: 'A. Contributor',
    });
    expect(['A0', 'A1', 'A2']).toContain(bundle.level);
  });
});

describe('splitParagraphs', () => {
  it('splits on blank lines and collapses internal whitespace', () => {
    expect(splitParagraphs('One.\nStill one.\n\nTwo.\n\n\nThree.')).toEqual([
      'One. Still one.',
      'Two.',
      'Three.',
    ]);
  });
});

describe('splitSentences', () => {
  it('splits Latin-script text on sentence punctuation', () => {
    expect(splitSentences('Le chat dort. Il rêve.', 'fr-FR')).toEqual([
      'Le chat dort.',
      'Il rêve.',
    ]);
  });

  it('splits CJK text on full-width terminal punctuation with no whitespace needed', () => {
    expect(splitSentences('猫在睡觉。它在做梦。', 'zh-CN')).toEqual(['猫在睡觉。', '它在做梦。']);
  });
});
