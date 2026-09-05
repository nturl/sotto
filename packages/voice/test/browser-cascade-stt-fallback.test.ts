/**
 * Pure unit tests for the STT/LLM-contention fallback (stt-fallback.ts) —
 * see docs/evidence/browser-tutor-stt-regression-2026-09-05.log for the
 * regression this defends against. No models, no worker: fake timings and
 * fake transcripts only.
 */
import { describe, expect, it } from 'vitest';
import {
  isDegenerateTranscript,
  STT_LATENCY_FALLBACK_MS,
  SttFallbackTracker,
} from '../src/browser-cascade/stt-fallback.ts';

describe('isDegenerateTranscript', () => {
  it('flags the observed "de de de de..." failure mode', () => {
    expect(isDegenerateTranscript('de de de de de de de de')).toBe(true);
  });

  it('flags two alternating tokens repeated', () => {
    expect(isDegenerateTranscript('de la de la de la de la')).toBe(true);
  });

  it('flags low-uniqueness repetition on a longer transcript', () => {
    expect(isDegenerateTranscript('de de de de que de de de significa de de de')).toBe(true);
  });

  it('does not flag a real short answer', () => {
    expect(isDegenerateTranscript('sí')).toBe(false);
    expect(isDegenerateTranscript('no gracias')).toBe(false);
  });

  it('does not flag a real question', () => {
    expect(isDegenerateTranscript('¿Qué significa la palabra cigarra?')).toBe(false);
  });

  it('does not flag genuine short repetition in real speech', () => {
    expect(isDegenerateTranscript('no no espera')).toBe(false);
  });

  it('does not flag empty text', () => {
    expect(isDegenerateTranscript('')).toBe(false);
  });
});

describe('SttFallbackTracker', () => {
  it('does not fall back on a fast, clean webgpu attempt', () => {
    const t = new SttFallbackTracker();
    expect(t.shouldFallback('webgpu', { ms: 1050, text: 'cigarra' })).toBe(false);
    expect(t.hasFallenBack).toBe(false);
  });

  it('falls back on a slow webgpu attempt even with clean text', () => {
    const t = new SttFallbackTracker();
    expect(t.shouldFallback('webgpu', { ms: STT_LATENCY_FALLBACK_MS + 1, text: 'cigarra' })).toBe(
      true,
    );
    expect(t.hasFallenBack).toBe(true);
  });

  it('falls back on a degenerate webgpu attempt even if fast', () => {
    const t = new SttFallbackTracker();
    expect(t.shouldFallback('webgpu', { ms: 500, text: 'de de de de de' })).toBe(true);
    expect(t.hasFallenBack).toBe(true);
  });

  it('never triggers off a wasm attempt (wasm is the fallback, not the trigger)', () => {
    const t = new SttFallbackTracker();
    expect(t.shouldFallback('wasm', { ms: 21_000, text: 'de de de de de' })).toBe(false);
    expect(t.hasFallenBack).toBe(false);
  });

  it('only trips once per session', () => {
    const t = new SttFallbackTracker();
    expect(t.shouldFallback('webgpu', { ms: 21_000, text: 'de de de de' })).toBe(true);
    expect(t.shouldFallback('webgpu', { ms: 21_000, text: 'de de de de' })).toBe(false);
    expect(t.hasFallenBack).toBe(true);
  });

  it('consumeNote returns the note exactly once, after a trip, never before', () => {
    const t = new SttFallbackTracker();
    expect(t.consumeNote()).toBeNull();
    t.shouldFallback('webgpu', { ms: 21_000, text: 'de de de de' });
    expect(t.consumeNote()).toBe(
      'Switching to a slower but more reliable speech recognizer for this session.',
    );
    expect(t.consumeNote()).toBeNull();
  });
});
