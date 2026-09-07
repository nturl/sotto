/**
 * The voice screen's degradation logic: the local-server probe (`GET
 * /health`, contentApi.ts) plus the in-browser tutor's capability gate
 * (WebGPU + cached models, planning/BROWSER-TUTOR.md).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LLM_MODEL, modelsForTier, STT_MODEL, TTS_MODEL, TUTOR_MODELS } from '@sotto/voice';
import type { Health } from '../state/contentApi';
import {
  availabilityFromHealth,
  browserAvailability,
  byokPathUsable,
  cloudPathUsable,
  deviceSupportsLargeTier,
  resolveAvailability,
} from './availability';

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

describe('deviceSupportsLargeTier', () => {
  it('trusts navigator.deviceMemory when the browser reports it', async () => {
    vi.stubGlobal('navigator', { deviceMemory: 8, gpu: {} });
    expect(await deviceSupportsLargeTier()).toBe(true);
  });

  it('rules the large tier out under 8 GB of reported memory', async () => {
    vi.stubGlobal('navigator', { deviceMemory: 4, gpu: {} });
    expect(await deviceSupportsLargeTier()).toBe(false);
  });

  it('never consults the GPU when deviceMemory answered', async () => {
    const requestAdapter = vi.fn();
    vi.stubGlobal('navigator', { deviceMemory: 16, gpu: { requestAdapter } });
    expect(await deviceSupportsLargeTier()).toBe(true);
    expect(requestAdapter).not.toHaveBeenCalled();
  });

  // Safari exposes no deviceMemory at all: fall back to the WebGPU
  // adapter's own buffer limits.
  it('accepts a WebGPU adapter with big enough buffer limits (no deviceMemory)', async () => {
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => ({
          limits: { maxStorageBufferBindingSize: 2 ** 31, maxBufferSize: 4 * 1024 ** 3 },
        }),
      },
    });
    expect(await deviceSupportsLargeTier()).toBe(true);
  });

  it('rejects an adapter whose maxBufferSize is under 2 GiB', async () => {
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => ({
          limits: { maxStorageBufferBindingSize: 2 ** 31, maxBufferSize: 1024 ** 3 },
        }),
      },
    });
    expect(await deviceSupportsLargeTier()).toBe(false);
  });

  it('rejects an adapter whose maxStorageBufferBindingSize is under 1 GiB', async () => {
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => ({
          limits: { maxStorageBufferBindingSize: 128 * 1024 * 1024, maxBufferSize: 4 * 1024 ** 3 },
        }),
      },
    });
    expect(await deviceSupportsLargeTier()).toBe(false);
  });

  it('is false with no deviceMemory and no WebGPU at all', async () => {
    vi.stubGlobal('navigator', {});
    expect(await deviceSupportsLargeTier()).toBe(false);
  });

  it('is false when requestAdapter returns null or throws', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => null } });
    expect(await deviceSupportsLargeTier()).toBe(false);
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => {
          throw new Error('no adapter');
        },
      },
    });
    expect(await deviceSupportsLargeTier()).toBe(false);
  });
});

describe('the tutor tier the gate evaluates', () => {
  it("asks for the large tier's models when that tier is chosen", async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    // Only the standard tier is cached, so the large tier still needs one.
    stubCaches(TUTOR_MODELS.map((m) => m.id));
    const result = await resolveAvailability(null, { tier: 'large' });
    expect(result.status).toBe('needs-download');
    const missing = result.status === 'needs-download' ? result.models.map((m) => m.id) : [];
    expect(missing).toEqual(
      modelsForTier('large')
        .filter((m) => !TUTOR_MODELS.some((s) => s.id === m.id))
        .map((m) => m.id),
    );
  });

  it('is ready on the browser path once the large tier is cached', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    stubCaches(modelsForTier('large').map((m) => m.id));
    expect(await resolveAvailability(null, { tier: 'large' })).toEqual({
      status: 'ready',
      path: 'browser',
    });
  });

  it('defaults to the standard tier when no tier is passed', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    stubCaches(TUTOR_MODELS.map((m) => m.id));
    expect(await resolveAvailability(null)).toEqual({ status: 'ready', path: 'browser' });
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

describe('cloudPathUsable', () => {
  it('is false with no cloud, while loading, and signed out', () => {
    expect(cloudPathUsable({ status: 'no-cloud' })).toBe(false);
    expect(cloudPathUsable({ status: 'loading' })).toBe(false);
    expect(cloudPathUsable({ status: 'signed-out' })).toBe(false);
  });

  it('is false on the free plan even when signed in', () => {
    expect(
      cloudPathUsable({
        status: 'signed-in',
        me: { entitlement: { plan: 'free', tutorMinutesRemaining: 0 } },
      }),
    ).toBe(false);
  });

  it('is false on a paid plan with no minutes left', () => {
    expect(
      cloudPathUsable({
        status: 'signed-in',
        me: { entitlement: { plan: 'standard', tutorMinutesRemaining: 0 } },
      }),
    ).toBe(false);
  });

  it('is true on a paid plan with minutes remaining', () => {
    expect(
      cloudPathUsable({
        status: 'signed-in',
        me: { entitlement: { plan: 'standard', tutorMinutesRemaining: 42 } },
      }),
    ).toBe(true);
  });
});

describe('resolveAvailability — R3-S cloud gate', () => {
  it('prefers a usable cloud path outright on phone, even over a ready local server', async () => {
    expect(await resolveAvailability(health(), { cloudUsable: true, isDesktop: false })).toEqual({
      status: 'ready',
      path: 'cloud',
    });
  });

  it('on desktop, keeps local as the chosen path but offers cloud as an alternative', async () => {
    expect(await resolveAvailability(health(), { cloudUsable: true, isDesktop: true })).toEqual({
      status: 'ready',
      path: 'local',
      alternatives: ['local', 'cloud'],
    });
  });

  it('on desktop with no local server, offers browser+cloud when the browser tutor is ready', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    stubCaches(TUTOR_MODELS.map((m) => m.id));
    expect(await resolveAvailability(null, { cloudUsable: true, isDesktop: true })).toEqual({
      status: 'ready',
      path: 'browser',
      alternatives: ['browser', 'cloud'],
    });
  });

  it('falls back to cloud alone when neither local nor browser is available', async () => {
    vi.stubGlobal('navigator', {});
    stubCaches([]);
    expect(await resolveAvailability(null, { cloudUsable: true, isDesktop: true })).toEqual({
      status: 'ready',
      path: 'cloud',
    });
  });

  it('is unchanged from the pre-R3-S default when cloudUsable is omitted', async () => {
    expect(await resolveAvailability(health())).toEqual({ status: 'ready', path: 'local' });
  });
});

describe('resolveAvailability — R4-B2 byok gate', () => {
  it('on a phone with no server, a stored key beats the download prompt outright', async () => {
    vi.stubGlobal('navigator', {});
    stubCaches([]);
    expect(await resolveAvailability(null, { byokUsable: true, isDesktop: false })).toEqual({
      status: 'ready',
      path: 'byok',
    });
  });

  it('on a phone, a usable cloud path still wins, with byok offered alongside', async () => {
    expect(
      await resolveAvailability(null, { byokUsable: true, cloudUsable: true, isDesktop: false }),
    ).toEqual({ status: 'ready', path: 'cloud', alternatives: ['cloud', 'byok'] });
  });

  it('on desktop, a healthy local server stays the chosen path with byok as an alternative', async () => {
    expect(await resolveAvailability(health(), { byokUsable: true, isDesktop: true })).toEqual({
      status: 'ready',
      path: 'local',
      alternatives: ['local', 'byok'],
    });
  });

  it('on desktop with no server, the free browser tutor is chosen and byok offered', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    stubCaches(TUTOR_MODELS.map((m) => m.id));
    expect(await resolveAvailability(null, { byokUsable: true, isDesktop: true })).toEqual({
      status: 'ready',
      path: 'browser',
      alternatives: ['browser', 'byok'],
    });
  });

  it('on desktop with no server and no WebGPU, the key runs the tutor', async () => {
    vi.stubGlobal('navigator', {});
    stubCaches([]);
    expect(await resolveAvailability(null, { byokUsable: true, isDesktop: true })).toEqual({
      status: 'ready',
      path: 'byok',
    });
  });

  it('on desktop with no server, no WebGPU and a paid plan, offers byok and cloud', async () => {
    vi.stubGlobal('navigator', {});
    stubCaches([]);
    expect(
      await resolveAvailability(null, { byokUsable: true, cloudUsable: true, isDesktop: true }),
    ).toEqual({ status: 'ready', path: 'byok', alternatives: ['byok', 'cloud'] });
  });

  it('without a stored key nothing changes: no server and no WebGPU is still no-webgpu', async () => {
    vi.stubGlobal('navigator', {});
    stubCaches([]);
    expect(await resolveAvailability(null, { byokUsable: false, isDesktop: true })).toEqual({
      status: 'unavailable',
      reason: 'no-webgpu',
      missing: [],
    });
  });

  it('byokPathUsable answers false when no key is stored on this device', async () => {
    await expect(byokPathUsable()).resolves.toBe(false);
  });
});
