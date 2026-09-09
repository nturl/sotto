import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedWord } from '@sotto/core';

type Tree = { type: unknown; props: Record<string, unknown> };

const h = vi.hoisted(() => {
  const states = new Map<number, unknown>();
  const effects: Array<() => void | (() => void)> = [];
  let hookIndex = 0;
  let dirty = false;

  const react = {
    useState<T>(initial: T) {
      const index = hookIndex++;
      if (!states.has(index)) states.set(index, initial);
      const setState = (next: T | ((current: T) => T)) => {
        const current = states.get(index) as T;
        const value = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
        if (!Object.is(current, value)) {
          states.set(index, value);
          dirty = true;
        }
      };
      return [states.get(index) as T, setState] as const;
    },
    useEffect(effect: () => void | (() => void)) {
      effects.push(effect);
    },
    useMemo<T>(compute: () => T) {
      hookIndex += 1;
      return compute();
    },
  };

  const jsx = (type: unknown, props: Record<string, unknown> | null) => ({
    type,
    props: props ?? {},
  });

  return {
    react,
    jsx,
    reset() {
      states.clear();
      effects.length = 0;
      hookIndex = 0;
      dirty = false;
    },
    render(component: () => Tree) {
      let tree: Tree;
      do {
        dirty = false;
        hookIndex = 0;
        effects.length = 0;
        tree = component();
        while (effects.length) effects.shift()?.();
      } while (dirty);
      return tree!;
    },
  };
});

const view = vi.hoisted(() => {
  const review = {
    ease: 2.5,
    intervalDays: 3,
    dueAt: '2026-09-12T00:00:00.000Z',
    reps: 2,
    lapses: 0,
  };
  const frenchWord = {
    id: 'word-fr',
    bookId: 'stars-fr',
    chapterId: 'chapter-1',
    tokenId: 'token-1',
    sentenceId: 'sentence-1',
    sourceLocale: 'fr-FR',
    explanationLocale: 'en',
    sourceWord: 'journées',
    normalizedWord: 'journée',
    translation: 'days',
    contextSentence: 'Les journées passent.',
    savedAt: '2026-09-09T17:37:00.000Z',
    review,
  };
  const spanishWord = {
    ...frenchWord,
    id: 'word-es',
    bookId: 'stars-es',
    sourceLocale: 'es-419',
    sourceWord: 'robles',
    normalizedWord: 'roble',
    translation: 'oaks',
  };
  const state = {
    locale: 'fr-FR',
    savedWords: [frenchWord] as SavedWord[],
    removeWord: vi.fn(({ savedWordId }: { savedWordId: string }) => {
      state.savedWords = state.savedWords.filter((word) => word.id !== savedWordId);
    }),
    saveWord: vi.fn((word: SavedWord) => state.savedWords.push(word)),
  };
  return { state, frenchWord, spanishWord, review };
});

