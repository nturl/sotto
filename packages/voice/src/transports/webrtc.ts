/**
 * WebRTC is NOT a v1 transport (planning/CONTRACTS.md §5b decision,
 * 2026-09-04): werift has no Opus codec and Pipecat would add a Python
 * runtime. WS + PCM (LocalCascadeProvider) is the reference transport; see
 * docs/architecture.md and docs/voice-pipeline.md. This file exports the
 * interface shape only, as an explicit placeholder for a future transport.
 */
import type { ToolResult, TutorMode } from '@sotto/core';
import type { VoiceEvent } from '../events.ts';
import type { SessionOptions } from '../provider.ts';

export interface WebRtcTransport {
  connect(opts: SessionOptions): Promise<void>;
  disconnect(): Promise<void>;
  setMode(mode: TutorMode): void;
  setMuted(muted: boolean): void;
  pushToTalk(active: boolean): void;
  interrupt(): void;
  replayLast(): void;
  sendText(text: string): void;
  respondTool(callId: string, result: ToolResult): void;
  on(listener: (e: VoiceEvent) => void): () => void;
}

const NOT_IMPLEMENTED_MESSAGE =
  'WebRTC transport is not implemented in v1; see docs/architecture.md';

export class NotImplementedWebRtcTransport implements WebRtcTransport {
  connect(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  disconnect(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  setMode(): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  setMuted(): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  pushToTalk(): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  interrupt(): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  replayLast(): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  sendText(): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  respondTool(): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  on(): () => void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
}
