/**
 * Narration playback adapter (TASK §C): plays a chapter's mp3 with
 * transport controls (play/pause, seek, rate) for the reader's narration
 * bar and for a tapped word's audio slice. Cross-platform — expo-audio
 * supports web + native from the same API, so no platform split is needed
 * here (unlike the voice-session AudioAdapter, which needs raw PCM I/O).
 */
import { useEffect, useRef, useState } from 'react';
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
