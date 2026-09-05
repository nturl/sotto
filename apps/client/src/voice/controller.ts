/**
 * Pure event-wiring between a VoiceProvider and the tutor tools (CONTRACTS
 * §5a/§5c). Factored out of `useVoiceSession` so it's unit-testable without
 * rendering a hook (TASK §F): instantiate with a FakeVoiceProvider + a fake
 * ToolExecutionContext, feed it a clock, and assert on the callbacks.
 */
import { executeTool, type ToolExecutionContext, type ToolResult } from '@sotto/core';
import type { VoiceProvider, VoiceState } from '@sotto/voice';

export interface VoiceControllerCallbacks {
  onState(state: VoiceState): void;
  onCaption(entry: { speaker: 'learner' | 'tutor'; text: string; final: boolean }): void;
  onReading(tokenIds: string[]): void;
  onLimit(reason: 'max_duration' | 'idle' | 'cap'): void;
  onError(entry: { code: string; message: string; recoverable: boolean }): void;
  onToolEvent(entry: { name: string; args: unknown; result: ToolResult }): void;
  /** R3-S: cloud-path minutes-remaining ticker (CLOUD-API.md `{t:'usage'}`).
   * Optional — every other provider never emits `usage`, so callers that
   * don't care about it can omit this. */
  onUsage?(entry: { secondsUsed: number; remainingSeconds: number }): void;
}

export function createVoiceController(
  provider: VoiceProvider,
  ctx: ToolExecutionContext,
  callbacks: VoiceControllerCallbacks,
): { unsubscribe: () => void } {
  const unsubscribe = provider.on((event) => {
    switch (event.type) {
      case 'state':
        callbacks.onState(event.state);
        break;
      case 'caption':
        callbacks.onCaption({ speaker: event.speaker, text: event.text, final: event.final });
        break;
      case 'reading':
        callbacks.onReading(event.tokenIds);
        break;
      case 'limit':
        callbacks.onLimit(event.reason);
        break;
      case 'error':
        callbacks.onError({
          code: event.code,
          message: event.message,
          recoverable: event.recoverable,
        });
        break;
      case 'tool_call':
        void executeTool(event.name, event.args, ctx).then((result) => {
          provider.respondTool(event.callId, result);
          callbacks.onToolEvent({ name: event.name, args: event.args, result });
        });
        break;
      case 'usage':
        callbacks.onUsage?.({
          secondsUsed: event.secondsUsed,
          remainingSeconds: event.remainingSeconds,
        });
        break;
    }
  });
  return { unsubscribe };
}
