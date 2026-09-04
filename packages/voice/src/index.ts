/**
 * @sotto/voice — VoiceProvider interface, event types, FakeVoiceProvider +
 * fixtures, LocalCascadeClient (WS transport), OpenAIRealtime stub.
 * See planning/CONTRACTS.md §5a-b.
 */

export const SOTTO_VOICE_VERSION = '0.1.0';

export * from './events.js';
export * from './provider.js';
export * from './fake.js';
// local-cascade.ts (WS-3) pre-dates provider.ts/events.ts and re-declares a
// local copy of several CONTRACTS §5a types (VoiceEvent, VoiceState,
// PassageContext, SessionOptions, VoiceProvider) as a documented stopgap —
// see the note at the top of that file. `export *` would make those
// ambiguous with the canonical ones above, so re-export only what's new
// here: the concrete provider and its options. See the WS-1 report.
export { LocalCascadeProvider, type LocalCascadeOptions } from './local-cascade.js';
export * from './transports/webrtc.js';
