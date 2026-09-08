import { describe, expect, it } from 'vitest';
import { FakeVoiceProvider, type VoiceClock, type VoiceEvent } from '@sotto/voice';
import type {
  OkResult,
  SaveVocabularyResult,
  ToolExecutionContext,
  ToolFailure,
  ToolResult,
} from '@sotto/core';
import { createVoiceController, type VoiceControllerCallbacks } from './controller';

/** A manually-advanced clock (packages/voice's FakeVoiceProvider takes one)
 * that lets a scripted fixture run to completion synchronously in tests —
 * no real setTimeout/sleeping needed. */
function createManualClock(): { clock: VoiceClock; runAll: () => void } {
  let now = 0;
  let nextId = 1;
  const timers: Array<{ id: number; time: number; fn: () => void }> = [];
  return {
    clock: {
      now: () => now,
      setTimeout: (fn, ms) => {
        const id = nextId++;
        timers.push({ id, time: now + ms, fn });
        return id;
      },
    },
    runAll: () => {
      let guard = 0;
      while (timers.length > 0 && guard < 1000) {
        guard += 1;
        timers.sort((a, b) => a.time - b.time);
        const next = timers.shift()!;
        now = next.time;
        next.fn();
      }
    },
  };
}

/** `executeTool` inside the controller is async (its ToolExecutionContext
 * methods may return a Promise), so the tool_call -> respondTool round trip
 * resolves on a microtask, not synchronously within the manual clock's
 * `runAll()`. A macrotask tick reliably drains it under Node/vitest. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function collectingCallbacks() {
  const states: string[] = [];
  const captions: Array<{ speaker: string; text: string; final: boolean }> = [];
  const toolEvents: Array<{ name: string; args: unknown; result: ToolResult }> = [];
  const callbacks: VoiceControllerCallbacks = {
    onState: (state) => states.push(state),
    onCaption: (entry) => captions.push(entry),
    onReading: () => undefined,
    onLimit: () => undefined,
    onError: () => undefined,
    onToolEvent: (entry) => toolEvents.push(entry),
  };
  return { callbacks, states, captions, toolEvents };
}

describe('createVoiceController + FakeVoiceProvider (CONTRACTS §5a, TASK §F)', () => {
  it('runs the discuss fixture through connecting -> listening -> speaking state transitions', () => {
    const { clock, runAll } = createManualClock();
    const provider = new FakeVoiceProvider(clock);
    const { callbacks, states, captions } = collectingCallbacks();
    const ctx: ToolExecutionContext = {
      getPassage: () => ({ chapterTitle: '', sentences: [], positionTokenId: null }),
      setPosition: () => ({ ok: true }) as OkResult,
      saveWord: () => ({ ok: true, savedWordId: 'w1' }) as SaveVocabularyResult,
      removeWord: () => ({ ok: true }) as OkResult,
      showExplanation: () => ({ ok: true }) as OkResult,
      setMode: () => ({ ok: true }) as OkResult,
      markComplete: () => ({ ok: true, advanced: false }),
    };

    createVoiceController(provider, ctx, callbacks);
    void provider.connect({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
      passage: { chapterTitle: '', sentences: [], positionTokenId: null },
      savedWords: [],
    });
    runAll();

    expect(states).toEqual(['connecting', 'listening', 'speaking', 'listening']);
    expect(captions).toEqual([
      { speaker: 'tutor', text: 'Que penses-tu du personnage principal ?', final: true },
    ]);
  });

  it('round-trips a tool call: tutor asks to save a word, the tool executes, and the result flows back to the provider', async () => {
    const { clock, runAll } = createManualClock();
    const provider = new FakeVoiceProvider(clock);
    const { callbacks, toolEvents, captions } = collectingCallbacks();

    const saved: string[] = [];
    const ctx: ToolExecutionContext = {
      getPassage: () => ({ chapterTitle: '', sentences: [], positionTokenId: null }),
      setPosition: () => ({ ok: true }) as OkResult,
      saveWord: (tokenId) => {
        saved.push(tokenId);
        return { ok: true, savedWordId: 'saved-1' } as SaveVocabularyResult;
      },
      removeWord: () => ({ ok: true }) as OkResult,
      showExplanation: () => ({ ok: true }) as OkResult,
      setMode: () => ({ ok: true }) as OkResult,
      markComplete: () => ({ ok: true, advanced: false }),
    };

    createVoiceController(provider, ctx, callbacks);
    void provider.connect({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
      passage: { chapterTitle: '', sentences: [], positionTokenId: null },
      savedWords: [],
    });
    runAll();

    provider.sendText('Save that word for me');
    runAll();
    await flushMicrotasks();
    runAll();

    expect(saved).toEqual(['b1.s1.t1']);
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0]!.name).toBe('save_vocabulary');
    expect(toolEvents[0]!.result).toEqual({ ok: true, savedWordId: 'saved-1' });
    expect(captions.at(-1)).toEqual({
      speaker: 'tutor',
      text: "D'accord, je l'ai enregistré.",
      final: true,
    });
  });

  it('a failing tool result is reported back to the provider (fixture takes its onError branch)', async () => {
    const { clock, runAll } = createManualClock();
    const provider = new FakeVoiceProvider(clock);
    const { callbacks, toolEvents } = collectingCallbacks();

    const ctx: ToolExecutionContext = {
      getPassage: () => ({ chapterTitle: '', sentences: [], positionTokenId: null }),
      setPosition: () => ({ ok: true }) as OkResult,
      saveWord: () => ({ ok: false, error: 'unknown tokenId' }) as ToolFailure,
      removeWord: () => ({ ok: true }) as OkResult,
      showExplanation: () => ({ ok: true }) as OkResult,
      setMode: () => ({ ok: true }) as OkResult,
      markComplete: () => ({ ok: true, advanced: false }),
    };

    createVoiceController(provider, ctx, callbacks);
    void provider.connect({
      bookId: 'fr-chat-botte',
      chapterId: 'fr-chat-botte-01',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
      passage: { chapterTitle: '', sentences: [], positionTokenId: null },
      savedWords: [],
    });
    runAll();
    provider.sendText('go');
    runAll();
    await flushMicrotasks();
    runAll();

    expect(toolEvents[0]!.result).toEqual({ ok: false, error: 'unknown tokenId' });
  });
});

/**
 * Run 9 lane D directive 3 (PLAN.md diagnosis 4): the browser cascade's
 * worker posts `state: listening` when generation ends, not when the
 * speakers stop. The controller holds that back while the provider still
 * reports queued playback.
 */
