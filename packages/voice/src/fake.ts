/**
 * FakeVoiceProvider (planning/CONTRACTS.md §5a): a deterministic, clock-driven
 * VoiceProvider that plays back scripts from `packages/voice/fixtures/<mode>.json`.
 * Used behind `EXPO_PUBLIC_VOICE=fake` for demos/tests without a live cascade.
 */
import type { ToolName, ToolResult, TutorMode } from '@sotto/core';
import type { VoiceEvent } from './events.ts';
import type { SessionOptions, VoiceProvider } from './provider.ts';

import readToMeScript from '../fixtures/read_to_me.json';
import readWithMeScript from '../fixtures/read_with_me.json';
import pronunciationScript from '../fixtures/pronunciation.json';
import discussScript from '../fixtures/discuss.json';

interface ToolResultBranches {
  onOk?: ScriptStep[];
  onError?: ScriptStep[];
}

type ScriptStep =
  | { kind: 'event'; delayMs: number; event: VoiceEvent }
  | {
      kind: 'toolCall';
      delayMs: number;
      name: ToolName;
      args: unknown;
      onResult?: ToolResultBranches;
    }
  | { kind: 'waitForText'; next: ScriptStep[] };

interface VoiceScript {
  mode: TutorMode;
  steps: ScriptStep[];
}

const SCRIPTS: Record<TutorMode, VoiceScript> = {
  read_to_me: readToMeScript as unknown as VoiceScript,
  read_with_me: readWithMeScript as unknown as VoiceScript,
  pronunciation: pronunciationScript as unknown as VoiceScript,
  discuss: discussScript as unknown as VoiceScript,
};

/**
 * The minimal clock shape FakeVoiceProvider needs. Tests inject a
 * manually-advanced fake; production code can pass the real
 * `Date.now`/`setTimeout` pair (the default).
 */
export interface VoiceClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
}

export const systemClock: VoiceClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
};

interface PendingToolCall {
  epoch: number;
  onResult?: ToolResultBranches;
}

interface PendingTextWait {
  epoch: number;
  next: ScriptStep[];
}

export class FakeVoiceProvider implements VoiceProvider {
  private readonly clock: VoiceClock;
  private readonly listeners = new Set<(e: VoiceEvent) => void>();
  private epoch = 0;
  private callCounter = 0;
  private textWaiters: PendingTextWait[] = [];
  private pendingToolCalls = new Map<string, PendingToolCall>();
  private lastTutorCaption: string | undefined;
  private opts: SessionOptions | undefined;

  constructor(clock: VoiceClock = systemClock) {
    this.clock = clock;
  }

  async connect(opts: SessionOptions): Promise<void> {
    this.opts = opts;
    this.startScript(opts.mode);
  }

  async disconnect(): Promise<void> {
    this.epoch += 1;
    this.textWaiters = [];
    this.pendingToolCalls.clear();
    this.emit({ type: 'state', state: 'ended' });
  }

  setMode(mode: TutorMode): void {
    if (this.opts) this.opts = { ...this.opts, mode };
    this.startScript(mode);
  }

  setMuted(muted: boolean): void {
    this.emit({ type: 'state', state: muted ? 'muted' : 'listening' });
  }

  pushToTalk(active: boolean): void {
    this.emit({ type: 'state', state: active ? 'listening' : 'thinking' });
  }

  interrupt(): void {
    this.epoch += 1;
    this.textWaiters = [];
    this.pendingToolCalls.clear();
    this.emit({ type: 'state', state: 'listening' });
  }

  replayLast(): void {
    if (this.lastTutorCaption) {
      this.emit({ type: 'caption', speaker: 'tutor', text: this.lastTutorCaption, final: true });
    }
  }

  sendText(text: string): void {
    const waiter = this.textWaiters.shift();
    if (!waiter || waiter.epoch !== this.epoch) return;
    this.emit({ type: 'caption', speaker: 'learner', text, final: true });
    this.runSequence(waiter.next, 0, waiter.epoch);
  }

  respondTool(callId: string, result: ToolResult): void {
    const pending = this.pendingToolCalls.get(callId);
    if (!pending || pending.epoch !== this.epoch) return;
    this.pendingToolCalls.delete(callId);
    const ok = !('ok' in result) || result.ok !== false;
    const branch = ok
      ? pending.onResult?.onOk
      : (pending.onResult?.onError ?? pending.onResult?.onOk);
    if (branch) this.runSequence(branch, 0, pending.epoch);
  }

  on(listener: (e: VoiceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private startScript(mode: TutorMode): void {
    this.epoch += 1;
    this.textWaiters = [];
    this.pendingToolCalls.clear();
    const script = SCRIPTS[mode];
    if (!script) {
      this.emit({
        type: 'error',
        code: 'no_fixture',
        message: `no fixture script for mode: ${mode}`,
        recoverable: false,
      });
      return;
    }
    this.runSequence(script.steps, 0, this.epoch);
  }

  private runSequence(steps: ScriptStep[], index: number, epoch: number): void {
    if (epoch !== this.epoch) return;
    const step = steps[index];
    if (!step) return;

    if (step.kind === 'event') {
      this.schedule(step.delayMs, epoch, () => {
        this.emit(step.event);
        this.runSequence(steps, index + 1, epoch);
      });
    } else if (step.kind === 'toolCall') {
      this.schedule(step.delayMs, epoch, () => {
        const callId = `fake-call-${(this.callCounter += 1)}`;
        this.pendingToolCalls.set(callId, { epoch, onResult: step.onResult });
        this.emit({ type: 'tool_call', callId, name: step.name, args: step.args });
      });
    } else {
      this.textWaiters.push({ epoch, next: step.next });
    }
  }

  private schedule(delayMs: number, epoch: number, fn: () => void): void {
    this.clock.setTimeout(() => {
      if (epoch !== this.epoch) return;
      fn();
    }, delayMs);
  }

  private emit(event: VoiceEvent): void {
    if (event.type === 'caption' && event.speaker === 'tutor' && event.final) {
      this.lastTutorCaption = event.text;
    }
    for (const listener of this.listeners) listener(event);
  }
}
