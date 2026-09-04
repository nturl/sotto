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

/** Plays a single word's audio slice (startMs..endMs) from the chapter mp3,
 * for the reader's translation-sheet speaker button. Fire-and-forget: a new
 * short-lived player is created per tap and released when it stops. */
export function playAudioSlice(uri: string, startMs: number, endMs: number): void {
  const player = createAudioPlayer({ uri });
  const durationSeconds = Math.max(0.05, (endMs - startMs) / 1000);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    player.pause();
    player.remove();
  };
  const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
    if (status.isLoaded && !stopped) {
      void player.seekTo(startMs / 1000).then(() => player.play());
      sub.remove();
      setTimeout(stop, durationSeconds * 1000 + 60);
    }
  });
}