vi.mock('react', () => h.react);
vi.mock('react/jsx-runtime', () => ({ jsx: h.jsx, jsxs: h.jsx, Fragment: Symbol('Fragment') }));
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@sotto/core/theme', () => ({
  radius: { md: 10 },
  space: { sm: 8, md: 12, lg: 16, xl: 20, xxxl: 40 },
}));
vi.mock('../i18n/useT', () => ({
  useT: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}=${values.count}`,
}));
vi.mock('../ui/Button', () => ({ Button: 'Button' }));
vi.mock('../ui/Cover', () => ({ Cover: 'Cover' }));
vi.mock('../ui/Glyphs', () => ({
  ChevronRightGlyph: 'ChevronRightGlyph',
  SpeakerGlyph: 'SpeakerGlyph',
  TrashGlyph: 'TrashGlyph',
}));
vi.mock('../ui/IconButton', () => ({ IconButton: 'IconButton' }));
vi.mock('../ui/MarkerStroke', () => ({ MarkerStroke: 'MarkerStroke' }));
vi.mock('../ui/Sheet', () => ({ Sheet: 'Sheet' }));
vi.mock('../ui/Shell', () => ({
  Shell: 'Shell',
  useLayoutMetrics: () => ({ isDesktop: false, isWideDesktop: false }),
}));
vi.mock('../ui/Text', () => ({ Text: 'Text' }));
vi.mock('../ui/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: 'accent',
      ink: 'ink',
      ink2: 'ink2',
      ink3: 'ink3',
      surface: 'surface',
      hairline: 'hairline',
    },
  }),
}));
vi.mock('../ui/tokens', () => ({ webCursor: {} }));
vi.mock('../platform/audio', () => ({ playAudioSlice: vi.fn() }));
vi.mock('../ui/data', () => ({
  bookAssetUrl: () => 'audio.mp3',
  usePreferences: () => ({ learningLocale: view.state.locale }),
  useLibrary: () => ({
    byId: (id: string) => {
      const book =
        id === 'stars-fr'
          ? { title: 'The Stars', contentLocale: 'fr-FR' }
          : id === 'stars-es'
            ? { title: 'Las estrellas', contentLocale: 'es-419' }
            : undefined;
      return book
        ? {
            id,
            ...book,
            author: 'Author',
            reviewStatus: 'draft',
            shortAuthor: 'A. Author',
            level: 'A1',
            minutes: 10,
            categories: ['tales'],
            svgUrl: '',
            progress: 0,
            isNew: true,
            synopsis: '',
          }
        : undefined;
    },
  }),
}));
vi.mock('./store', () => ({
  useSottoStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({
      savedWords: view.state.savedWords,
      packs: [
        { locale: 'fr-FR', books: [{ bookId: 'stars-fr' }] },
        { locale: 'es-419', books: [{ bookId: 'stars-es' }] },
      ],
      removeWord: view.state.removeWord,
      saveWord: view.state.saveWord,
      books: {},
      loadBook: vi.fn(),
      bookLocale: () => undefined,
      loadChapter: vi.fn(),
      chapters: {},
    }),
}));

import VocabularyScreen from '../../app/(tabs)/vocabulary';

function findAll(node: unknown, type: string, found: Tree[] = []): Tree[] {
  if (!node || typeof node !== 'object') return found;
  const tree = node as Tree;
  if (tree.type === type) found.push(tree);
  if (typeof tree.type === 'function') findAll(tree.type(tree.props), type, found);
  const children = tree.props?.children;
  if (Array.isArray(children)) children.forEach((child) => findAll(child, type, found));
  else findAll(children, type, found);
  return found;
}

function render() {
  return h.render(VocabularyScreen);
}

function isBookCard(control: Tree, title: string) {
  return (
    findAll(control, 'ChevronRightGlyph').length > 0 &&
    findAll(control, 'Text').some((text) => text.props.children === title)
  );
}

function sheet(tree: Tree) {
  const picker = findAll(tree, 'Sheet')[0];
  if (!picker) throw new Error('Vocabulary picker was not rendered.');
  return picker;
}

beforeEach(() => {
  h.reset();
  view.state.locale = 'fr-FR';
  view.state.savedWords = [view.frenchWord];
  view.state.removeWord.mockClear();
  view.state.saveWord.mockClear();
});

describe('VocabularyScreen locale filtering', () => {
  it('closes an open picker and clears a stale selection, then restores the saved word and review when switching back', () => {
    let tree = render();
    const bookCard = findAll(tree, 'Pressable').find((control) => isBookCard(control, 'The Stars'));
    if (!bookCard) throw new Error('Vocabulary book card was not rendered.');
    (bookCard.props.onPress as () => void)();

    tree = render();
    expect(sheet(tree).props.visible).toBe(true);

    view.state.locale = 'es-419';
    tree = render();
    expect(sheet(tree).props.visible).toBe(false);
    expect(findAll(tree, 'Button')).toEqual([]);
    expect(findAll(tree, 'Pressable').some((control) => isBookCard(control, 'The Stars'))).toBe(
      false,
    );

    view.state.locale = 'fr-FR';
    tree = render();
    expect(findAll(tree, 'Button')[0]?.props.title).toBe('vocabulary.startReview=1');
    expect(view.state.savedWords).toEqual([view.frenchWord]);
    expect(view.state.savedWords[0]?.review).toBe(view.review);
  });

  it('removes the last word without leaving an empty interactive group or review action', () => {
    let tree = render();
    const deleteButton = findAll(tree, 'IconButton').find(
      (control) => control.props.accessibilityLabel === 'delete',
    );
    if (!deleteButton) throw new Error('Vocabulary delete button was not rendered.');
    (deleteButton.props.onPress as () => void)();

    tree = render();
    expect(view.state.removeWord).toHaveBeenCalledWith({ savedWordId: 'word-fr' });
    expect(sheet(tree).props.visible).toBe(false);
    expect(findAll(tree, 'Button')).toEqual([]);
    expect(findAll(tree, 'Pressable').some((control) => isBookCard(control, 'The Stars'))).toBe(
      false,
    );
  });

  it("selects the new locale's group when it has saved words", () => {
    view.state.savedWords = [view.frenchWord, view.spanishWord];
    render();

    view.state.locale = 'es-419';
    const tree = render();

    expect(findAll(tree, 'Pressable').some((control) => isBookCard(control, 'Las estrellas'))).toBe(
      true,
    );
    expect(findAll(tree, 'Pressable').some((control) => isBookCard(control, 'The Stars'))).toBe(
      false,
    );
    expect(findAll(tree, 'Button')[0]?.props.title).toBe('vocabulary.startReview=1');
  });
});
