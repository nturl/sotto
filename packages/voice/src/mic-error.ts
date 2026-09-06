/**
 * Classifies a `startCapture()` rejection into one of the specific error
 * codes the voice screen can act on, instead of the single catch-all
 * `mic_unavailable` every provider used to report (run7/F1,
 * planning/run7/cards/F1-tutor-pipeline.md directive 5/§Defects).
 *
 * `getUserMedia` rejects with a `DOMException` whose `.name` says why
 * (MDN): `NotAllowedError`/`PermissionDeniedError` is the learner (or the
 * OS) declining the permission prompt — a "denied" state, distinct from
 * `NotFoundError`/`DevicesNotFoundError`, which means the browser found no
 * microphone hardware at all. Everything else (a busy device, an
 * `AudioWorklet` load failure, a non-browser environment) stays the
 * existing generic `mic_unavailable`.
 */
export function micErrorCode(err: unknown): 'mic_denied' | 'no_input_device' | 'mic_unavailable' {
  const name = err instanceof Error ? err.name : undefined;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'mic_denied';
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  ) {
    return 'no_input_device';
  }
  return 'mic_unavailable';
}
