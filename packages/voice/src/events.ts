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
  | { type: 'limit'; reason: 'max_duration' | 'idle' }
  | { type: 'error'; code: string; message: string; recoverable: boolean };
