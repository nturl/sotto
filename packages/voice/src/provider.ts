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
  /** run7/F1: resumes playback after a `playback_blocked` error event — the
   * action a tap can call. Optional: only providers backed by a
   * `WebAudioAdapter`-shaped transport (local/browser/byok cascades) have
   * anything to resume; Realtime's `<audio>` element and the fake provider
   * don't implement it. */
  resumePlayback?(): void;
  /** Typed fallback for when voice input isn't available or wanted. */
  sendText(text: string): void;
  respondTool(callId: string, result: ToolResult): void;
  on(listener: (e: VoiceEvent) => void): () => void;
}
