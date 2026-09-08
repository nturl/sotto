/**
 * Which learner caption gets the "Not what you said? Type it" affordance
 * (run 9 lane D directive 2).
 *
 * Noel's run 9 report: the learner bubble read the single word "you" —
 * Whisper's stock hallucination on near-silence — and there was no way to
 * tell the tutor it had misheard. Lane A stops most of those reaching the
 * model at all; this is the escape hatch for the ones that still do.
 *
 * Only on the paths where speech-to-text runs on this device (the browser
 * cascade and the local server): the learner is correcting a transcript
 * the client itself produced and can resend as text. In own-provider mode
 * (`byok`) and on the hosted cloud path the audio goes straight to the
 * provider — there is no local transcript to disagree with, and offering
 * the affordance there would imply a correction that changes nothing.
 */
import type { CaptionEntry } from '../state/types';
import type { VoicePath } from './availability';

const LOCAL_STT_PATHS: ReadonlySet<VoicePath> = new Set<VoicePath>(['browser', 'local']);

/**
 * The id of the caption to hang the affordance on, or `null` for none.
 * Only ever the most recent *final* learner turn — an earlier one is
 * already answered, and a partial one is still being transcribed.
 */
export function correctableCaptionId(
  captions: readonly CaptionEntry[],
  path: VoicePath | undefined,
): string | null {
  if (!path || !LOCAL_STT_PATHS.has(path)) return null;
  for (let i = captions.length - 1; i >= 0; i--) {
    const entry = captions[i]!;
    if (entry.speaker !== 'learner' || !entry.final) continue;
    return entry.id;
  }
  return null;
}
