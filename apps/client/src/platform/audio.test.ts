import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Fake `expo-audio` player standing in for the native module: records
 * pause()/remove() calls so a test can assert a previous word clip was
 * stopped before a new one starts (R6-C2 commit 1). The real player's
 * `addListener('playbackStatusUpdate', ...)` drives `playSlice`'s
 * seek-then-play state machine (see audio.ts), so this fake fires that
 * status once synchronously on `play()` with `isLoaded: true` so the
 * seek promise resolves in the same microtask tick the test awaits. */
type Listener = (status: { isLoaded: boolean; playing?: boolean; didJustFinish?: boolean; currentTime?: number }) => void;

const players: Array<{
  uri: string;
  pause: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  setPlaybackRate: ReturnType<typeof vi.fn>;
  muted: boolean;
  volume: number;
  addListener: ReturnType<typeof vi.fn>;
}> = [];

// The real `react-native` package ships Flow syntax vitest/rollup can't
// parse; audio.ts only needs `Platform.OS` (for the web-only fade-out),
// irrelevant to the cancellation behaviour under test here.
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

vi.mock('expo-audio', () => ({
  createAudioPlayer: (source: { uri: string }) => {
    let listener: Listener | undefined;
    const player = {
      uri: source.uri,
      pause: vi.fn(),
      remove: vi.fn(),
      seekTo: vi.fn(() => Promise.resolve()),
      setPlaybackRate: vi.fn(),
      muted: true,
      volume: 1,
      addListener: vi.fn((_event: string, l: Listener) => {
        listener = l;
        return { remove: vi.fn() };
      }),
      play: vi.fn(() => {
        // Fire the "loaded" status synchronously so playSlice's seek path
        // runs; the promise it queues (seekTo) settles on a later
        // microtask that the test flushes with `await Promise.resolve()`.
        listener?.({ isLoaded: true });
      }),
    };
    players.push(player);
    return player;
  },
}));

describe('playWordAudio cancels the previous clip', () => {
  beforeEach(() => {
    players.length = 0;
  });

  it('stops the first player before the second starts playing', async () => {
    const { playWordAudio } = await import('./audio.ts');

    playWordAudio({
      spriteUri: 'sprite.mp3',
      index: { hola: [0, 400] },
      normalized: 'hola',
      fallback: { uri: 'chapter.mp3', startMs: 0, endMs: 400 },
    });
    // Flush the seekTo microtask so the first player's `play()` after seek
    // (and thus its listener being attached to state) has run.
    await Promise.resolve();
    await Promise.resolve();

    const first = players[0];
    // `remove()` only happens inside `stop()` — the internal seek/play
    // handshake pauses the player too, so `remove` (not `pause`) is the
    // signal that the first clip's stop path (with its listener and
    // fallback timer) ran, not just normal playback bookkeeping.
    expect(first.remove).not.toHaveBeenCalled();

    playWordAudio({
      spriteUri: 'sprite.mp3',
      index: { adios: [400, 800] },
      normalized: 'adios',
      fallback: { uri: 'chapter.mp3', startMs: 400, endMs: 800 },
    });

    expect(first.pause).toHaveBeenCalled();
    expect(first.remove).toHaveBeenCalledTimes(1);
    expect(players.length).toBe(2);
  });
});
