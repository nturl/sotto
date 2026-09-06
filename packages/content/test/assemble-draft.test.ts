import { describe, expect, it } from 'vitest';
import {
  buildBundleFromDraft,
  computeStats,
  convertChapter,
  findConfirmMarker,
} from '../scripts/assemble-draft.mjs';
import { SourceBundleSchema } from '../src/types.ts';

/** A minimal but complete draft, matching planning/LIBRARY-EXPANSION.md's
 * "Draft format" — written inline rather than under drafts/, which is
 * author-owned content this lane never touches. */
function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    bookId: 'fr-test-book',
    contentLocale: 'fr-FR',
    title: 'Le Test',
    author: 'A. Contributor',
    sourceEdition: 'Test edition, Project Gutenberg plain-text edition',
    sourceUrl: 'https://www.gutenberg.org/ebooks/1',
    sourceJurisdiction: 'Public domain worldwide (author died 1900)',
    level: 'B1',
    categories: ['classics'],
    estimatedMinutes: 5,
    localizedTitles: { en: 'The Test', fr: 'Le Test' },
    premise: { en: 'A premise.', fr: 'Une prémisse.' },
    summary: { en: 'A summary.', fr: 'Un résumé.' },
    contentWarning: null,
    tutorNotes: {
      pronunciation: 'Notes on pronunciation.',
      grammar: 'Notes on grammar.',
      culture: 'Notes on culture.',
      commonErrors: 'Notes on common errors.',
    },
    vocabulary: [{ word: 'test', gloss: { fr: 'test' } }],
    comprehension: [{ question: { en: 'Q1?', fr: 'Q1 ?' } }],
    chapters: [
      {
        title: 'Chapitre 1 — Le début',
        paragraphs: [
          ['Phrase un.  ', 'Phrase deux.'],
          ['   ', 'Phrase trois.', ''],
        ],
      },
    ],
    ...overrides,
  };
}

describe('convertChapter', () => {
  it('converts string-array paragraphs to {sentences:[{text,translation}]}, trimming and dropping empties', () => {
    const chapter = convertChapter({
      title: 'Chapitre 1',
      paragraphs: [
        ['  Phrase un.', 'Phrase deux.  '],
        ['', '   ', 'Phrase trois.'],
      ],
    });

    expect(chapter.title).toBe('Chapitre 1');
    // The second paragraph's leading empty/whitespace-only entries are dropped.
    expect(chapter.paragraphs).toEqual([
      {
        sentences: [
          { text: 'Phrase un.', translation: {} },
          { text: 'Phrase deux.', translation: {} },
        ],
      },
      { sentences: [{ text: 'Phrase trois.', translation: {} }] },
    ]);
  });

  it('drops a paragraph entirely if every sentence in it is empty after trimming', () => {
    const chapter = convertChapter({
      title: 'Chapitre 1',
      paragraphs: [['Phrase un.'], ['', '   ']],
    });
    expect(chapter.paragraphs).toHaveLength(1);
  });
});

describe('findConfirmMarker', () => {
  it('returns null when nothing contains CONFIRM:', () => {
    expect(findConfirmMarker(makeDraft())).toBeNull();
  });

  it('finds a CONFIRM: marker nested in an object field and reports its path', () => {
    const draft = makeDraft({
      tutorNotes: {
        pronunciation: 'CONFIRM: fill this in',
        grammar: 'ok',
        culture: 'ok',
        commonErrors: 'ok',
      },
    });
    expect(findConfirmMarker(draft)).toBe('tutorNotes.pronunciation');
  });

  it('finds a CONFIRM: marker nested inside an array', () => {
    const draft = makeDraft({
      vocabulary: [{ word: 'CONFIRM: which word?', gloss: { fr: 'x' } }],
    });
    expect(findConfirmMarker(draft)).toBe('vocabulary[0].word');
  });
});

describe('buildBundleFromDraft', () => {
  it('produces a bundle that parses under SourceBundleSchema with the pipeline-owned fields filled in', () => {
    const bundle = buildBundleFromDraft(makeDraft());
    const parsed = SourceBundleSchema.safeParse(bundle);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.schemaVersion).toBe(1);
    expect(parsed.data.adaptationEditor).toBe('Sotto contributors (AI first draft, unreviewed)');
    expect(parsed.data.reviewStatus).toBe('draft');
    expect(parsed.data.license).toEqual({
      spdx: 'CC-BY-SA-4.0',
      attribution: 'Sotto contributors; based on the public-domain original by A. Contributor',
    });
    expect(parsed.data.glossary).toEqual({});
    // Chapter conversion happened and dropped the blank paragraph entry.
    expect(parsed.data.chapters[0]?.paragraphs).toHaveLength(2);
  });
});

describe('computeStats', () => {
  it('counts sentences/words by whitespace split and reports mean sentence length', () => {
    const bundle = buildBundleFromDraft(makeDraft());
    const stats = computeStats(bundle);
    expect(stats.chapterCount).toBe(1);
    expect(stats.sentenceCount).toBe(3);
    // "Phrase un." + "Phrase deux." + "Phrase trois." = 6 whitespace-split words.
    expect(stats.wordCount).toBe(6);
    expect(stats.meanSentenceLength).toBeCloseTo(2, 5);
  });

  it('counts zh content by character, not whitespace-split token', () => {
    const bundle = buildBundleFromDraft(
      makeDraft({
        contentLocale: 'zh-CN',
        chapters: [{ title: '第一章', paragraphs: [['孔乙己是站着喝酒而穿长衫的唯一的人。']] }],
      }),
    );
    const stats = computeStats(bundle);
    expect(stats.sentenceCount).toBe(1);
    expect(stats.wordCount).toBe('孔乙己是站着喝酒而穿长衫的唯一的人。'.length);
  });
});
