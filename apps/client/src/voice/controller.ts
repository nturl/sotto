/**
 * Pure event-wiring between a VoiceProvider and the tutor tools (CONTRACTS
 * §5a/§5c). Factored out of `useVoiceSession` so it's unit-testable without
 * rendering a hook (TASK §F): instantiate with a FakeVoiceProvider + a fake
 * ToolExecutionContext, feed it a clock, and assert on the callbacks.
 */
import { executeTool, type ToolExecutionContext, type ToolResult } from '@sotto/core';
import { systemClock, type VoiceClock, type VoiceProvider, type VoiceState } from '@sotto/voice';
import { holdSpeaking } from './playbackHold';

export interface VoiceControllerCallbacks {
  onState(state: VoiceState): void;
  onCaption(entry: {
    speaker: 'learner' | 'tutor';
    text: string;
    final: boolean;
    /** run7/G directive 1(b): threaded from the VoiceEvent's `notSpoken`
     * (a caption whose speech synthesis failed). */
    notSpoken?: boolean;
  }): void;
  onReading(tokenIds: string[]): void;
  onLimit(reason: 'max_duration' | 'idle' | 'cap'): void;
  onError(entry: { code: string; message: string; recoverable: boolean }): void;
  onToolEvent(entry: { name: string; args: unknown; result: ToolResult }): void;
  /** R3-S: cloud-path minutes-remaining ticker (CLOUD-API.md `{t:'usage'}`).
   * Optional — every other provider never emits `usage`, so callers that
   * don't care about it can omit this. */
  onUsage?(entry: { secondsUsed: number; remainingSeconds: number }): void;
}

/**
 * Run 9 lane D directive 3: a provider that knows how much tutor audio is
 * still queued for playback. Declared structurally rather than added to
 * the shared `VoiceProvider` interface (packages/voice is another lane's
 * file this run) — a provider without it simply never holds a state back.
 * `BrowserCascadeProvider` implements it.
 */
interface PlaybackAware {
  playbackRemainingMs?(): number;
}

export interface VoiceControllerOptions {
  /** Injectable for tests; production passes the real timers. */
  clock?: VoiceClock;
}

export function createVoiceController(
  provider: VoiceProvider,
  ctx: ToolExecutionContext,
  callbacks: VoiceControllerCallbacks,
  options: VoiceControllerOptions = {},
): { unsubscribe: () => void } {
  const clock = options.clock ?? systemClock;
  const remainingMs = (): number => (provider as PlaybackAware).playbackRemainingMs?.() ?? 0;

  // PLAN.md diagnosis 4: the turn runner posts `listening` when generation
  // ends, not when the speakers stop, so the label and the audio disagreed
  // for the length of the last queued sentence. Hold `listening` back
  // until the queue has drained; `epoch` makes a newer state event win
  // over a pending flush, so an error or a barge-in is never overwritten
  // by a stale "listening" landing late.
  let epoch = 0;
  const publish = (state: VoiceState): void => {
    epoch += 1;
    const mine = epoch;
    const decide = (candidate: VoiceState): void => {
      const held = holdSpeaking(candidate, remainingMs());
      callbacks.onState(held.state);
      if (held.flushInMs === null) return;
      clock.setTimeout(() => {
        if (epoch !== mine) return;
        decide(candidate);
      }, held.flushInMs);
    };
    decide(state);
  };

  const unsubscribe = provider.on((event) => {
    switch (event.type) {
      case 'state':
        publish(event.state);
        break;
      case 'caption':
        callbacks.onCaption({
          speaker: event.speaker,
          text: event.text,
          final: event.final,
          ...(event.notSpoken ? { notSpoken: true } : {}),
        });
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
