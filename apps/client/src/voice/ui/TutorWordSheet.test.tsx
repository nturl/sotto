import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chapter, SavedWord } from '@sotto/core';

const h = vi.hoisted(() => {
  const states = new Map<number, unknown>();
  let index = 0;
  return {
    states,
    reset: () => {
      states.clear();
      index = 0;
    },
    render: <T,>(component: () => T) => {
      index = 0;
      return component();
    },
    useState: <T,>(initial: T | (() => T)) => {
      const key = index++;
      if (!states.has(key))
        states.set(key, typeof initial === 'function' ? (initial as () => T)() : initial);
      return [states.get(key) as T, (value: T) => states.set(key, value)];
    },
    jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  };
});
const store = vi.hoisted(() => ({
  savedWords: [] as SavedWord[],
  saveWord(word: SavedWord) {
    if (!store.savedWords.some((w) => w.bookId === word.bookId && w.tokenId === word.tokenId))
      store.savedWords = [...store.savedWords, word];
  },
}));
vi.mock('react', () => ({ useEffect: () => {}, useState: h.useState }));
vi.mock('react/jsx-runtime', () => ({ jsx: h.jsx, jsxs: h.jsx }));
vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  TextInput: 'TextInput',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('../../i18n/useT', () => ({ useT: () => (key: string) => key }));
vi.mock('../../ui/theme', () => ({ useTheme: () => ({ colors: {} }) }));
vi.mock('../../state/store', () => ({
  useSottoStore: (select: (value: typeof store) => unknown) => select(store),
}));
vi.mock('../../ui/Text', () => ({ Text: 'Text' }));
vi.mock('../../ui/Button', () => ({ Button: 'Button' }));
vi.mock('../../ui/Sheet', () => ({ Sheet: 'Sheet' }));

import { TutorWordSheet } from './TutorWordSheet';
import { segmentTranscriptWords, type TranscriptWordSegment } from '../transcriptVocabulary';

type Tree = { type: unknown; props: Record<string, unknown> };
function nodes(node: unknown): Tree[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  const tree = node as Tree;
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)];
}
const chapter: Chapter = {
  id: 'chapter',
  bookId: 'book',
  title: 'Book',
  order: 1,
  blocks: [
    {
      id: 'b1',
      sentences: [
        {
          id: 's1',
          text: 'Le village.',
          translations: {},
          tokens: [
            {
              id: 't1',
              text: 'village',
              normalized: 'village',
              isWord: true,
              spaceBefore: false,
              glosses: { en: 'village' },
            },
          ],
        },
      ],
    },
  ],
};
function render(word: string) {
  const selection = segmentTranscriptWords(`Un ${word}.`, 'fr-FR').find(
    (s) => s.isWord && s.text === word,
  ) as TranscriptWordSegment;
  return h.render(() =>
    TutorWordSheet({
      selection,
      chapter,
      bookId: 'book',
      sourceLocale: 'fr-FR',
      explanationLocale: 'en',
      onClose: vi.fn(),
    }),
  );
}
function saveButton(tree: unknown) {
  return nodes(tree).find(
    (n) =>
      n.type === 'Button' && (n.props.title === 'reader.save' || n.props.title === 'reader.saved'),
  )!;
}
beforeEach(() => {
  h.reset();
  store.savedWords = [];
});

describe('TutorWordSheet', () => {
  it('saves a chapter word and confirms it without duplicating or resetting review', () => {
    let tree = render('village');
    expect(saveButton(tree).props.disabled).toBe(false);
    (saveButton(tree).props.onPress as () => void)();
    tree = render('village');
    expect(saveButton(tree).props.title).toBe('reader.saved');
    expect(saveButton(tree).props.disabled).toBe(true);
    expect(store.savedWords[0]).toMatchObject({ tokenId: 't1', translation: 'village' });
    store.savedWords[0]!.review.reps = 3;
    h.reset();
    tree = render('village');
    (saveButton(tree).props.onPress as () => void)();
    expect(store.savedWords).toHaveLength(1);
    expect(store.savedWords[0]!.review.reps).toBe(3);
  });

  it('requires a meaning for a new conversation word and saves its context', () => {
    let tree = render('courageux');
    expect(saveButton(tree).props.disabled).toBe(true);
    (saveButton(tree).props.onPress as () => void)();
    expect(store.savedWords).toHaveLength(0);
    const input = nodes(tree).find((n) => n.type === 'TextInput')!;
    (input.props.onChangeText as (value: string) => void)('brave');
    tree = render('courageux');
    (saveButton(tree).props.onPress as () => void)();
    expect(store.savedWords[0]).toMatchObject({
      sourceWord: 'courageux',
      translation: 'brave',
      contextSentence: 'Un courageux.',
    });
    expect(store.savedWords[0]!.tokenId).toMatch(/^tutor:/);
  });
});
