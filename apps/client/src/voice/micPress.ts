/**
 * What a press on the mic control should do (run 9 lane D directive 1).
 *
 * The control itself was never hidden — it renders in every non-error
 * state and the run-9 screenshots at 375 and 1440 show it during
 * `speaking` (planning/run9/D-report.md refutes PLAN.md diagnosis 4's
 * "the screen hides the mic while speaking"). What was missing is what
 * pressing it *does* mid-utterance: the old handler only started capture,
 * so the tutor kept playing over the learner and the cascade re-heard its
 * own output through the speakers. A press while the tutor holds the floor
 * is a barge-in first, capture second.
 *
 * House pattern: a pure rule in a `.ts` sibling (micIndicator.ts,
 * voiceStartGate.ts) so the screen's handler has nothing to test.
 */
import type { VoiceState } from '@sotto/voice';

export interface MicPressAction {
  /** Call `session.interrupt()` before starting capture. */
  interruptFirst: boolean;
  /** Start (or release) capture at all. False in the states where the
   * recovery panel owns the screen and no control is on it. */
  capture: boolean;
}

/** States in which the tutor holds the audio floor: `speaking` is playing
 * PCM, `thinking` is a turn already in flight whose audio is about to
 * start. Both are barge-ins. */
const TUTOR_HAS_FLOOR: ReadonlySet<VoiceState> = new Set<VoiceState>(['speaking', 'thinking']);
const DEAD: ReadonlySet<VoiceState> = new Set<VoiceState>(['error', 'ended']);

export function micPressAction(voiceState: VoiceState): MicPressAction {
  if (DEAD.has(voiceState)) return { interruptFirst: false, capture: false };
  return { interruptFirst: TUTOR_HAS_FLOOR.has(voiceState), capture: true };
}
