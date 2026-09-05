/**
 * The voice screen's degradation logic: the local-server probe (`GET
 * /health`, contentApi.ts) plus the in-browser tutor's capability gate
 * (WebGPU + cached models, planning/BROWSER-TUTOR.md).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LLM_MODEL, STT_MODEL, TTS_MODEL, TUTOR_MODELS } from '@sotto/voice';
import type { Health } from '../state/contentApi';
import { availabilityFromHealth, browserAvailability, resolveAvailability } from './availability';

function health(overrides: Partial<Health> = {}): Health {
  return { ok: true, stt: true, llm: true, tts: true, vad: 'silero', ...overrides };
}

/** Minimal Cache Storage stand-in: vitest/Node has no `caches`. */
function stubCaches(cachedIds: string[]): void {
  const keys = cachedIds.map((id) => ({
    url: `https://sotto.local/tutor-model/${encodeURIComponent(id)}`,
  }));
  vi.stubGlobal('caches', {
    has: async (name: string) => name === 'sotto-tutor-models' && cachedIds.length > 0,
    open: async () => ({ keys: async () => keys, put: async () => undefined }),
    delete: async () => true,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('availabilityFromHealth', () => {
  it('is unavailable/server when health is null (probe failed entirely)', () => {
    expect(availabilityFromHealth(null)).toEqual({
      status: 'unavailable',
      reason: 'server',
      missing: [],
    });
  });

  it('is ready on the local path when stt/llm/tts are all true', () => {
    expect(availabilityFromHealth(health())).toEqual({ status: 'ready', path: 'local' });
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

describe('browserAvailability', () => {
  it('is unavailable/no-webgpu when navigator.gpu is absent', async () => {
    vi.stubGlobal('navigator', {});
    stubCaches([]);
    expect(await browserAvailability()).toEqual({
      status: 'unavailable',
      reason: 'no-webgpu',
      missing: [],
    });
  });

  it('asks for a download, with sizes, when WebGPU is there but models are not', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    stubCaches([]);
    const result = await browserAvailability();
    expect(result.status).toBe('needs-download');
    if (result.status !== 'needs-download') throw new Error('unreachable');
    // Slice 2/3: TUTOR_MODELS covers all three stages now, not STT alone.
    expect(result.models.map((m) => m.id)).toEqual([STT_MODEL.id, LLM_MODEL.id, TTS_MODEL.id]);
    expect(result.models[0]?.sizeMb).toBeGreaterThan(0);
  });

  it('asks for a download naming only the stages still missing', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    stubCaches([STT_MODEL.id]);
    const result = await browserAvailability();
    expect(result.status).toBe('needs-download');
    if (result.status !== 'needs-download') throw new Error('unreachable');
    expect(result.models.map((m) => m.id)).toEqual([LLM_MODEL.id, TTS_MODEL.id]);
  });

  it('is ready on the browser path once every model is cached', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    stubCaches(TUTOR_MODELS.map((m) => m.id));
    expect(await browserAvailability()).toEqual({ status: 'ready', path: 'browser' });
  });
});

describe('resolveAvailability', () => {
  it('prefers the local server when it is healthy, even on a WebGPU browser', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    stubCaches([STT_MODEL.id]);
    expect(await resolveAvailability(health())).toEqual({ status: 'ready', path: 'local' });
  });

  it('falls through to the browser path on a static host (no /health)', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    stubCaches(TUTOR_MODELS.map((m) => m.id));
    expect(await resolveAvailability(null)).toEqual({ status: 'ready', path: 'browser' });
  });

  it('offers the download on a static host with WebGPU and no models yet', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    stubCaches([]);
    expect((await resolveAvailability(null)).status).toBe('needs-download');
  });

  it('says no-webgpu when there is neither a server nor WebGPU', async () => {
    vi.stubGlobal('navigator', {});
    stubCaches([]);
    expect(await resolveAvailability(null)).toEqual({
      status: 'unavailable',
      reason: 'no-webgpu',
      missing: [],
    });
  });

  it('keeps the specific "these services are down" message over "no WebGPU"', async () => {
    vi.stubGlobal('navigator', {});
    stubCaches([]);
    expect(await resolveAvailability(health({ tts: false }))).toEqual({
      status: 'unavailable',
      reason: 'services',
      missing: ['tts'],
    });
  });

  it('a half-configured server does not strand a capable browser', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    stubCaches(TUTOR_MODELS.map((m) => m.id));
    expect(await resolveAvailability(health({ llm: false }))).toEqual({
      status: 'ready',
      path: 'browser',
    });
  });
});
