/**
 * OpenAIRealtimeProvider — interface-only stub (planning/CONTRACTS.md §5a:
 * "throws NotImplemented, interface only"). Not wired up in v1: the shipped
 * cascade is LocalCascadeProvider over apps/server's WebSocket pipeline.
 *
 * What a real implementation would need:
 *  - A server endpoint that mints a short-lived OpenAI Realtime client secret
 *    (never ship the raw API key to the client).
 *  - A WebRTC peer connection for audio in/out plus a data channel for
 *    session.update, response events, tool calls, and captions — see
 *    docs/architecture.md's WebRTC decision note for why that transport
 *    layer isn't built in v1 (packages/voice/src/transports/webrtc.ts).
 *  - Mapping OpenAI Realtime's tool-call/response/turn events onto this
 *    package's VoiceEvent union so it's a drop-in alternative to
 *    LocalCascadeProvider from the client's point of view.
 */
import type { ToolResult, TutorMode } from '@sotto/core';
import type { VoiceEvent } from '../events.ts';
import type { SessionOptions, VoiceProvider } from '../provider.ts';

const NOT_IMPLEMENTED_MESSAGE =
  'OpenAIRealtimeProvider is not implemented; interface stub only (planning/CONTRACTS.md §5a)';

export class OpenAIRealtimeProvider implements VoiceProvider {
  connect(_opts: SessionOptions): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  disconnect(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  setMode(_mode: TutorMode): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  setMuted(_muted: boolean): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  pushToTalk(_active: boolean): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  interrupt(): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  replayLast(): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  sendText(_text: string): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  respondTool(_callId: string, _result: ToolResult): void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  on(_listener: (e: VoiceEvent) => void): () => void {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
}
