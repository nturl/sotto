/**
 * Bare fallback so `tsc` (which does not know Metro's platform-extension
 * resolution) has something to resolve `./swCache` to when type-checking
 * the whole client program in one pass. At runtime Metro always picks
 * `swCache.web.ts` or `swCache.native.ts` first (an actual platform always
 * matches one of those), so this file is never bundled — same convention
 * as `persistence.ts`/`src/ui/svg.tsx`.
 */
export * from './swCache.native';
