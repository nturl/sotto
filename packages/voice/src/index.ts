/**
 * @sotto/voice — VoiceProvider interface, event types, FakeVoiceProvider +
 * fixtures, LocalCascadeClient (WS transport), OpenAIRealtime stub.
 *
 * WS-0 scaffold only: this package is a skeleton. WS-1 fills in
 * provider/events/fake (planning/CONTRACTS.md §5a-b); WS-3 fills in
 * src/transports/** and local-cascade*.
 */

export const SOTTO_VOICE_VERSION = '0.1.0';

/** Placeholder — WS-1 replaces with the real VoiceState union (CONTRACTS §5a). */
export type VoiceStatePlaceholder =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'paused'
  | 'muted'
  | 'reconnecting'
  | 'ended'
  | 'error';
