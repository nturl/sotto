/**
 * F2 (run7/cards/F2-voice-screen.md directive 5): what the mid-session
 * recovery panel shows for a given failure, as a pure function so the
 * mapping is unit-testable without rendering the voice screen.
 *
 * Codes: `mic_denied`, `no_input_device`, `playback_blocked`,
 * `provider_rejected_setting`, `quota_exceeded`, `byok_rate_limited` come
 * from run7/F1's error-code table (`planning/run7/F1-report.md`) —
 * `packages/voice`'s `mic-error.ts`, `openai-direct/api.ts`'s `byokError`,
 * and `web-audio.ts`'s playback-blocked detection. `cap_exhausted`/
 * `plan_required` and the generic `mic_unavailable` predate this lane.
 * Anything else (including a
 * code F1 adds later that isn't listed below) falls through to the
 * `default` branch, which is deliberately the same plain "connection lost"
 * copy the screen always had — this is the "leave a switch for the new
 * ones" the card asks for: extending this function to recognize a new code
 * is a one-branch change, nothing else on the screen has to move.
 */
import type { VoiceState } from '@sotto/voice';

export type RecoveryButton = 'tryAgain' | 'settings' | 'plans' | 'readAlone' | 'resumePlayback';

export interface RecoverySpec {
  /** i18n key for the main message. */
  messageKey: string;
  /** i18n key for an optional second, more specific hint line. */
  hintKey?: string;
  buttons: RecoveryButton[];
}

export interface RecoveryInput {
  code: string | undefined;
  limitReason: 'max_duration' | 'idle' | 'cap' | null;
  voiceState: VoiceState;
  /** Cloud-path "See plans" is only meaningful when a paid plan exists to
   * upgrade to (CloudAdapter present) — R3-S's existing `cloud.enabled` gate. */
  cloudEnabled: boolean;
}

export function recoveryPanelFor(input: RecoveryInput): RecoverySpec {
  const { code, limitReason, cloudEnabled } = input;

  if (limitReason === 'cap' || code === 'cap_exhausted' || code === 'plan_required') {
    return {
      messageKey: 'voice.limitReached',
      buttons: cloudEnabled ? ['plans', 'readAlone'] : ['readAlone'],
    };
  }
  if (limitReason === 'max_duration' || limitReason === 'idle') {
    return { messageKey: 'voice.limitReached', buttons: ['readAlone'] };
  }

  switch (code) {
    case 'mic_denied':
      return {
        messageKey: 'voice.recovery.micDenied',
        hintKey: 'voice.recovery.micDeniedHint',
        buttons: ['tryAgain', 'readAlone'],
      };
    case 'no_input_device':
      return {
        messageKey: 'voice.recovery.noInputDevice',
        buttons: ['tryAgain', 'readAlone'],
      };
    case 'mic_unavailable':
      return {
        messageKey: 'voice.micUnavailable',
        hintKey: 'voice.micUnavailableHint',
        buttons: ['tryAgain', 'settings', 'readAlone'],
      };
    case 'playback_blocked':
      return {
        messageKey: 'voice.recovery.playbackBlocked',
        buttons: ['resumePlayback', 'readAlone'],
      };
    case 'provider_rejected_setting':
      return {
        messageKey: 'voice.recovery.providerRejected',
        hintKey: 'voice.recovery.providerRejectedHint',
        buttons: ['settings', 'readAlone'],
      };
    case 'quota_exceeded':
    case 'byok_rate_limited':
      return {
        messageKey: 'voice.recovery.quota',
        hintKey: 'voice.recovery.quotaHint',
        buttons: ['settings', 'readAlone'],
      };
    default:
      // Generic connection loss: `reconnecting` state, or any other/unknown
      // error code (byok_request_failed, byok_network_failed, a future F1
      // code not yet listed above). Retry keeps the book and transcript —
      // startSession doesn't clear `captions` (only endSession does).
      return {
        messageKey: 'voice.connectionIssue',
        buttons: ['tryAgain', 'readAlone'],
      };
  }
}
