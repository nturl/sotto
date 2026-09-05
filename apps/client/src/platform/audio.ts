/**
 * Narration playback adapter (TASK §C): plays a chapter's mp3 with
 * transport controls (play/pause, seek, rate) for the reader's narration
 * bar and for a tapped word's audio slice. Cross-platform — expo-audio
 * supports web + native from the same API, so no platform split is needed
 * here (unlike the voice-session AudioAdapter, which needs raw PCM I/O).
 */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';

export type NarrationSpeed = 0.75 | 1 | 1.25;

export type NarrationPlayerState = {
  isLoaded: boolean;
  playing: boolean;
  positionMs: number;
  durationMs: number;
};

const INITIAL_STATE: NarrationPlayerState = {
  isLoaded: false,
  playing: false,
  positionMs: 0,
  durationMs: 0,
};

/** Plays a single chapter's narration mp3 from `uri`; recreated whenever
 * `uri` changes. `uri` may be undefined when the chapter has no narration. */
export function useNarrationPlayer(uri: string | undefined, rate: NarrationSpeed = 1) {
  const [state, setState] = useState<NarrationPlayerState>(INITIAL_STATE);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    if (!uri) {
      playerRef.current?.remove();
      playerRef.current = null;
      setState(INITIAL_STATE);
      return undefined;
    }
    const player = createAudioPlayer({ uri });
    playerRef.current = player;
    setState(INITIAL_STATE);

    const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      setState({
        isLoaded: status.isLoaded,
        playing: status.playing,
        positionMs: Math.max(0, status.currentTime * 1000),
        durationMs: Math.max(0, (status.duration ?? 0) * 1000),
      });
    });

    return () => {
      sub.remove();
      player.remove();
      playerRef.current = null;
    };
  }, [uri]);

  useEffect(() => {
    playerRef.current?.setPlaybackRate(rate);
  }, [rate, state.isLoaded]);

  // The playbackStatusUpdate event is too coarse to drive word-by-word
  // speech fill; poll the player's own currentTime at ~60ms while playing
  // (CONTRACTS/TASK §C: "poll at 60 ms via the player status ... on web").
  useEffect(() => {
    if (!state.playing) return undefined;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setState((s) =>
        s.playing ? { ...s, positionMs: Math.max(0, player.currentTime * 1000) } : s,
      );
    }, 60);
    return () => clearInterval(interval);
  }, [state.playing]);

  return {
    ...state,
    play: () => playerRef.current?.play(),
    pause: () => playerRef.current?.pause(),
    seekTo: (seconds: number) => void playerRef.current?.seekTo(Math.max(0, seconds)),
    seekBy: (deltaSeconds: number) => {
      const player = playerRef.current;
      if (!player) return;
      void player.seekTo(Math.max(0, player.currentTime + deltaSeconds));
    },
  };
}

/** Padding around a tapped word's aligned span. Whisper spans are
 * contiguous (a word's endMs is the next word's startMs — see the es-419
 * packs), so padding must stay small or the slice bleeds into the
 * neighbouring words; what it buys is a softer onset/offset than a hard
 * cut exactly on the boundary. */
export const WORD_SLICE_LEAD_MS = 40;
export const WORD_SLICE_TAIL_MS = 80;
/** Words are replayed a touch slower than the narration so a learner can
 * hear the syllables; pitch-corrected so the voice doesn't drop. */
export const WORD_SLICE_RATE = 0.85;

/** Plays a single word's audio slice (startMs..endMs) from the chapter mp3,
 * for the reader's translation-sheet speaker button. Fire-and-forget: a new
 * short-lived player is created per tap and released when it stops.
 *
 * Must be called synchronously from the tap handler. iOS WebKit only lets a
 * fresh media element start inside a user gesture, and the old flow called
 * play() after load + seek had resolved, long after the tap: silent on
 * iPhone Safari/PWA. So the element is started muted right inside the tap
 * (which unlocks it), then once loaded it is paused, seeked to the word,
 * unmuted and resumed; an unlocked element may be resumed outside a gesture.
 *
 * The stop timer is armed only once the seek has resolved and playback
 * has started (the earlier timer was armed at load, so seek latency ate
 * into the window and cut the word off); position updates on web arrive
 * at ~250 ms `timeupdate` granularity, so they only serve as a backstop. */
export function playAudioSlice(uri: string, startMs: number, endMs: number): void {
  const player = createAudioPlayer({ uri }, { updateInterval: 40 });
  const startSeconds = Math.max(0, startMs - WORD_SLICE_LEAD_MS) / 1000;
  const endSeconds = (Math.max(endMs, startMs + 250) + WORD_SLICE_TAIL_MS) / 1000;
  let started = false;
  let stopped = false;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (fallback) clearTimeout(fallback);
    sub.remove();
    player.pause();
    player.remove();
  };
  const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
    if (stopped || !status.isLoaded) return;
    if (!started) {
      started = true;
      player.pause();
      player.setPlaybackRate(WORD_SLICE_RATE, 'high');
      void player.seekTo(startSeconds).then(() => {
        if (stopped) return;
        player.muted = false;
        player.play();
        const windowMs = ((endSeconds - startSeconds) / WORD_SLICE_RATE) * 1000;
        fallback = setTimeout(stop, windowMs + 30);
      });
      return;
    }
    if (status.didJustFinish || (status.playing && status.currentTime >= endSeconds)) stop();
  });
  // Muted pre-roll from 0 inside the gesture: unlocks the element on iOS
  // without an audible blip of the chapter opening.
  player.muted = true;
  player.play();
}

