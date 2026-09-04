/**
 * Wire-protocol and domain types for the voice pipeline (planning/CONTRACTS.md §5b).
 * Server-local mirror of the shapes @sotto/voice's VoiceProvider consumes over the wire.
 * Kept dependency-free (no @sotto/core) per WS-3 scope.
 */
import { z } from 'zod';

export const tutorModeSchema = z.enum(['read_to_me', 'read_with_me', 'pronunciation', 'discuss']);
export type TutorMode = z.infer<typeof tutorModeSchema>;

export const voiceStateSchema = z.enum([
  'idle',
  'connecting',
  'listening',
  'thinking',
  'speaking',
  'paused',
  'muted',
  'reconnecting',
  'ended',
  'error',
]);
export type VoiceState = z.infer<typeof voiceStateSchema>;

export const passageSentenceSchema = z.object({
  id: z.string(),
  text: z.string(),
  tokenIds: z.array(z.string()),
});

export const passageContextSchema = z.object({
  chapterTitle: z.string(),
  sentences: z.array(passageSentenceSchema),
  positionTokenId: z.string().optional(),
});
export type PassageContext = z.infer<typeof passageContextSchema>;

export const learnerContextSchema = z.object({
  level: z.enum(['A0', 'A1', 'A2']),
  learningLocale: z.string(),
  explanationLocale: z.string(),
});
export type LearnerContext = z.infer<typeof learnerContextSchema>;

/** POST /voice/session request body. */
export const sessionOptionsSchema = z.object({
  bookId: z.string(),
  chapterId: z.string(),
  mode: tutorModeSchema,
  learner: learnerContextSchema,
  passage: passageContextSchema,
  savedWords: z.array(z.string()).default([]),
});
export type SessionOptions = z.infer<typeof sessionOptionsSchema>;

/** POST /voice/session response body. */
export interface SessionCreateResponse {
  sessionId: string;
  wsUrl: string;
  sampleRate: 16000;
  limits: { maxMs: number; idleMs: number };
}

export const toolNameSchema = z.enum([
  'get_current_passage',
  'set_reading_position',
  'save_vocabulary',
  'remove_vocabulary',
  'show_explanation',
  'set_session_mode',
  'mark_section_complete',
]);
export type ToolName = z.infer<typeof toolNameSchema>;

// ---- Client -> server JSON messages ----

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('mode'), mode: tutorModeSchema }),
  z.object({ t: z.literal('mute'), muted: z.boolean() }),
  z.object({ t: z.literal('ptt'), active: z.boolean() }),
  z.object({ t: z.literal('interrupt') }),
  z.object({ t: z.literal('replay') }),
  z.object({ t: z.literal('text'), text: z.string() }),
  z.object({
    t: z.literal('tool_result'),
    callId: z.string(),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  }),
  z.object({ t: z.literal('passage'), passage: passageContextSchema }),
  z.object({ t: z.literal('end') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---- Server -> client JSON messages ----

export type ServerMessage =
  | { t: 'state'; state: VoiceState }
  | { t: 'caption'; speaker: 'learner' | 'tutor'; text: string; final: boolean }
  | { t: 'tool_call'; callId: string; name: ToolName; args: unknown }
  | { t: 'reading'; tokenIds: string[] }
  | { t: 'limit'; reason: 'max_duration' | 'idle' }
  | { t: 'error'; code: string; message: string; recoverable: boolean }
  | { t: 'audio_start'; utteranceId: string }
  | { t: 'audio_end'; utteranceId: string; cancelled?: boolean };

export interface ToolResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface SessionLimits {
  maxMs: number;
  idleMs: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}
