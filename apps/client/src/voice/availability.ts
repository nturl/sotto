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
// 'cloud' (R3-S): the hosted broker (CLOUD-API.md "Voice broker (C3)"),
// available only when a CloudAdapter is configured and the signed-in
// learner's plan has minutes left.
export type VoicePath = 'local' | 'browser' | 'cloud';

export type VoiceAvailability =
  | { status: 'checking' }
  // `alternatives`: every path the gate found usable, not just the one
  // chosen as `path` — the voice screen's chip row (R3-S) reads this to
  // offer a switch on desktop, where local/browser tutors AND the cloud
  // path can all exist at once. Omitted (or a single-element array) when
  // there's nothing to choose between; every pre-R3-S caller that only
  // reads `.path` keeps working unchanged.
  | { status: 'ready'; path: VoicePath; alternatives?: VoicePath[] }
  | { status: 'needs-download'; models: TutorModelSpec[] }
  | { status: 'unavailable'; reason: 'server' | 'services'; missing: VoiceService[] }
  | { status: 'unavailable'; reason: 'no-webgpu'; missing: VoiceService[] };

/** Whether the cloud voice path can run right now: a CloudAdapter is
 * configured, the learner is signed in, and their plan has minutes left
 * (PAYWALL.md: free stays free for the local/browser tutor, but the cloud
 * path is a paid feature). Pure/sync so `resolveAvailability` stays easy to
 * unit test — callers resolve `useMe()` themselves and pass the verdict in. */
export function cloudPathUsable(me: {
  status: 'no-cloud' | 'loading' | 'signed-out' | 'signed-in';
  me?: { entitlement: { plan: string; tutorMinutesRemaining: number } };
}): boolean {
  if (me.status !== 'signed-in' || !me.me) return false;
  return me.me.entitlement.plan !== 'free' && me.me.entitlement.tutorMinutesRemaining > 0;
}

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
 *
 * R3-S `cloud` gate (both new params optional/omittable, so every existing
 * caller — including every prior unit test — keeps its exact behavior):
 * on a phone (`isDesktop: false`, the default), a usable cloud path is
 * preferred outright, matching PAYWALL.md's phone-vs-desktop framing (phone
 * users don't get the in-browser/local dev tutor in practice, so cloud is
 * strictly better when it's there). On desktop, local/browser stay the
 * chosen `path` (that's still the free option and the fastest one — no
 * network hop), but a usable cloud path is added to `alternatives` so the
 * voice screen can offer it as a chip.
 */
export async function resolveAvailability(
  health: Health | null,
  opts?: { cloudUsable?: boolean; isDesktop?: boolean },
): Promise<VoiceAvailability> {
  const cloudUsable = opts?.cloudUsable ?? false;
  const isDesktop = opts?.isDesktop ?? false;

  if (cloudUsable && !isDesktop) return { status: 'ready', path: 'cloud' };

  const local = availabilityFromHealth(health);
  if (local.status === 'ready') {
    return cloudUsable
      ? { status: 'ready', path: 'local', alternatives: ['local', 'cloud'] }
      : local;
  }

  const browser = await browserAvailability();
  if (browser.status === 'ready') {
    return cloudUsable
      ? { status: 'ready', path: 'browser', alternatives: ['browser', 'cloud'] }
      : browser;
  }
  if (browser.status !== 'unavailable') return browser;

  if (cloudUsable) return { status: 'ready', path: 'cloud' };

  // Neither local/browser path, and no usable cloud path either. Prefer the
  // more specific message: if a server answered and named which services
  // are down, say that; otherwise say "no WebGPU".
  return local.status === 'unavailable' && local.reason === 'services' ? local : browser;
}
