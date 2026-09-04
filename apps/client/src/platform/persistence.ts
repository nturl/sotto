/**
 * Bare fallback so `tsc` (which does not know Metro's platform-extension
 * resolution) has something to resolve `./persistence` to when type-checking
 * the whole client program in one pass. At runtime Metro always picks
 * `persistence.web.ts` or `persistence.native.ts` first (an actual platform
 * always matches one of those), so this file is never bundled — same
 * convention as `src/ui/svg.tsx`/`svg.web.tsx`.
 */
export * from './persistence.native';
