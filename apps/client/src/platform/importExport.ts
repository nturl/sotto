/**
 * Bare fallback for `tsc` (see persistence.ts for why) — never bundled by
 * Metro, which always resolves `./importExport` to the `.web`/`.native`
 * variant first.
 */
export * from './importExport.native';
