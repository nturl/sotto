import { describe, expect, it } from 'vitest';
import { recoveryPanelFor } from './recoveryPanel';

function input(overrides: Partial<Parameters<typeof recoveryPanelFor>[0]> = {}) {
  return {
    code: undefined,
    limitReason: null,
    voiceState: 'error' as const,
    cloudEnabled: false,
    ...overrides,
  };
}

describe('recoveryPanelFor', () => {
  it('mic denied: try again + read alone, with the platform hint', () => {
    const spec = recoveryPanelFor(input({ code: 'mic_denied' }));
    expect(spec.messageKey).toBe('voice.recovery.micDenied');
    expect(spec.hintKey).toBe('voice.recovery.micDeniedHint');
    expect(spec.buttons).toEqual(['tryAgain', 'readAlone']);
  });

  it('no input device: distinct message from denied', () => {
    const spec = recoveryPanelFor(input({ code: 'no_input_device' }));
    expect(spec.messageKey).toBe('voice.recovery.noInputDevice');
    expect(spec.messageKey).not.toBe('voice.recovery.micDenied');
  });

  it('connection lost (reconnecting, no specific code): retry keeps the book, no settings link', () => {
    const spec = recoveryPanelFor(input({ voiceState: 'reconnecting' }));
    expect(spec.messageKey).toBe('voice.connectionIssue');
    expect(spec.buttons).toContain('tryAgain');
    expect(spec.buttons).not.toContain('settings');
  });

  it("provider rejected the setting: links to the guided flow, no try-again (retrying won't fix a dead key)", () => {
    const spec = recoveryPanelFor(input({ code: 'provider_rejected_setting' }));
    expect(spec.messageKey).toBe('voice.recovery.providerRejected');
    expect(spec.buttons).toEqual(['settings', 'readAlone']);
  });

  it('quota exceeded and byok rate limited share the same quota copy', () => {
    const a = recoveryPanelFor(input({ code: 'quota_exceeded' }));
    const b = recoveryPanelFor(input({ code: 'byok_rate_limited' }));
    expect(a.messageKey).toBe('voice.recovery.quota');
    expect(b.messageKey).toBe('voice.recovery.quota');
  });

  it('blocked playback: offers a resume action, not a session retry', () => {
    const spec = recoveryPanelFor(input({ code: 'playback_blocked' }));
    expect(spec.messageKey).toBe('voice.recovery.playbackBlocked');
    expect(spec.buttons).toEqual(['resumePlayback', 'readAlone']);
  });

  it('plan required / cap exhausted: See plans only when cloud is enabled', () => {
    const withCloud = recoveryPanelFor(input({ code: 'plan_required', cloudEnabled: true }));
    const withoutCloud = recoveryPanelFor(input({ code: 'cap_exhausted', cloudEnabled: false }));
    expect(withCloud.buttons).toContain('plans');
    expect(withoutCloud.buttons).not.toContain('plans');
  });

  it('an unrecognized/future code falls back to the generic connection-lost panel (the "leave a switch" case)', () => {
    const spec = recoveryPanelFor(input({ code: 'some_future_f1_code' }));
    expect(spec.messageKey).toBe('voice.connectionIssue');
    expect(spec.buttons).toEqual(['tryAgain', 'readAlone']);
  });

  it('existing generic mic_unavailable keeps its settings link (pre-F1-split behavior)', () => {
    const spec = recoveryPanelFor(input({ code: 'mic_unavailable' }));
    expect(spec.buttons).toEqual(['tryAgain', 'settings', 'readAlone']);
  });
});
