/**
 * R6-B3: covers the mount state (`startControlState`) and the
 * listening-vs-connecting transition rule (`gateVoiceState`) that fix
 * "the tutor starts from a tap, not on mount".
 */
import { describe, expect, it } from 'vitest';
import {
  createListeningGate,
  gateVoiceState,
  micUnavailablePanelState,
  startControlState,
} from './voiceStartGate';

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
    for (const state of [
      'idle',
      'connecting',
      'thinking',
      'speaking',
      'muted',
      'error',
      'reconnecting',
      'ended',
    ] as const) {
      expect(gateVoiceState(state, false)).toBe(state);
      expect(gateVoiceState(state, true)).toBe(state);
    }
  });
});

describe('createListeningGate', () => {
  it('flushes a suppressed "listening" once capture becomes ready (the local path only reports listening once)', () => {
    let ready = false;
    const gate = createListeningGate(() => ready);

    // The server announces `listening` at websocket-session creation,
    // before the client's own getUserMedia/AudioContext work has resolved.
    expect(gate.onProviderState('listening')).toBe('connecting');

    // `onCaptureReady` is only ever called by the caller once the capture
    // transport's own startCapture() has actually resolved -- simulate that
    // moment by flipping `ready` immediately before calling it.
    ready = true;
    expect(gate.onCaptureReady()).toBe('listening');
    // Only flushes once -- a second call (e.g. a later no-op) is a no-op.
    expect(gate.onCaptureReady()).toBeNull();
  });

  it('does not flush anything when no "listening" was ever suppressed', () => {
    const gate = createListeningGate(() => false);
    expect(gate.onCaptureReady()).toBeNull();
  });

  it('does not flush when capture was already ready before "listening" arrived', () => {
    const gate = createListeningGate(() => true);
    expect(gate.onProviderState('listening')).toBe('listening');
    expect(gate.onCaptureReady()).toBeNull();
  });

  it('passes every other state straight through with nothing to flush later', () => {
    const gate = createListeningGate(() => false);
    expect(gate.onProviderState('thinking')).toBe('thinking');
    expect(gate.onCaptureReady()).toBeNull();
  });
});

// run7/F1 directive 5: "listening" truthfulness. `createListeningGate` is
// the one gate every provider's state stream passes through
// (sessionManager.ts's `attach`), so this drives it with each provider's
// own known ordering (per this lane's recon, scout-T-tutor.md §3) and
// asserts a "listening" is never *observed* — gated or flushed — before the
// capture transport itself is actually ready. `observed` below is what a
// listener attached to the store would see: `onProviderState`'s return
// plus any `onCaptureReady()` flush, in the order they'd really fire.
describe('createListeningGate: no provider reports listening before capture is live', () => {
  /**
   * Returns each observed entry paired with whether capture was actually
   * ready *at the moment that entry was produced* — the fact under test is
   * never "does 'listening' ever appear" (it must, eventually, or the
   * screen is stuck at "connecting" forever) but "did a 'listening' entry
   * ever appear while capture was still not ready" — that would be the lie
   * BUGS-TUTOR-RUN5 describes.
   */
  function simulate(
    events: Array<
      { kind: 'provider'; state: 'connecting' | 'listening' } | { kind: 'captureReady' }
    >,
  ): Array<{ state: string; captureReadyAtTime: boolean }> {
    let capture = false;
    const gate = createListeningGate(() => capture);
    const observed: Array<{ state: string; captureReadyAtTime: boolean }> = [];
    for (const ev of events) {
      if (ev.kind === 'captureReady') {
        capture = true;
        const flushed = gate.onCaptureReady();
        if (flushed) observed.push({ state: flushed, captureReadyAtTime: capture });
      } else {
        observed.push({ state: gate.onProviderState(ev.state), captureReadyAtTime: capture });
      }
    }
    return observed;
  }

  function assertNoPrematureListening(
    observed: Array<{ state: string; captureReadyAtTime: boolean }>,
  ) {
    for (const entry of observed) {
      if (entry.state === 'listening') expect(entry.captureReadyAtTime).toBe(true);
    }
  }

  it('own-provider (byok): connect() only emits listening after startCapture resolves — passes straight through', () => {
    const observed = simulate([
      { kind: 'provider', state: 'connecting' },
      { kind: 'captureReady' },
      { kind: 'provider', state: 'listening' },
    ]);
    assertNoPrematureListening(observed);
    expect(observed.some((e) => e.state === 'listening')).toBe(true);
  });

  it('local: the server announces listening once at session creation, before the client mic resolves — gated then flushed', () => {
    const observed = simulate([
      { kind: 'provider', state: 'listening' }, // the server's one-shot announcement
      { kind: 'captureReady' }, // getUserMedia/AudioWorklet catch up afterwards
    ]);
    // The premature report is downgraded, not passed through as a lie...
    expect(observed[0]).toMatchObject({ state: 'connecting', captureReadyAtTime: false });
    // ...and the only "listening" ever observed happens once capture is
    // actually ready (the flush, triggered by captureReady itself).
    assertNoPrematureListening(observed);
    expect(observed.some((e) => e.state === 'listening')).toBe(true);
  });

  it('browser: no capture is "ready" (WebGPU worker) until models are loaded and startCapture resolves — same as local', () => {
    const observed = simulate([
      { kind: 'provider', state: 'connecting' },
      { kind: 'provider', state: 'listening' }, // would-be premature report
      { kind: 'captureReady' },
    ]);
    assertNoPrematureListening(observed);
  });

  it('cloud (Realtime): no local capture transport to gate — captureReady is always true, listening passes through immediately', () => {
    // sessionManager.ts's `attach`: `isRealtimeAttempt` bypasses the gate
    // entirely (`state` is written straight from the provider), which is
    // sound specifically because Realtime's WebRTC mic has no separate
    // "ready" milestone the client controls — modeled here as
    // captureReady() always true, which makes the gate a no-op, matching
    // that bypass's effect.
    const gate = createListeningGate(() => true);
    expect(gate.onProviderState('listening')).toBe('listening');
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
