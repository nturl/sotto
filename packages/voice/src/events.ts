/**
 * Voice event/state types shared by every VoiceProvider (planning/CONTRACTS.md §5a).
 */
import type { ToolName } from '@sotto/core';

export type VoiceState =
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

export type VoiceEvent =
  | { type: 'state'; state: VoiceState }
  | { type: 'caption'; speaker: 'learner' | 'tutor'; text: string; final: boolean }
  | { type: 'tool_call'; callId: string; name: ToolName; args: unknown }
  | { type: 'reading'; tokenIds: string[] }
  // 'cap' (R3-S, CLOUD-API.md's `{ t: 'limit', reason: 'cap' }`): the cloud
  // voice path's minute cap ran out mid-session. Additive to the local
  // provider's existing 'max_duration'/'idle' reasons — every switch over
  // `reason` written before this still compiles unchanged, since none of
  // them declared a default/never-exhaustiveness check on this union.
  | { type: 'limit'; reason: 'max_duration' | 'idle' | 'cap' }
  // 'usage' (R3-S): cloud-path minutes-remaining ticker, sent every 30s per
  // CLOUD-API.md's wire-protocol addendum. Only the cloud path emits this;
  // every other provider simply never sends it.
  | { type: 'usage'; secondsUsed: number; remainingSeconds: number }
  | { type: 'error'; code: string; message: string; recoverable: boolean };
