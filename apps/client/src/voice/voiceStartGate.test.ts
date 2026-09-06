/**
 * R6-B3: covers the mount state (`startControlState`) and the
 * listening-vs-connecting transition rule (`gateVoiceState`) that fix
 * "the tutor starts from a tap, not on mount".
 */
import { describe, expect, it } from 'vitest';
import { gateVoiceState, micUnavailablePanelState, startControlState } from './voiceStartGate';

describe('startControlState', () => {
  it('shows nothing while the availability probe is still checking, even before any tap', () => {
    expect(startControlState('checking', false)).toBe('hidden');
  });

  it('shows nothing when a pre-session panel owns the screen (needs-download/unavailable)', () => {
    expect(startControlState('needs-download', false)).toBe('hidden');
    expect(startControlState('unavailable', false)).toBe('hidden');
  });

  it('shows the Start control once the probe resolves ready, before any tap', () => {
    expect(startControlState('ready', false)).toBe('start');
  });

  it('shows the active in-session controls once started, regardless of availability status', () => {
    expect(startControlState('ready', true)).toBe('active');
    // A book/chapter identity change can flip availability while a session
    // from a previous mount is still resuming; `started` wins.
    expect(startControlState('checking', true)).toBe('active');
  });
});

describe('gateVoiceState', () => {
  it('downgrades a reported "listening" state to "connecting" until capture is ready', () => {
    expect(gateVoiceState('listening', false)).toBe('connecting');
  });

  it('passes "listening" through once capture is ready', () => {
    expect(gateVoiceState('listening', true)).toBe('listening');
  });

  it('leaves every other state untouched regardless of capture readiness', () => {
    for (const state of ['idle', 'connecting', 'thinking', 'speaking', 'muted', 'error', 'reconnecting', 'ended'] as const) {
      expect(gateVoiceState(state, false)).toBe(state);
      expect(gateVoiceState(state, true)).toBe(state);
    }
  });
});

describe('micUnavailablePanelState', () => {
  it('offers the hint, a Try again, and a Settings link for a mic_unavailable error', () => {
    expect(micUnavailablePanelState('mic_unavailable')).toEqual({
      showHint: true,
      showTryAgain: true,
      showSettings: true,
    });
  });

  it('offers none of them for any other broken-session error code', () => {
    expect(micUnavailablePanelState('session_create_failed')).toEqual({
      showHint: false,
      showTryAgain: false,
      showSettings: false,
    });
    expect(micUnavailablePanelState(undefined)).toEqual({
      showHint: false,
      showTryAgain: false,
      showSettings: false,
    });
  });
});
