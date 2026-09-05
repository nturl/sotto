/**
 * Which tutor, if any, this browser can run — and what the voice screen
 * should say when it can't.
 *
 * Two paths (planning/BROWSER-TUTOR.md):
 *   - 'local'   apps/server is answering /health with stt+llm+tts up. The
 *               dev path, and the only one on a phone browser without WebGPU.
 *   - 'browser' no server (the static host on Vercel), but the browser has
 *               WebGPU and the tutor models are already in its cache.
 * When there's no server AND the models aren't downloaded yet, this reports
 * `needs-download` with sizes so the screen can offer the opt-in; when there
 * is no WebGPU either, `unavailable/no-webgpu`.
 */
import { cachedModelIds, hasWebGpu, TUTOR_MODELS, type TutorModelSpec } from '@sotto/voice';
import type { Health } from '../state/contentApi';

export type VoiceService = 'stt' | 'llm' | 'tts';
export type VoicePath = 'local' | 'browser';

export type VoiceAvailability =
  | { status: 'checking' }
  | { status: 'ready'; path: VoicePath }
  | { status: 'needs-download'; models: TutorModelSpec[] }
  | { status: 'unavailable'; reason: 'server' | 'services'; missing: VoiceService[] }
  | { status: 'unavailable'; reason: 'no-webgpu'; missing: VoiceService[] };

/** The local-server verdict on its own (pure; still unit-tested directly). */
export function availabilityFromHealth(health: Health | null): VoiceAvailability {
  if (!health) return { status: 'unavailable', reason: 'server', missing: [] };

  const missing: VoiceService[] = (['stt', 'llm', 'tts'] as const).filter(
    (service) => !health[service],
  );
  if (missing.length > 0) return { status: 'unavailable', reason: 'services', missing };

  return { status: 'ready', path: 'local' };
}

/** The in-browser verdict on its own. Async: reading the model cache is. */
export async function browserAvailability(
  models: TutorModelSpec[] = TUTOR_MODELS,
): Promise<VoiceAvailability> {
  if (!hasWebGpu()) return { status: 'unavailable', reason: 'no-webgpu', missing: [] };
  const cached = new Set(await cachedModelIds());
  const missing = models.filter((m) => !cached.has(m.id));
  if (missing.length > 0) return { status: 'needs-download', models: missing };
  return { status: 'ready', path: 'browser' };
}

/**
 * The whole gate. A reachable, healthy local server always wins: it runs a
 * far bigger model on the machine's own GPU with no download at all. Only
 * when there's no server (the static host: /health 404s, so `health` is
 * null) do we consider the browser path.
 *
 * A server that answers but has a service down is a real, nameable local
 * misconfiguration — but it should not strand a WebGPU browser that could
 * run the tutor itself, so it falls through too.
 */
export async function resolveAvailability(health: Health | null): Promise<VoiceAvailability> {
  const local = availabilityFromHealth(health);
  if (local.status === 'ready') return local;

  const browser = await browserAvailability();
  if (browser.status !== 'unavailable') return browser;

  // Neither path. Prefer the more specific message: if a server answered and
  // named which services are down, say that; otherwise say "no WebGPU".
  return local.status === 'unavailable' && local.reason === 'services' ? local : browser;
}
