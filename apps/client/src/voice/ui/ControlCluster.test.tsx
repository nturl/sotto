import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: Record<string, unknown>) => void;

const h = vi.hoisted(() => {
  const effects: Array<() => void | (() => void)> = [];
  const cleanups: Array<() => void> = [];

  const react = {
    useEffect(effect: () => void | (() => void)) {
      effects.push(effect);
    },
    useRef<T>(current: T) {
      return { current };
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
      effects.length = 0;
      cleanups.length = 0;
    },
    flushEffects() {
      while (effects.length) {
        const cleanup = effects.shift()?.();
        if (cleanup) cleanups.push(cleanup);
      }
    },
    cleanup() {
      while (cleanups.length) cleanups.pop()?.();
      effects.length = 0;
    },
  };
});

vi.mock('react', () => h.react);
vi.mock('react/jsx-runtime', () => ({ jsx: h.jsx, jsxs: h.jsx, Fragment: Symbol('Fragment') }));
vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
vi.mock('@sotto/core/theme', () => ({
  radius: { md: 10, full: 999 },
  space: { xs: 4, sm: 8, md: 12, xl: 20, tapTarget: 44 },
}));
vi.mock('../../i18n/useT', () => ({ useT: () => (key: string) => key }));
vi.mock('../../ui/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: 'accent',
      ink: 'ink',
      ink2: 'ink2',
      ink3: 'ink3',
      surface: 'surface',
      surface2: 'surface2',
    },
  }),
}));
vi.mock('../../ui/Glyphs', () => ({
  CloseGlyph: 'CloseGlyph',
  MicGlyph: 'MicGlyph',
  ReplayGlyph: 'ReplayGlyph',
  SpeakerGlyph: 'SpeakerGlyph',
  StopGlyph: 'StopGlyph',
}));
vi.mock('../../ui/IconButton', () => ({ IconButton: 'IconButton' }));
vi.mock('../../ui/Text', () => ({ Text: 'Text' }));
vi.mock('../../ui/tokens', () => ({ webCursor: {} }));

import { ControlCluster } from './ControlCluster';

type Tree = { type: unknown; props: Record<string, unknown> };

function eventTarget(overrides: Record<string, unknown> = {}): EventTarget {
  return {
    tagName: 'DIV',
    closest: () => null,
    ...overrides,
  } as unknown as EventTarget;
}

function eventBus() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, listener: Listener) {
      const handlers = listeners.get(type) ?? new Set<Listener>();
      handlers.add(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type: string, event: Record<string, unknown> = {}) {
      listeners.get(type)?.forEach((listener) => listener(event));
    },
  };
}

function findAll(node: unknown, type: string, found: Tree[] = []): Tree[] {
  if (!node || typeof node !== 'object') return found;
  const tree = node as Tree;
  if (tree.type === type) found.push(tree);
  const children = tree.props?.children;
  if (Array.isArray(children)) children.forEach((child) => findAll(child, type, found));
  else findAll(children, type, found);
  return found;
}

function render(inputMuted = false) {
  const calls: boolean[] = [];
  const tree = ControlCluster({
    voiceState: 'listening',
    inputMuted,
    turnDetection: 'push',
    onSetTurnDetection: () => {},
    pttHeld: false,
    onPushToTalk: (active) => calls.push(active),
    onToggleMute: () => {},
    onReplay: () => {},
    onInterrupt: () => {},
    onEnd: () => {},
    outputMuted: false,
    onToggleOutputMuted: () => {},
  });
  h.flushEffects();
  const ring = findAll(tree, 'Pressable').find(
    (control) => control.props.accessibilityLabel === 'voice.holdToTalk',
  );
  if (!ring) throw new Error('Hold-to-talk ring was not rendered.');
  return { calls, ring };
}

let win: ReturnType<typeof eventBus>;
let doc: ReturnType<typeof eventBus> & { hidden: boolean };

beforeEach(() => {
  h.reset();
  win = eventBus();
  doc = { ...eventBus(), hidden: false };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
});

afterEach(() => {
  h.cleanup();
  vi.unstubAllGlobals();
});

describe('ControlCluster push-to-talk', () => {
  it('starts and releases only for a held Space outside interactive controls', () => {
    const { calls } = render();
    const preventDefault = vi.fn();

    win.emit('keydown', { code: 'Space', repeat: false, target: eventTarget(), preventDefault });
    win.emit('keyup', { code: 'Space', target: eventTarget(), preventDefault });

    expect(calls).toEqual([true, false]);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });

  it('does not end a Space hold when an unrelated key is released', () => {
    const { calls } = render();

    win.emit('keydown', {
      code: 'Space',
      repeat: false,
      target: eventTarget(),
      preventDefault: () => {},
    });
    win.emit('keyup', { code: 'Shift', target: eventTarget(), preventDefault: () => {} });

    expect(calls).toEqual([true]);
  });

  it('cancels a held Space on blur and accepts a new Space press afterwards', () => {
    const { calls } = render();
    const space = { code: 'Space', repeat: false, target: eventTarget(), preventDefault: () => {} };

    win.emit('keydown', space);
    win.emit('blur');

    expect(calls).toContain(false);
    expect(calls.filter(Boolean)).toHaveLength(1);

    win.emit('keydown', space);

    expect(calls.at(-1)).toBe(true);
    expect(calls.filter(Boolean)).toHaveLength(2);
  });

  it('leaves Space to focused buttons and radios', () => {
    const { calls } = render();
    const preventDefault = vi.fn();

    win.emit('keydown', {
      code: 'Space',
      repeat: false,
      target: eventTarget({ closest: () => ({ role: 'button' }) }),
      preventDefault,
    });

    expect(calls).toEqual([]);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('keeps a muted ring enabled so its press and release can recover capture', () => {
    const { calls, ring } = render(true);

    expect(ring.props.disabled).toBeUndefined();
    expect(ring.props.accessibilityState).toBeUndefined();
    (ring.props.onPressIn as () => void)();
    (ring.props.onPressOut as () => void)();

    expect(calls).toEqual([true, false]);
  });
});
