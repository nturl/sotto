/**
 * VoiceProvider interface (planning/CONTRACTS.md §5a).
 */
import type { BookLevel, PassageContextResult, TutorMode, ToolResult } from '@sotto/core';
import type { VoiceEvent } from './events.ts';

/** Alias kept for readability at call sites; same shape as core's tool passage result. */
export type PassageContext = PassageContextResult;

export interface SessionLearner {
  level: BookLevel;
  learningLocale: string;
  explanationLocale: string;
}

export interface SessionOptions {
  bookId: string;
  chapterId: string;
  mode: TutorMode;
  learner: SessionLearner;
  passage: PassageContext;
  savedWords: string[];
}

export interface VoiceProvider {
  connect(opts: SessionOptions): Promise<void>;
  disconnect(): Promise<void>;
  setMode(mode: TutorMode): void;
  setMuted(muted: boolean): void;
  /** Only meaningful when turnDetection = 'push'. */
  pushToTalk(active: boolean): void;
  /** Stop tutor speech now (barge-in). */
  interrupt(): void;
  replayLast(): void;
  /** Typed fallback for when voice input isn't available or wanted. */
  sendText(text: string): void;
  respondTool(callId: string, result: ToolResult): void;
  on(listener: (e: VoiceEvent) => void): () => void;
}
