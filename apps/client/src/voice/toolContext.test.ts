import { beforeEach, describe, expect, it } from 'vitest';
import { executeTool, type Chapter } from '@sotto/core';
import { createSottoStore } from '../state/createStore';
import type { Persistence } from '../platform/persistence.types';
import { buildSavedWord } from '../state/vocabulary';
import { createToolContext } from './toolContext';

function fakePersistence(): Persistence {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}

const CHAPTER: Chapter = {
  id: 'fr-chat-botte-01',
  bookId: 'fr-chat-botte',
  title: 'Chapitre 1',
  order: 1,
  blocks: [
    {
      id: 'b1',
      sentences: [
        {
          id: 'b1.s1',
          text: 'Un meunier vivait ici.',
          translations: { en: 'A miller lived here.', fr: 'Un meunier vivait ici.' },
          tokens: [
            { id: 'b1.s1.t1', text: 'Un', normalized: 'un', isWord: true, spaceBefore: false },
            {
              id: 'b1.s1.t2',
              text: 'meunier',
              normalized: 'meunier',
              isWord: true,
              spaceBefore: true,
              glosses: { en: 'miller', fr: 'meunier' },
              startMs: 200,
              endMs: 600,
            },
          ],
        },
      ],
    },
  ],
};

// The sentence from the live-voice e2e (apps/client/e2e/voice-live.mjs) that
// twice saved "verano" when the learner asked for "cigarra": 11 tokens, two
// of them punctuation, so counting words lands on the wrong id.
function esWord(id: string, text: string, spaceBefore = true) {
  return { id, text, normalized: text.toLowerCase(), isWord: true, spaceBefore };
}
function esPunct(id: string, text: string) {
  return { id, text, normalized: text, isWord: false, spaceBefore: false };
}
const SAMANIEGO: Chapter = {
  id: 'es-fabulas-samaniego-01',
  bookId: 'es-fabulas-samaniego',
  title: 'La cigarra y la hormiga',
  order: 1,
  blocks: [
    {
      id: 'b1',
      sentences: [
        {
          id: 'b1.s1',
          text: 'Durante el verano, una cigarra canta bajo el sol.',
          translations: { en: 'During the summer, a cicada sings under the sun.' },
          tokens: [
            esWord('b1.s1.t1', 'Durante', false),
            esWord('b1.s1.t2', 'el'),
            { ...esWord('b1.s1.t3', 'verano'), glosses: { en: 'summer' } },
            esPunct('b1.s1.t4', ','),
            esWord('b1.s1.t5', 'una'),
            { ...esWord('b1.s1.t6', 'cigarra'), glosses: { en: 'cicada' } },
            esWord('b1.s1.t7', 'canta'),
            esWord('b1.s1.t8', 'bajo'),
            esWord('b1.s1.t9', 'el'),
            esWord('b1.s1.t10', 'sol'),
            esPunct('b1.s1.t11', '.'),
          ],
        },
        {
          id: 'b1.s2',
          text: 'La cigarra no trabaja.',
          translations: { en: 'The cicada does not work.' },
          tokens: [
            esWord('b1.s2.t1', 'La', false),
            { ...esWord('b1.s2.t2', 'cigarra'), glosses: { en: 'cicada' } },
            esWord('b1.s2.t3', 'no'),
            esWord('b1.s2.t4', 'trabaja'),
            esPunct('b1.s2.t5', '.'),
          ],
        },
      ],
    },
  ],
};

