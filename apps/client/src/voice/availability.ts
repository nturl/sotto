/**
 * Pure helper that turns a `/health` probe result (contentApi.ts) into the
 * voice screen's availability state, so the screen can degrade clearly
 * instead of silently starting a session that fails.
 */
import type { Health } from '../state/contentApi';

export type VoiceService = 'stt' | 'llm' | 'tts';

export type VoiceAvailability =
  | { status: 'checking' }
  | { status: 'ready' }
  | { status: 'unavailable'; reason: 'server' | 'services'; missing: VoiceService[] };

export function availabilityFromHealth(health: Health | null): VoiceAvailability {
  if (!health) return { status: 'unavailable', reason: 'server', missing: [] };

  const missing: VoiceService[] = (['stt', 'llm', 'tts'] as const).filter(
    (service) => !health[service],
  );
  if (missing.length > 0) return { status: 'unavailable', reason: 'services', missing };

  return { status: 'ready' };
}
