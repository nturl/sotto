/**
 * BUGS-TUTOR-RUN5.md #6: in auto turn-detection the mic is open and
 * listening, but the voice screen always rendered the greyed "enable
 * push-to-talk in settings" mic + hint, contradicting the live state shown
 * at the top of the same screen. `micIndicator` is the pure decision the
 * screen renders from; it must only fall back to the disabled hint when
 * push-to-talk is the selected mode, or the session is genuinely muted.
 */
import { describe, expect, it } from 'vitest';
import { micIndicator } from './micIndicator';

describe('micIndicator', () => {
  it('shows the push-to-talk ring when that is the selected turn-detection mode', () => {
    expect(micIndicator('push', 'listening')).toEqual({ kind: 'push' });
    expect(micIndicator('push', 'idle')).toEqual({ kind: 'push' });
  });

  it('shows a live state indicator in auto mode whenever the mic is actually open', () => {
    expect(micIndicator('auto', 'listening')).toEqual({ kind: 'live', state: 'listening' });
    expect(micIndicator('auto', 'thinking')).toEqual({ kind: 'live', state: 'thinking' });
    expect(micIndicator('auto', 'speaking')).toEqual({ kind: 'live', state: 'speaking' });
  });

  it('only shows the disabled push-to-talk hint in auto mode when the session is muted', () => {
    expect(micIndicator('auto', 'muted')).toEqual({ kind: 'disabled' });
  });
});
