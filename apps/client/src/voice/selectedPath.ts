import type { VoiceAvailability, VoicePath } from './availability';

export function selectedPath(
  availability: VoiceAvailability,
  requested?: VoicePath | null,
): VoicePath | undefined {
  if (availability.status !== 'ready') return undefined;
  const offered = availability.alternatives ?? [availability.path];
  if (requested) return offered.includes(requested) ? requested : undefined;
  return offered.includes('cloud') ? 'cloud' : availability.path;
}

let remembered: VoicePath | null = null;
export function rememberedVoicePath(): VoicePath | null {
  return remembered;
}
export function rememberVoicePath(path: VoicePath): void {
  remembered = path;
}
