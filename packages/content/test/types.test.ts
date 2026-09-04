import { describe, expect, it } from 'vitest';
import { SourceBundleSchema } from '../src/types.ts';

function minimalBundle(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    bookId: 'fr-test-book',
    contentLocale: 'fr-FR',
    title: 'Test',
    author: 'Author',
    sourceEdition: 'Edition',
    sourceUrl: 'https://example.com',
    sourceJurisdiction: 'Public domain',
    adaptationEditor: 'Sotto contributors',
    reviewStatus: 'draft',
    level: 'A1',
    categories: ['tales'],
    estimatedMinutes: 5,
    localizedTitles: { en: 'Test' },
    premise: { en: 'A test.' },
    summary: { en: 'A test.' },
    contentWarning: null,
    tutorNotes: { pronunciation: '', grammar: '', culture: '', commonErrors: '' },
    vocabulary: [{ word: 'chat', gloss: { en: 'cat' } }],
    comprehension: [{ question: { en: '?' } }],
    license: { spdx: 'CC-BY-SA-4.0', attribution: 'Sotto contributors' },
    chapters: [
      {
        title: 'Ch1',
        paragraphs: [{ sentences: [{ text: 'Le chat.', translation: { en: 'The cat.' } }] }],
      },
    ],
    glossary: { le: { en: 'the' }, chat: { en: 'cat' } },
    ...overrides,
  };
}

describe('SourceBundleSchema', () => {
  it('accepts a minimal well-formed bundle', () => {
    const result = SourceBundleSchema.safeParse(minimalBundle());
    expect(result.success).toBe(true);
  });

  it('accepts a zh vocabulary entry with a pinyin field', () => {
    const result = SourceBundleSchema.safeParse(
      minimalBundle({ vocabulary: [{ word: '猫', pinyin: 'māo', gloss: { en: 'cat' } }] }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a bookId that is not kebab-case', () => {
    const result = SourceBundleSchema.safeParse(minimalBundle({ bookId: 'Fr_Test Book' }));
    expect(result.success).toBe(false);
  });

  it('rejects an unknown reviewStatus', () => {
    const result = SourceBundleSchema.safeParse(minimalBundle({ reviewStatus: 'published' }));
    expect(result.success).toBe(false);
  });

  it('rejects a missing license', () => {
    const bundle = minimalBundle() as Record<string, unknown>;
    delete bundle.license;
    expect(SourceBundleSchema.safeParse(bundle).success).toBe(false);
  });

  it('accepts optional editions and hantOverrides for zh bundles', () => {
    const result = SourceBundleSchema.safeParse(
      minimalBundle({ editions: ['zh-TW'], hantOverrides: { 猫: '貓' } }),
    );
    expect(result.success).toBe(true);
  });
});
