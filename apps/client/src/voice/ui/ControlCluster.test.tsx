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
// Exercise the installed web responder without launching a browser. Its
// internal JS module has no TypeScript declaration.
// @ts-expect-error react-native-web does not publish this internal type.
import PressResponder from 'react-native-web/dist/modules/usePressEvents/PressResponder.js';

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

function render(inputMuted = false, compact = false) {
  const calls: boolean[] = [];
  const actions = {
    mode: vi.fn(),
    mute: vi.fn(),
    replay: vi.fn(),
    interrupt: vi.fn(),
    end: vi.fn(),
    outputMute: vi.fn(),
  };
  const tree = ControlCluster({
    voiceState: 'listening',
    inputMuted,
    turnDetection: 'push',
    onSetTurnDetection: actions.mode,
    pttHeld: false,
    onPushToTalk: (active) => calls.push(active),
    onToggleMute: actions.mute,
    onReplay: actions.replay,
    onInterrupt: actions.interrupt,
    onEnd: actions.end,
    outputMuted: false,
    onToggleOutputMuted: actions.outputMute,
    compact,
  });
  h.flushEffects();
  const ring = findAll(tree, 'Pressable').find(
    (control) => control.props.accessibilityLabel === 'voice.holdToTalk',
  );
  if (!ring) throw new Error('Hold-to-talk ring was not rendered.');
  return { actions, calls, ring, tree };
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
  it.each(['onResponderRelease', 'onResponderTerminate'])(
    'starts capture on touch-down and stops immediately on %s',
    (finish) => {
      vi.useFakeTimers();
      const { calls, ring } = render();
      const responder = new PressResponder({
        delayPressStart: ring.props.delayPressIn,
        delayPressEnd: ring.props.delayPressOut,
        onPressStart: ring.props.onPressIn,
        onPressEnd: ring.props.onPressOut,
      });
      const event = {
        persist: () => {},
        nativeEvent: { type: 'touchstart', pageX: 10, pageY: 10 },
      };
      try {
        const handlers = responder.getEventHandlers();
        handlers.onResponderGrant(event);
        expect(calls).toEqual([true]);
        handlers[finish](event);
        expect(calls).toEqual([true, false]);
        vi.runAllTimers();
        expect(calls).toEqual([true, false]);
      } finally {
        responder.reset();
        vi.useRealTimers();
      }
    },
  );

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

describe('ControlCluster compact controls', () => {
  it('keeps every action callable in a single compact toolbar without duplicating End', () => {
    const { actions, calls, ring, tree } = render(false, true);
    const pressables = findAll(tree, 'Pressable');
    const iconButtons = findAll(tree, 'IconButton');
    const byLabel = (label: string) =>
      iconButtons.find((control) => control.props.accessibilityLabel === label);

    (
      pressables.find(
        (control) => (control.props.accessibilityState as { checked?: boolean })?.checked === true,
      )?.props.onPress as () => void
    )();
    (
      pressables.find(
        (control) => (control.props.accessibilityState as { checked?: boolean })?.checked === false,
      )?.props.onPress as () => void
    )();
    (
      pressables.find((control) => control.props.accessibilityLabel === 'voice.mute')?.props
        .onPress as () => void
    )();
    (ring.props.onPressIn as () => void)();
    (ring.props.onPressOut as () => void)();
    (byLabel('voice.replay')?.props.onPress as () => void)();
    (byLabel('voice.interrupt')?.props.onPress as () => void)();
    (byLabel('voice.muteSpeaker')?.props.onPress as () => void)();
    (byLabel('voice.end')?.props.onPress as () => void)();

    expect(actions.mode).toHaveBeenCalledWith('push');
    expect(actions.mode).toHaveBeenCalledWith('auto');
    expect(actions.mute).toHaveBeenCalledOnce();
    expect(actions.replay).toHaveBeenCalledOnce();
    expect(actions.interrupt).toHaveBeenCalledOnce();
    expect(actions.outputMute).toHaveBeenCalledOnce();
    expect(actions.end).toHaveBeenCalledOnce();
    expect(calls).toEqual([true, false]);
    expect(
      iconButtons.filter((control) => control.props.accessibilityLabel === 'voice.end'),
    ).toHaveLength(1);
  });

  it('keeps unmute and a held press usable while the compact view is muted', () => {
    const { actions, calls, ring, tree } = render(true, true);
    const pressables = findAll(tree, 'Pressable');
    const mute = pressables.find((control) => control.props.accessibilityLabel === 'voice.unmute');

    expect(ring.props.disabled).toBeUndefined();
    (ring.props.onPressIn as () => void)();
    (ring.props.onPressOut as () => void)();
    (mute?.props.onPress as () => void)();

    expect(calls).toEqual([true, false]);
    expect(actions.mute).toHaveBeenCalledOnce();
  });
});
