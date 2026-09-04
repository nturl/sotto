/**
 * Bare fallback for `tsc` (see persistence.ts for why) — never bundled by
 * Metro, which always resolves `./audio-adapter` to the `.web`/`.native`
 * variant first.
 */
export * from './audio-adapter.native';
