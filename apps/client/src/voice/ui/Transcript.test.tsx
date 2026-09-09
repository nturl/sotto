import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
}));
vi.mock('react', () => ({ useEffect: () => {}, useRef: () => ({ current: null }) }));
vi.mock('react/jsx-runtime', () => ({ jsx: h.jsx, jsxs: h.jsx }));
vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
vi.mock('../../i18n/useT', () => ({ useT: () => (key: string) => key }));
vi.mock('../../ui/theme', () => ({ useTheme: () => ({ colors: {} }) }));
vi.mock('../../ui/Glyphs', () => ({ ReplayGlyph: 'ReplayGlyph' }));
vi.mock('../../ui/Text', () => ({ Text: 'Text' }));
vi.mock('../../ui/tokens', () => ({ webCursor: {} }));

import { Transcript } from './Transcript';

type Tree = { type: unknown; props: Record<string, unknown> };
function nodes(node: unknown): Tree[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  const tree = node as Tree;
  return [tree, ...nodes(tree.props?.children)];
}

describe('transcript word saving', () => {
  it('makes completed conversation words tappable without changing punctuation or spacing', () => {
    const onWordPress = vi.fn();
    const tree = Transcript({
      captions: [
        {
          id: 'reply',
          speaker: 'tutor',
          text: 'Un village, vraiment !',
          final: true,
          createdAt: 0,
        },
      ],
      sourceLocale: 'fr-FR',
      onWordPress,
    });
    const words = nodes(tree).filter(
      (n) => n.type === 'Text' && n.props.accessibilityRole === 'button',
    );
    expect(words.map((n) => n.props.children)).toEqual(['Un', 'village', 'vraiment']);
    (words[1]!.props.onPress as () => void)();
    expect(onWordPress).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'village', contextSentence: 'Un village, vraiment !' }),
    );
    const paragraph = nodes(tree).find((n) => n.props.testID === 'transcript-caption-reply')!;
    const text = nodes(paragraph.props.children)
      .filter((n) => n.type === 'Text')
      .map((n) => n.props.children)
      .join('');
    expect(text).toBe('Un village, vraiment !');
  });

  it('does not save unstable partial captions and keeps replay/correction actions', () => {
    const replay = vi.fn();
    const correct = vi.fn();
    const tree = Transcript({
      captions: [
        { id: 'partial', speaker: 'learner', text: 'Un villa', final: false, createdAt: 0 },
        {
          id: 'reply',
          speaker: 'tutor',
          text: 'Bonjour.',
          final: true,
          notSpoken: true,
          createdAt: 1,
        },
      ],
      sourceLocale: 'fr-FR',
      onWordPress: vi.fn(),
      onReplaySentence: replay,
      correctableId: 'partial',
      onCorrectCaption: correct,
    });
    const words = nodes(tree).filter(
      (n) => n.type === 'Text' && n.props.accessibilityRole === 'button',
    );
    expect(words.map((n) => n.props.children)).toEqual(['Bonjour']);
    const buttons = nodes(tree).filter((n) => n.type === 'Pressable');
    (
      buttons.find((n) => n.props.accessibilityLabel === 'voice.replay')!.props
        .onPress as () => void
    )();
    (
      buttons.find((n) => n.props.accessibilityLabel === 'voice.correctCaption')!.props
        .onPress as () => void
    )();
    expect(replay).toHaveBeenCalledWith('Bonjour.');
    expect(correct).toHaveBeenCalledWith('Un villa');
  });
});
