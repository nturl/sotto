/**
 * Run 9 lane D directive 1: the mic control is on screen in every non-error
 * state (VERIFIED by screenshot — see planning/run9/D-report.md), but
 * pressing it while the tutor is mid-utterance used to only start capture:
 * the speakers kept going, so the learner talked over the tutor and the
 * cascade heard its own output. This is the pure decision the screen's
 * press handler runs first.
 */
import { describe, expect, it } from 'vitest';
import { micPressAction } from './micPress';

describe('micPressAction', () => {
  it('interrupts before capturing when the tutor is speaking', () => {
    expect(micPressAction('speaking')).toEqual({ interruptFirst: true, capture: true });
  });

  it('interrupts before capturing when the tutor is still generating', () => {
    expect(micPressAction('thinking')).toEqual({ interruptFirst: true, capture: true });
  });

  it('just captures when nothing is playing', () => {
    for (const state of ['listening', 'idle', 'connecting', 'paused', 'muted'] as const) {
      expect(micPressAction(state)).toEqual({ interruptFirst: false, capture: true });
    }
  });

  it('does nothing in a broken state — the recovery panel owns the screen there', () => {
    expect(micPressAction('error')).toEqual({ interruptFirst: false, capture: false });
    expect(micPressAction('ended')).toEqual({ interruptFirst: false, capture: false });
  });
});
