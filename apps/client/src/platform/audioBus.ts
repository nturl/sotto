/**
 * Audio arbitration bus (run7 lane D §5): exactly one of narration, word
 * audio, and tutor speech may be sounding at a time. There is no shared
 * `AudioContext`/session across those three subsystems (narration + word
 * audio use `expo-audio` via `src/platform/audio.ts`; tutor speech uses its
 * own `AudioContext` in `packages/voice/src/transports/web-audio.ts`), so
 * this module is a plain in-memory registry, not a real audio-session API:
 * each side calls `claimAudio(owner, stop)` right before it starts sound,
 * and this stops whichever other owner was last holding the bus.
 *
 * `owner` is one of the three fixed identities named in the run7 card.
 * `apps/client/src/platform/audio.ts` wires 'narration' (useNarrationPlayer)
 * and 'word' (playAudioSlice / playWordAudio) into this bus directly (lane
 * D owns both files). Tutor speech (`packages/voice`, lane F1) is *not*
 * wired here — this file only defines the interface; F1 should call
 * `claimAudio('tutor', <pause the in-flight speech>)` from
 * `speakSentence`/its playback start, and `releaseAudio('tutor')` when
 * speech ends, so tapping a word or starting narration cuts tutor audio
 * (and starting tutor speech cuts narration/word audio) instead of the two
 * layers overlapping. See planning/run7/D-report.md for the exact call
 * sites this would touch in packages/voice.
 */

export type AudioOwner = 'narration' | 'word' | 'tutor';

type StopFn = () => void;

let current: { owner: AudioOwner; stop: StopFn } | null = null;

/**
 * Claims the bus for `owner`, stopping whatever other owner currently holds
 * it (no-op if `owner` already holds it — re-claiming just replaces the
 * stop callback, e.g. a second word tap while the first word clip is still
 * playing). Must be called synchronously, right before the caller starts
 * making sound.
 */
export function claimAudio(owner: AudioOwner, stop: StopFn): void {
  if (current && current.owner !== owner) {
    current.stop();
  }
  current = { owner, stop };
}

/** Releases the bus if `owner` is still the current holder (a stale release
 * from an owner that has already been superseded by a later claim is a
 * no-op — it must not clear a different owner's slot). Callers should
 * release when their own playback ends naturally (not only when stopped by
 * another claim, which already clears `current` via the next `claimAudio`). */
export function releaseAudio(owner: AudioOwner): void {
  if (current?.owner === owner) current = null;
}

/** The owner currently holding the bus, or null if nothing is playing
 * through it. Exposed for tests and for UI that wants to reflect which
 * layer is sounding. */
export function currentAudioOwner(): AudioOwner | null {
  return current?.owner ?? null;
}

/** Test-only: clears bus state between specs. Not for app code. */
export function __resetAudioBusForTests(): void {
  current = null;
}
