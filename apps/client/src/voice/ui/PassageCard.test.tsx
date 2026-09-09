import { expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
}));
vi.mock('react/jsx-runtime', () => ({ jsx: h.jsx, jsxs: h.jsx }));
vi.mock('react-native', () => ({
  ScrollView: 'ScrollView',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
vi.mock('../../i18n/useT', () => ({ useT: () => (key: string) => key }));
vi.mock('../../ui/theme', () => ({ useTheme: () => ({ colors: {} }) }));
vi.mock('../../ui/Text', () => ({ Text: 'Text' }));
vi.mock('../../ui/SpeechFillText', () => ({ SpeechFillText: 'SpeechFillText' }));
vi.mock('../../ui/tokens', () => ({ webCursor: {} }));

import { PassageCard } from './PassageCard';

type Tree = { type: unknown; props: Record<string, unknown> };
function nodes(node: unknown): Tree[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  const tree = node as Tree;
  return [tree, ...nodes(tree.props?.children)];
}

it('lets a passage word open its save card while preserving narration and passage navigation', () => {
  const onPressToken = vi.fn();
  const onChangePassage = vi.fn();
  const token = { id: 'word', text: 'village', isWord: true, spoken: true };
  const sentence = { id: 'sentence', tokens: [token] };
  const tree = PassageCard({
    title: 'Chapter',
    sentences: [sentence],
    hasPassage: true,
    isLoading: false,
    cjk: false,
    onPressToken,
    onChangePassage,
  });
  const passage = nodes(tree).find((node) => node.type === 'SpeechFillText')!;
  expect(passage.props.onPressToken).toBeTypeOf('function');
  (passage.props.onPressToken as typeof onPressToken)(token, sentence);
  expect(onPressToken).toHaveBeenCalledWith(token, sentence);
  expect(passage.props.sentences).toEqual([sentence]);
  const change = nodes(tree).find((node) => node.props.accessibilityRole === 'link')!;
  (change.props.onPress as () => void)();
  expect(onChangePassage).toHaveBeenCalledOnce();
});
