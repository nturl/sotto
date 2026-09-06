/**
 * R6-B3: the voice screen used to auto-start a session in a `useEffect`
 * right after mount (B1 candidate 2 / B2's screenshot evidence), which on
 * iOS Safari raises the OS microphone sheet with no tap at all — no user
 * gesture backs the `getUserMedia`/`AudioContext` call, and the app's own
 * status dot already claims `listening` while that sheet is still pending.
 *
 * Two small pure rules, factored out (house pattern: `micIndicator.ts`) so
 * they're unit-testable without rendering the screen or a live provider:
 *
 *  - `startControlState` — what the screen's primary control area should
 *    show: nothing yet (still probing / a pre-session panel owns the
 *    screen), a "Start" button (probe resolved, capture not requested
 *    yet), or the live in-session controls.
 *  - `gateVoiceState` — a provider (or, for the local path, the server
 *    over the websocket) can report `listening` before the client's own
 *    capture transport actually has a microphone stream; until the
 *    transport confirms that, downgrade the reported state to
 *    `connecting` so a still-pending permission sheet is never shown as
 *    "listening".
 */
import type { VoiceState } from '@sotto/voice';
import type { VoiceAvailability } from './availability';

export type StartControlState = 'hidden' | 'start' | 'active';

export function startControlState(
  availabilityStatus: VoiceAvailability['status'],
  started: boolean,
): StartControlState {
  if (started) return 'active';
  if (availabilityStatus === 'ready') return 'start';
  return 'hidden';
}

export function gateVoiceState(state: VoiceState, captureReady: boolean): VoiceState {
  if (state === 'listening' && !captureReady) return 'connecting';
  return state;
}

/**
 * `gateVoiceState` alone is not enough: the local path's server reports
 * `listening` exactly once, at websocket-session creation
 * (`apps/server/src/voice/session.ts`'s constructor) — it does not repeat
 * itself once the client's capture transport catches up. A provider event
 * gated to `connecting` would otherwise strand the screen there forever,
 * since nothing re-announces `listening` afterwards. This tracks whether a
 * `listening` report was suppressed and, once the capture transport
 * actually becomes ready, tells the caller to flush that missed
 * `listening` transition through.
 */
export function createListeningGate(captureReady: () => boolean) {
  let pendingListening = false;
  return {
    /** Call for every provider state event; returns what to actually set. */
    onProviderState(state: VoiceState): VoiceState {
      const gated = gateVoiceState(state, captureReady());
      if (gated === 'connecting' && state === 'listening') pendingListening = true;
      return gated;
    },
    /** Call once the capture transport's `startCapture` resolves; returns
     * `'listening'` if a report was suppressed waiting for exactly this,
     * otherwise `null` (nothing to flush). */
    onCaptureReady(): VoiceState | null {
      if (!pendingListening) return null;
      pendingListening = false;
      return 'listening';
    },
  };
}

/**
 * R6-B3 (B1 candidate 3): the mid-session `isBroken` panel used to be a
 * dead end for `mic_unavailable` — a plain message and only "Read alone",
 * with no way to actually fix the mic and continue. This decides which of
 * the panel's extra recovery pieces (a platform-aware hint line, a "Try
 * again" that re-runs the Start path, and a button to the setting's own
 * screen) apply — every other broken-session error code keeps its plain,
 * single-button panel.
 */
export interface MicUnavailablePanelState {
  showHint: boolean;
  showTryAgain: boolean;
  showSettings: boolean;
}

export function micUnavailablePanelState(errorCode: string | undefined): MicUnavailablePanelState {
  const isMicUnavailable = errorCode === 'mic_unavailable';
  return { showHint: isMicUnavailable, showTryAgain: isMicUnavailable, showSettings: isMicUnavailable };
}
