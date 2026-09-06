/**
 * What the mic area at the bottom of the voice screen should show
 * (BUGS-TUTOR-RUN5.md #6). Auto turn-detection keeps the mic open and
 * listening, so it must not reuse the "enable push-to-talk in settings"
 * copy meant for a genuinely inactive mic — that copy is only true when
 * the session is actually muted.
 */
import type { VoiceState } from '@sotto/voice';

export type MicIndicator =
  { kind: 'push' } | { kind: 'disabled' } | { kind: 'live'; state: VoiceState };

export function micIndicator(turnDetection: 'auto' | 'push', voiceState: VoiceState): MicIndicator {
  if (turnDetection === 'push') return { kind: 'push' };
  if (voiceState === 'muted') return { kind: 'disabled' };
  return { kind: 'live', state: voiceState };
}
