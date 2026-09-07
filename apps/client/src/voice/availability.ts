/**
 * Which tutor, if any, this browser can run — and what the voice screen
 * should say when it can't.
 *
 * Two paths (planning/BROWSER-TUTOR.md):
 *   - 'local'   apps/server is answering /health with stt+llm+tts up. The
 *               dev path, and the only one on a phone browser without WebGPU.
 *   - 'browser' no server (the static host on Vercel), but the browser has
 *               WebGPU and the tutor models are already in its cache.
 *   - 'byok'    no server and (usually) no WebGPU, but the learner has
 *               stored their own OpenAI key on this device, so the page can
 *               run the same cascade straight against api.openai.com
 *               (R4-B2, docs/byok.md).
 * When there's no server AND the models aren't downloaded yet, this reports
 * `needs-download` with sizes so the screen can offer the opt-in; when there
 * is no WebGPU either, `unavailable/no-webgpu`.
 */
import {
  cachedModelIds,
  DEFAULT_TIER,
  hasWebGpu,
  modelsForTier,
  type TutorModelSpec,
  type TutorTier,
} from '@sotto/voice';
import type { Health } from '../state/contentApi';
import { hasByokKey } from './byokKey';

export type VoiceService = 'stt' | 'llm' | 'tts';
// 'cloud' (R3-S): the hosted broker (CLOUD-API.md "Voice broker (C3)"),
// available only when a CloudAdapter is configured and the signed-in
// learner's plan has minutes left.
// 'byok' (R4-B2): the learner's own OpenAI key, stored on this device
// (byokKey.ts), driving OpenAIDirectProvider straight against
// api.openai.com. No account, no server of ours, no model download.
export type VoicePath = 'local' | 'browser' | 'cloud' | 'byok';

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

/** Whether the bring-your-own-key path can run right now: a key is stored
 * on this device. Async because native secure storage is; the value itself
 * never leaves byokKey.ts. */
export async function byokPathUsable(): Promise<boolean> {
  return hasByokKey();
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

/**
 * Whether this machine can be offered the LARGE tutor tier (whisper-small +
 * Qwen3.5 4B, ~2.8 GB of weights resident): true when
 * `navigator.deviceMemory` reports at least 8 GB, and — on browsers that
 * don't expose `deviceMemory` at all, Safari being the one that matters —
 * when the WebGPU adapter's own limits are large enough to hold a 4B model's
 * biggest buffers: a storage-buffer binding of at least 1 GiB and a maximum
 * buffer size of at least 2 GiB. Those two limits are what an adapter on a
 * small integrated GPU actually caps, so they stand in for the RAM figure
 * Safari won't give us.
 *
 * False (never "unknown"): the picker disables the large row rather than
 * offering a download that will fail three-quarters of the way in, and the
 * standard tier is always available as the answer.
 */
export async function deviceSupportsLargeTier(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    gpu?: { requestAdapter(): Promise<{ limits: Record<string, number> } | null> };
  };
  if (typeof nav.deviceMemory === 'number') return nav.deviceMemory >= 8;
  if (!nav.gpu) return false;
  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return false;
    const limits = adapter.limits ?? {};
    return (
      (limits.maxStorageBufferBindingSize ?? 0) >= 1024 ** 3 &&
      (limits.maxBufferSize ?? 0) >= 2 * 1024 ** 3
    );
  } catch {
    // A browser that throws on requestAdapter() is in no position to run
    // the big tier either.
    return false;
  }
}

/** The in-browser verdict on its own. Async: reading the model cache is.
 * Defaults to the standard tier's models; callers that know the learner's
 * "Tutor size" preference pass that tier's list instead. */
export async function browserAvailability(
  models: TutorModelSpec[] = modelsForTier(DEFAULT_TIER),
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
 * R4-B2 `byok` gate: a stored key beats the browser tutor and beats
 * `needs-download` — it needs no download and works without WebGPU, which
 * is exactly a phone's situation — but it loses to a usable cloud path
 * (already paid for, no key to manage) and, on desktop, to a healthy local
 * server (free, no network hop, a bigger model). On a phone it therefore
 * wins over everything except cloud; on desktop the order is local, then
 * byok, then browser. Wherever a chip row makes sense, it is added to
 * `alternatives` so the learner can switch.
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
  opts?: {
    cloudUsable?: boolean;
    isDesktop?: boolean;
    byokUsable?: boolean;
    /** The learner's "Tutor size" (preferences.tutorModelTier). Decides
     * WHICH models `needs-download` asks for; defaults to `standard`. */
    tier?: TutorTier;
  },
): Promise<VoiceAvailability> {
  const cloudUsable = opts?.cloudUsable ?? false;
  const isDesktop = opts?.isDesktop ?? false;
  // Resolved here when the caller didn't (the real app doesn't have to know
  // about key storage); passed in explicitly by the unit tests.
  const byokUsable = opts?.byokUsable ?? (await byokPathUsable());

  const withByok = (paths: VoicePath[]): VoicePath[] => (byokUsable ? [...paths, 'byok'] : paths);

  if (cloudUsable && !isDesktop) {
    return byokUsable
      ? { status: 'ready', path: 'cloud', alternatives: ['cloud', 'byok'] }
      : { status: 'ready', path: 'cloud' };
  }

  const local = availabilityFromHealth(health);
  if (local.status === 'ready') {
    const alternatives = withByok(cloudUsable ? ['local', 'cloud'] : ['local']);
    return alternatives.length > 1 ? { status: 'ready', path: 'local', alternatives } : local;
  }

  // No local server. On a phone the key beats the in-browser tutor outright
  // (no download, no WebGPU needed); on desktop the browser tutor is free,
  // so byok is offered as an alternative rather than chosen.
  if (byokUsable && !isDesktop) {
    return { status: 'ready', path: 'byok' };
  }

  const browser = await browserAvailability(modelsForTier(opts?.tier ?? DEFAULT_TIER));
  if (browser.status === 'ready') {
    const alternatives = withByok(cloudUsable ? ['browser', 'cloud'] : ['browser']);
    return alternatives.length > 1 ? { status: 'ready', path: 'browser', alternatives } : browser;
  }

  // Desktop with a stored key but no local server and no usable browser
  // tutor (no WebGPU, or models not downloaded): the key runs the tutor
  // rather than showing a download panel the learner doesn't need.
  if (byokUsable) {
    return cloudUsable
      ? { status: 'ready', path: 'byok', alternatives: ['byok', 'cloud'] }
      : { status: 'ready', path: 'byok' };
  }

  if (browser.status !== 'unavailable') return browser;

  if (cloudUsable) return { status: 'ready', path: 'cloud' };

  // Neither local/browser path, no key, and no usable cloud path either.
  // Prefer the more specific message: if a server answered and named which
  // services are down, say that; otherwise say "no WebGPU".
  return local.status === 'unavailable' && local.reason === 'services' ? local : browser;
}
