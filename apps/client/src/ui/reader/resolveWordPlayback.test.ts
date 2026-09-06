import { describe, expect, it, vi } from 'vitest';

/**
 * This module is the full reader screen (heavy: react-native, expo-router,
 * every reader UI component, the app's singleton store). `resolveWordPlayback`
 * is a pure decision function extracted from the tap handler (TASK R6-C2
 * commit 2) so it can be tested without rendering the screen, but it lives
 * in this file, so importing the module is unavoidable — hence the mocks
 * below for every native/heavy dependency in its import graph. Each is a
 * plain object, not a Proxy: a Proxy-based `react-native` mock hung
 * indefinitely under this repo's Vitest/Vite SSR module runner (confirmed
 * by isolated bisection — a plain object mock does not).
 */
function Stub(props: unknown) {
  return props;
}

vi.mock('react-native', () => ({
  StyleSheet: { create: (s: unknown) => s },
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web },
  View: Stub,
  Text: Stub,
  Pressable: Stub,
  ScrollView: Stub,
  Image: Stub,
  Linking: { openURL: () => Promise.resolve() },
  Animated: { View: Stub, Text: Stub, timing: () => ({ start: () => {} }), Value: class {} },
  Easing: {
    out: (f: unknown) => f,
    ease: () => {},
    inOut: (f: unknown) => f,
    bezier: () => () => 0,
  },
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ width: 400, height: 800 }),
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: () => {} }),
  },
}));
vi.mock('react-native-svg', () => ({
  Svg: Stub,
  Path: Stub,
  Rect: Stub,
  Circle: Stub,
  Line: Stub,
  Polyline: Stub,
  Polygon: Stub,
  G: Stub,
  Defs: Stub,
  LinearGradient: Stub,
  Stop: Stub,
  Text: Stub,
  SvgUri: Stub,
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('../../state/store', () => {
  const state = { preferences: { interfaceLocale: 'en' } };
  const fn = () => state;
  fn.getState = () => state;
  fn.subscribe = () => () => {};
  return { useSottoStore: fn };
});
// Real hook pulls in expo-file-system via privateAudio.native.ts (private-
// book import support), irrelevant to word-audio playback timing.
// Real `expo-audio` package imports from the `expo` core package for
// native module registration (`PermissionStatus`, `useEvent`), which pulls
// in Expo's dev-runtime setup (`__DEV__` global) outside a real host.
vi.mock('expo-audio', () => ({
  createAudioPlayer: () => ({
    pause: () => {},
    remove: () => {},
    seekTo: () => Promise.resolve(),
    setPlaybackRate: () => {},
    addListener: () => ({ remove: () => {} }),
    play: () => {},
    muted: true,
    volume: 1,
  }),
}));
vi.mock('../../import/useLazyNarration', () => ({
  useLazyNarration: () => ({ narrating: false, narrateChapter: async () => false }),
}));

import { resolveWordPlayback } from '../../../app/reader/[bookId]';

const FALLBACK = { uri: 'chapter.mp3', startMs: 1000, endMs: 1400 };

describe('resolveWordPlayback', () => {
  it('waits when the book has a sprite but the index is still loading', () => {
    const decision = resolveWordPlayback('sprite.mp3', undefined, 'hola', FALLBACK);
    expect(decision).toEqual({ kind: 'wait' });
  });

  it('plays immediately from the sprite once the index has loaded', () => {
    const index = { hola: [0, 400] as [number, number] };
    const decision = resolveWordPlayback('sprite.mp3', index, 'hola', FALLBACK);
    expect(decision).toEqual({
      kind: 'ready',
      options: { spriteUri: 'sprite.mp3', index, normalized: 'hola', fallback: FALLBACK },
    });
  });

  it('plays the fallback immediately when the index loaded but is unusable (null)', () => {
    const decision = resolveWordPlayback('sprite.mp3', null, 'hola', FALLBACK);
    expect(decision).toEqual({
      kind: 'ready',
      options: {
        spriteUri: 'sprite.mp3',
        index: undefined,
        normalized: 'hola',
        fallback: FALLBACK,
      },
    });
  });

  it('plays the fallback immediately when the book has no sprite at all', () => {
    const decision = resolveWordPlayback(undefined, undefined, 'hola', FALLBACK);
    expect(decision).toEqual({
      kind: 'ready',
      options: { spriteUri: undefined, index: undefined, normalized: 'hola', fallback: FALLBACK },
    });
  });
});
