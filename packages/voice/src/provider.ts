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
  /** run7/G directive 1(d) — the book's real title, for the prompt's "Book:"
   * line (scout-T-tutor.md §4 found every call site passing `bookId` there
   * instead). Optional so existing callers/fixtures that only have the id
   * keep compiling; providers fall back to `bookId` when it's missing. */
  bookTitle?: string;
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
  /**
   * run7/G directive 1(a): silences or restores tutor speech playback for
   * the rest of the session without ending capture — distinct from
   * `setMuted` (mutes the microphone) and `interrupt` (one-shot barge-in).
   * Optional: only providers backed by a `WebAudioAdapter`-shaped transport
   * implement it today (local/browser/byok cascades); Realtime's `<audio>`
   * element and the fake provider don't.
   */
  setOutputMuted?(muted: boolean): void;
  /**
   * run7/G directive 1(b): re-synthesizes and plays one sentence of text —
   * the Replay action on a transcript turn whose `notSpoken: true` caption
   * means its speech synthesis failed the first time (its cached audio, if
   * any, is incomplete or missing, so a generic `replayLast()` can't help).
   * Optional: only providers that emit `notSpoken` implement it today
   * (`OpenAIDirectProvider`, the only one whose TTS calls can fail
   * independently of the LLM turn — see `packages/voice/src/events.ts`).
   */
  replaySentence?(text: string): void;
  /** Typed fallback for when voice input isn't available or wanted. */
  sendText(text: string): void;
  respondTool(callId: string, result: ToolResult): void;
  on(listener: (e: VoiceEvent) => void): () => void;
}