/** Padding for the narration-slice fallback used when a tapped word has
 * no sprite entry (word-audio hasn't been generated for this book, or the
 * token is punctuation/untracked). Distinct from WORD_SLICE_LEAD/TAIL_MS
 * above (which `playAudioSlice` uses for multi-word span selections) so
 * this single-word fallback can carry its own fade-out. */
const WORD_FALLBACK_LEAD_MS = 80;
const WORD_FALLBACK_TAIL_MS = 150;
const WORD_FALLBACK_MIN_WINDOW_MS = 250;
const WORD_FALLBACK_RATE = 0.85;
const WORD_FALLBACK_FADE_MS = 60;

/** Shared engine behind the sprite and fallback word-audio paths: same
 * muted-preroll-then-seek-then-play iOS unlock trick as `playAudioSlice`,
 * plus an optional short volume-ramp fade-out near the end of the window
 * (web only — native audio players here don't expose a per-frame gain
 * ramp, so native just keeps the padded slice, per the R3-W ledger note). */
function playSlice(
  uri: string,
  startMs: number,
  endMs: number,
  opts: { leadMs: number; tailMs: number; minWindowMs: number; rate: number; fadeOutMs: number },
): void {
  const player = createAudioPlayer({ uri }, { updateInterval: 40 });
  const startSeconds = Math.max(0, startMs - opts.leadMs) / 1000;
  const endSeconds = (Math.max(endMs, startMs + opts.minWindowMs) + opts.tailMs) / 1000;
  let started = false;
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    timers.forEach(clearTimeout);
    sub.remove();
    player.pause();
    player.remove();
  };
  const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
    if (stopped || !status.isLoaded) return;
    if (!started) {
      started = true;
      player.pause();
      player.setPlaybackRate(opts.rate, 'high');
      void player.seekTo(startSeconds).then(() => {
        if (stopped) return;
        player.muted = false;
        player.volume = 1;
        player.play();
        const windowMs = ((endSeconds - startSeconds) / opts.rate) * 1000;
        if (Platform.OS === 'web' && opts.fadeOutMs > 0 && opts.fadeOutMs < windowMs) {
          const fadeSteps = 6;
          const stepMs = opts.fadeOutMs / fadeSteps;
          timers.push(
            setTimeout(() => {
              if (stopped) return;
              let step = 0;
              const rampId = setInterval(() => {
                step += 1;
                player.volume = Math.max(0, 1 - step / fadeSteps);
                if (step >= fadeSteps) clearInterval(rampId);
              }, stepMs);
              timers.push(rampId as unknown as ReturnType<typeof setTimeout>);
            }, windowMs - opts.fadeOutMs),
          );
        }
        timers.push(setTimeout(stop, windowMs + 30));
      });
      return;
    }
    if (status.didJustFinish || (status.playing && status.currentTime >= endSeconds)) stop();
  });
  player.muted = true;
  player.play();
}

export interface WordAudioOptions {
  /** The book's `audio/words.mp3`/`.wav` sprite URL, or undefined when the
   * book has no word-audio (older pack, or narrate hasn't run for it). */
  spriteUri: string | undefined;
  /** The book's `audio/words.json` index (`normalized -> [startMs,
   * endMs]`), loaded once per book — see the reader's word-audio index
   * cache. Undefined while it's still loading or absent. */
  index: Record<string, [number, number]> | undefined;
  normalized: string;
  /** Narration-slice fallback used when the word has no sprite entry. */
  fallback: { uri: string; startMs: number; endMs: number };
}

/** Plays a tapped word's pronunciation for the translation panel's speaker
 * button (TASK/R3-W): prefers a clean, standalone clip from the book's
 * word-audio sprite (synthesized alone with Kokoro, not sliced out of the
 * chapter narration — see `sotto-content word-audio` and the R3-W ledger
 * note on why the old narration-slice approach clipped words). Falls back
 * silently to a softened, padded narration slice when the word has no
 * sprite entry. Must be called synchronously from the tap handler (same
 * iOS-gesture constraint as `playAudioSlice`). */
export function playWordAudio(opts: WordAudioOptions): void {
  const span = opts.spriteUri ? opts.index?.[opts.normalized] : undefined;
  if (opts.spriteUri && span) {
    playSlice(opts.spriteUri, span[0], span[1], {
      leadMs: 0,
      tailMs: 0,
      minWindowMs: 0,
      rate: 1,
      fadeOutMs: 0,
    });
    return;
  }
  playSlice(opts.fallback.uri, opts.fallback.startMs, opts.fallback.endMs, {
    leadMs: WORD_FALLBACK_LEAD_MS,
    tailMs: WORD_FALLBACK_TAIL_MS,
    minWindowMs: WORD_FALLBACK_MIN_WINDOW_MS,
    rate: WORD_FALLBACK_RATE,
    fadeOutMs: WORD_FALLBACK_FADE_MS,
  });
}
