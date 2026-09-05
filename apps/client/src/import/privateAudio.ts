/**
 * Bare fallback for `tsc` — see platform/persistence.ts for why this
 * pattern exists. Metro always resolves `./privateAudio` to the `.web`/
 * `.native` variant first; this file is never bundled.
 */
export * from './privateAudio.native';
