/**
 * Non-domain state types (toasts, live voice captions/tool log) that don't
 * belong in @sotto/core's persisted models (CONTRACTS.md §3, §4).
 */
import type { ToolName, ToolResult } from '@sotto/core';
import type { VoiceState } from '@sotto/voice';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export type CaptionEntry = {
  id: string;
  speaker: 'learner' | 'tutor';
  text: string;
  final: boolean;
  createdAt: number;
};

export type ToolEventEntry = {
  id: string;
  name: ToolName | string;
  args: unknown;
  result?: ToolResult;
  createdAt: number;
};

export type ToastEntry = {
  id: string;
  message: string;
};

export type { VoiceState };

let counter = 0;
/** Small dependency-free id generator — good enough for local-only records
 * (saved words, toasts, captions); server-issued ids (voice sessionId) come
 * from the server instead. */
export function genId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