describe('createVoiceController: `speaking` holds until playback drains', () => {
  function playbackAwareProvider(remaining: () => number) {
    const listeners = new Set<(e: VoiceEvent) => void>();
    return {
      provider: {
        on: (fn: (e: VoiceEvent) => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        connect: async () => undefined,
        disconnect: async () => undefined,
        setMode: () => undefined,
        setMuted: () => undefined,
        pushToTalk: () => undefined,
        interrupt: () => undefined,
        replayLast: () => undefined,
        sendText: () => undefined,
        respondTool: () => undefined,
        playbackRemainingMs: remaining,
      } as unknown as Parameters<typeof createVoiceController>[0],
      emit: (e: VoiceEvent) => listeners.forEach((l) => l(e)),
    };
  }

  const noopCtx: ToolExecutionContext = {
    getPassage: () => ({ chapterTitle: '', sentences: [], positionTokenId: null }),
    setPosition: () => ({ ok: true }) as OkResult,
    saveWord: () => ({ ok: true, word: 'x' }) as unknown as SaveVocabularyResult,
    removeWord: () => ({ ok: true }) as OkResult,
    showExplanation: () => ({ ok: true }) as OkResult,
    setMode: () => ({ ok: true }) as OkResult,
    markComplete: () => ({ ok: true, advanced: false }),
  };

  it('keeps reporting `speaking` while tutor audio is still queued, then flushes `listening`', () => {
    const { clock, runAll } = createManualClock();
    let remaining = 1_500;
    const { provider, emit } = playbackAwareProvider(() => remaining);
    const { callbacks, states } = collectingCallbacks();

    createVoiceController(provider, noopCtx, callbacks, { clock });
    emit({ type: 'state', state: 'speaking' });
    emit({ type: 'state', state: 'listening' });

    expect(states).toEqual(['speaking', 'speaking']);

    remaining = 0;
    runAll();
    expect(states).toEqual(['speaking', 'speaking', 'listening']);
  });

  it('lets `listening` through immediately once the queue is empty', () => {
    const { clock } = createManualClock();
    const { provider, emit } = playbackAwareProvider(() => 0);
    const { callbacks, states } = collectingCallbacks();

    createVoiceController(provider, noopCtx, callbacks, { clock });
    emit({ type: 'state', state: 'listening' });

    expect(states).toEqual(['listening']);
  });

  it('never lets a pending flush overwrite a newer state (a barge-in or an error)', () => {
    const { clock, runAll } = createManualClock();
    const { provider, emit } = playbackAwareProvider(() => 1_500);
    const { callbacks, states } = collectingCallbacks();

    createVoiceController(provider, noopCtx, callbacks, { clock });
    emit({ type: 'state', state: 'listening' });
    emit({ type: 'state', state: 'error' });
    runAll();

    expect(states).toEqual(['speaking', 'error']);
  });

  it('a provider with no playback knowledge is unaffected', () => {
    const { clock } = createManualClock();
    const listeners = new Set<(e: VoiceEvent) => void>();
    const provider = {
      on: (fn: (e: VoiceEvent) => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    } as unknown as Parameters<typeof createVoiceController>[0];
    const { callbacks, states } = collectingCallbacks();

    createVoiceController(provider, noopCtx, callbacks, { clock });
    listeners.forEach((l) => l({ type: 'state', state: 'listening' }));

    expect(states).toEqual(['listening']);
  });
});
