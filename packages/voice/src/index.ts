/**
 * @sotto/voice — VoiceProvider interface, event types, FakeVoiceProvider +
 * fixtures, LocalCascadeClient (WS transport), OpenAIRealtime stub.
 * See planning/CONTRACTS.md §5a-b.
 */

export const SOTTO_VOICE_VERSION = '0.1.0';

// WS-4 fix: these were `.js`-extension imports (the source files are
// `.ts`). That resolves fine under tsc/vitest/tsx (the standard
// TS-over-ESM convention), but Metro — which bundles apps/client — resolves
// relative specifiers literally and has no `.js`->`.ts` mapping, so any
// client screen importing @sotto/voice failed to bundle with
// "Unable to resolve ./events.js" etc. No client screen imported
// @sotto/voice before WS-4's reader/voice screens, so this was latent.
// Matches @sotto/core/src/index.ts's own convention, which already uses
// `.ts` extensions directly. See the WS-4 report.
export * from './events.ts';
export * from './provider.ts';
export * from './fake.ts';
// local-cascade.ts (WS-3) pre-dates provider.ts/events.ts and re-declares a
// local copy of several CONTRACTS §5a types (VoiceEvent, VoiceState,
// PassageContext, SessionOptions, VoiceProvider) as a documented stopgap —
// see the note at the top of that file. `export *` would make those
// ambiguous with the canonical ones above, so re-export only what's new
// here: the concrete provider and its options. See the WS-1 report.
export { LocalCascadeProvider, type LocalCascadeOptions } from './local-cascade.ts';
export * from './transports/webrtc.ts';
// WS-4 addition: the client's web AudioAdapter (LocalCascadeProvider's mic
// capture/tutor playback transport) needs the concrete WebAudioAdapter and
// the AudioAdapter interface it implements; neither was re-exported from
// the package root. Minimal fix, not a §5a/§5b contract change — see the
// WS-4 report.
export { WebAudioAdapter } from './transports/web-audio.ts';
export type { AudioAdapter } from './transports/audio-adapter.ts';
