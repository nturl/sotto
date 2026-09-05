/**
 * Pure-function tests for availability.ts — the voice screen's degradation
 * logic derived from the server's `GET /health` probe (contentApi.ts).
 */
import { describe, expect, it } from 'vitest';
import type { Health } from '../state/contentApi';
import { availabilityFromHealth } from './availability';

function health(overrides: Partial<Health> = {}): Health {
  return { ok: true, stt: true, llm: true, tts: true, vad: 'silero', ...overrides };
}

describe('availabilityFromHealth', () => {
  it('is unavailable/server when health is null (probe failed entirely)', () => {
    expect(availabilityFromHealth(null)).toEqual({
      status: 'unavailable',
      reason: 'server',
      missing: [],
    });
  });

  it('is ready when stt/llm/tts are all true', () => {
    expect(availabilityFromHealth(health())).toEqual({ status: 'ready' });
  });

  it('is unavailable/services naming the one service that is down', () => {
    expect(availabilityFromHealth(health({ llm: false }))).toEqual({
      status: 'unavailable',
      reason: 'services',
      missing: ['llm'],
    });
  });

  it('is unavailable/services naming all services that are down', () => {
    expect(availabilityFromHealth(health({ stt: false, tts: false }))).toEqual({
      status: 'unavailable',
      reason: 'services',
      missing: ['stt', 'tts'],
    });
  });
});