describe('createToolContext (the tutor tool path, CONTRACTS §5c)', () => {
  let useStore: ReturnType<typeof createSottoStore>['useStore'];

  beforeEach(async () => {
    const { useStore: store, hydrate } = createSottoStore(fakePersistence());
    await hydrate();
    useStore = store;
    useStore.setState((s) => ({
      books: {
        ...s.books,
        'fr-chat-botte': {
          schemaVersion: 1,
          bookId: 'fr-chat-botte',
          contentLocale: 'fr-FR',
          title: 'Le Chat botté',
          author: 'Charles Perrault',
          sourceEdition: '',
          sourceUrl: '',
          sourceJurisdiction: '',
          adaptationEditor: '',
          reviewStatus: 'draft',
          level: 'A1',
          categories: ['tales'],
          estimatedMinutes: 10,
          localizedTitles: {},
          premise: {},
          summary: {},
          contentWarning: null,
          tutorNotes: { pronunciation: '', grammar: '', culture: '', commonErrors: '' },
          vocabulary: [],
          comprehension: [],
          license: { spdx: '', attribution: '' },
          cover: 'cover.svg',
          chapters: [
            {
              id: CHAPTER.id,
              title: CHAPTER.title,
              order: 1,
              file: 'chapters/01.json',
              wordCount: 2,
            },
          ],
        },
      },
      chapters: {
        ...s.chapters,
        'fr-chat-botte:fr-chat-botte-01': CHAPTER,
        'es-fabulas-samaniego:es-fabulas-samaniego-01': SAMANIEGO,
      },
    }));
  });

  it('save_vocabulary (tool path) produces the same state as tapping Save (tap path) for the same word', () => {
    // Tap path: the reader calls buildSavedWord + store.saveWord directly,
    // on its own store instance (the store's saveWord dedups by
    // tokenId+bookId, so exercising both paths against the *same* store for
    // the *same* token would just no-op the second one — that dedup is
    // itself correct behavior, tested separately in createStore.test.ts).
    const tapWord = buildSavedWord({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      sourceLocale: 'fr-FR',
      explanationLocale: 'en',
      token: CHAPTER.blocks[0]!.sentences[0]!.tokens[1]!,
      sentence: CHAPTER.blocks[0]!.sentences[0]!,
    });
    useStore.getState().saveWord(tapWord);

    // Tool path: the tutor's save_vocabulary tool call for a different
    // token in the same chapter.
    const ctx = createToolContext(useStore, 'fr-chat-botte', 'fr-chat-botte-01', 'fr-FR', 'en');
    expect(useStore.getState().savedWords).toHaveLength(1); // the tap-path save above

    const result = ctx.saveWord('b1.s1.t1'); // a different token than the tap path used
    expect(result).toMatchObject({ ok: true });

    const [tapSaved, toolSaved] = useStore.getState().savedWords;
    expect(tapSaved).toBeDefined();
    expect(toolSaved).toBeDefined();
    // Both were built by the same buildSavedWord helper — same shape of
    // fields (bookId/chapterId/locales/review defaults), differing only in
    // the token-specific content and the generated id/savedAt.
    const {
      id: _id1,
      savedAt: _savedAt1,
      review: _review1,
      tokenId: _t1,
      sentenceId: _s1,
      sourceWord: _w1,
      normalizedWord: _n1,
      translation: _tr1,
      contextSentence: _c1,
      ...rest1
    } = tapSaved!;
    const {
      id: _id2,
      savedAt: _savedAt2,
      review: _review2,
      tokenId: _t2,
      sentenceId: _s2,
      sourceWord: _w2,
      normalizedWord: _n2,
      translation: _tr2,
      contextSentence: _c2,
      ...rest2
    } = toolSaved!;
    expect(rest1).toEqual(rest2);
  });

  it('remove_vocabulary (tool path) removes exactly the word tapped Save would have removed', async () => {
    const ctx = createToolContext(useStore, 'fr-chat-botte', 'fr-chat-botte-01', 'fr-FR', 'en');
    const saveResult = await ctx.saveWord('b1.s1.t2');
    expect(saveResult.ok).toBe(true);
    expect(useStore.getState().savedWords).toHaveLength(1);

    const removeResult = await ctx.removeWord({ tokenId: 'b1.s1.t2' });
    expect(removeResult).toEqual({ ok: true });
    expect(useStore.getState().savedWords).toHaveLength(0);
  });

  it('get_current_passage / set_reading_position round-trip through the store', async () => {
    const ctx = createToolContext(useStore, 'fr-chat-botte', 'fr-chat-botte-01', 'fr-FR', 'en');
    const passage = await ctx.getPassage();
    expect(passage.sentences.map((s) => s.id)).toEqual(['b1.s1']);

    const positionResult = await ctx.setPosition('b1.s1.t2');
    expect(positionResult).toEqual({ ok: true });
    expect(useStore.getState().progress['fr-chat-botte']?.tokenId).toBe('b1.s1.t2');

    const badResult = await ctx.setPosition('nope');
    expect(badResult).toEqual({ ok: false, error: expect.any(String) });
  });

  describe('save_vocabulary word cross-check (the "cigarra" -> "verano" mis-save)', () => {
    const esCtx = () =>
      createToolContext(
        useStore,
        'es-fabulas-samaniego',
        'es-fabulas-samaniego-01',
        'es-419',
        'en',
      );

    it('reproduces the bug: a miscounted tokenId with no word hint silently saves the wrong word', async () => {
      // The live model counted "cigarra" as the 3rd/5th word and sent an id
      // that is a real token — so the exact-id lookup happily saved it.
      const result = await executeTool('save_vocabulary', { tokenId: 'b1.s1.t3' }, esCtx());
      expect(result).toMatchObject({ ok: true });
      expect(useStore.getState().savedWords.map((w) => w.sourceWord)).toEqual(['verano']);
    });

    it('with the word hint, a wrong tokenId resolves to the word the tutor actually meant', async () => {
      const result = await executeTool(
        'save_vocabulary',
        { tokenId: 'b1.s1.t3', word: 'cigarra' },
        esCtx(),
      );
      expect(result).toMatchObject({ ok: true });
      const [saved] = useStore.getState().savedWords;
      expect(saved).toMatchObject({
        sourceWord: 'cigarra',
        tokenId: 'b1.s1.t6', // the nearest "cigarra" to the id it gave, not b1.s2.t2
        sentenceId: 'b1.s1',
        translation: 'cicada',
      });
    });

    it('matches the hint case- and punctuation-insensitively, and a correct id is untouched', async () => {
      const ctx = esCtx();
      expect(await ctx.saveWord('b1.s1.t6', undefined, 'Cigarra,')).toMatchObject({ ok: true });
      expect(useStore.getState().savedWords.map((w) => w.tokenId)).toEqual(['b1.s1.t6']);
    });

    it('fails instead of saving anything when the hinted word is not in the chapter', async () => {
      const result = await esCtx().saveWord('b1.s1.t3', undefined, 'hormiga');
      expect(result).toEqual({
        ok: false,
        error: 'word "hormiga" not found in chapter (tokenId b1.s1.t3 is "verano")',
      });
      expect(useStore.getState().savedWords).toHaveLength(0);
    });

    it('an unknown tokenId plus a real word still resolves by the word', async () => {
      const result = await esCtx().saveWord('b9.s9.t9', undefined, 'trabaja');
      expect(result).toMatchObject({ ok: true });
      expect(useStore.getState().savedWords[0]).toMatchObject({ tokenId: 'b1.s2.t4' });
    });

    it('get_current_passage exposes the word->tokenId map the prompt renders (punctuation excluded)', async () => {
      const passage = await esCtx().getPassage();
      expect(passage.sentences[0]?.words).toEqual([
        { id: 'b1.s1.t1', text: 'Durante' },
        { id: 'b1.s1.t2', text: 'el' },
        { id: 'b1.s1.t3', text: 'verano' },
        { id: 'b1.s1.t5', text: 'una' },
        { id: 'b1.s1.t6', text: 'cigarra' },
        { id: 'b1.s1.t7', text: 'canta' },
        { id: 'b1.s1.t8', text: 'bajo' },
        { id: 'b1.s1.t9', text: 'el' },
        { id: 'b1.s1.t10', text: 'sol' },
      ]);
    });
  });

  it('mark_section_complete marks the book completed', async () => {
    const ctx = createToolContext(useStore, 'fr-chat-botte', 'fr-chat-botte-01', 'fr-FR', 'en');
    const result = await ctx.markComplete();
    expect(result).toEqual({ ok: true, advanced: false });
    expect(useStore.getState().completedBooks).toContain('fr-chat-botte');
    expect(useStore.getState().progress['fr-chat-botte']?.completedAt).toBeDefined();
  });
});
