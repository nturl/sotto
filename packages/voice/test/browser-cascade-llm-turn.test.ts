/**
 * TutorTurnRunner driven by a fake LlmEngine — no WebLLM, no real model.
 * Covers the tool round trip (tool_call -> requestTool -> continuation),
 * sentence chunking into onSentence, interrupt (abort mid-stream), and the
 * max-tool-iterations cap (planning/BROWSER-TUTOR.md, Slice 2 checklist #8).
 */
import { describe, expect, it } from 'vitest';
import {
  TutorTurnRunner,
  type ChatMessage,
  type EngineChatHandlers,
  type EngineToolCall,
  type LlmEngine,
  type ToolCallResult,
  type TutorTurnDeps,
} from '../src/browser-cascade/llm-turn.ts';
import type { TutorMode } from '@sotto/core';

/** Scripted engine: each call to `chat()` consumes the next scripted turn. */
class ScriptedEngine implements LlmEngine {
  calls: ChatMessage[][] = [];
  private turns: Array<{ deltas: string[]; toolCalls: EngineToolCall[] }>;

  constructor(turns: Array<{ deltas: string[]; toolCalls?: EngineToolCall[] }>) {
    this.turns = turns.map((t) => ({ deltas: t.deltas, toolCalls: t.toolCalls ?? [] }));
  }

  async chat(
    messages: ChatMessage[],
    handlers: EngineChatHandlers,
    signal: AbortSignal,
  ): Promise<{ text: string; toolCalls: EngineToolCall[] }> {
    this.calls.push(messages);
    const turn = this.turns.shift();
    if (!turn) return { text: '', toolCalls: [] };
    let text = '';
    for (const delta of turn.deltas) {
      if (signal.aborted) break;
      text += delta;
      await handlers.onTextDelta?.(delta);
    }
    return { text, toolCalls: signal.aborted ? [] : turn.toolCalls };
  }
}

function setup(engine: LlmEngine, overrides: Partial<Parameters<typeof mkDeps>[1]> = {}) {
  const sentences: string[] = [];
  const captions: Array<{ text: string; final: boolean }> = [];
  const states: string[] = [];
  const reading: string[][] = [];
  const toolRequests: Array<{ callId: string; name: string; args: unknown }> = [];

  const deps = mkDeps(engine, {
    onSentence: (s) => {
      sentences.push(s);
    },
    onTutorCaption: (text, final) => captions.push({ text, final }),
    onState: (s) => states.push(s),
    onReading: (ids) => reading.push(ids),
    ...overrides,
    requestTool: async (callId, name, args) => {
      toolRequests.push({ callId, name, args });
      return overrides.requestTool
        ? await (overrides.requestTool as NonNullable<typeof overrides.requestTool>)(
            callId,
            name,
            args,
          )
        : { ok: true, result: { ok: true } };
    },
  });

  const runner = new TutorTurnRunner(deps);
  return { runner, sentences, captions, states, reading, toolRequests };
}

function mkDeps(
  engine: LlmEngine,
  over: {
    onSentence?: (s: string) => void;
    onTutorCaption?: (text: string, final: boolean) => void;
    onState?: (s: string) => void;
    onReading?: (ids: string[]) => void;
    requestTool?: (callId: string, name: string, args: unknown) => Promise<ToolCallResult>;
    mode?: () => TutorMode;
    maxTokens?: () => number | undefined;
    onMetric?: (name: string, detail?: string) => void;
  },
): TutorTurnDeps {
  return {
    engine,
    buildSystemInstruction: () => 'system prompt',
    requestTool: (callId, name, args) =>
      over.requestTool?.(callId, name, args) ?? Promise.resolve({ ok: true }),
    onState: (s) => over.onState?.(s),
    onReading: (ids) => over.onReading?.(ids),
    onPace: () => {},
    onSentence: (s) => over.onSentence?.(s),
    onTutorCaption: (text, final) => over.onTutorCaption?.(text, final),
    ...(over.mode ? { mode: over.mode } : {}),
    ...(over.maxTokens ? { maxTokens: over.maxTokens } : {}),
    ...(over.onMetric ? { onMetric: over.onMetric } : {}),
  };
}

describe('TutorTurnRunner', () => {
  it('chunks streamed text into sentences as boundaries are seen', async () => {
    const engine = new ScriptedEngine([{ deltas: ['Hola. ', '¿Cómo estás? ', 'Bien.'] }]);
    const { runner, sentences, captions, states } = setup(engine);

    await runner.run('hola', new AbortController().signal);

    expect(sentences).toEqual(['Hola.', '¿Cómo estás?', 'Bien.']);
    expect(captions).toEqual([{ text: 'Hola. ¿Cómo estás? Bien.', final: true }]);
    expect(states).toEqual(['thinking', 'listening']);
  });

  it('strips reading/pace markers and never leaks them into sentences', async () => {
    const engine = new ScriptedEngine([
      { deltas: ['[[reading: b1.s1.t1 b1.s1.t2]]Durante el verano. ', '[[pace: slow]]Bien.'] },
    ]);
    const { runner, sentences, reading } = setup(engine);

    await runner.run('lee', new AbortController().signal);

    expect(reading).toEqual([['b1.s1.t1', 'b1.s1.t2']]);
    expect(sentences.join(' ')).not.toContain('[[');
    expect(sentences).toEqual(['Durante el verano.', 'Bien.']);
  });

  it('round-trips a tool call: tool_call -> requestTool -> continuation', async () => {
    const engine = new ScriptedEngine([
      {
        deltas: ['Guardando la palabra.'],
        toolCalls: [
          {
            id: 'call_1',
            name: 'save_vocabulary',
            arguments: '{"tokenId":"b1.s1.t6","word":"cigarra"}',
          },
        ],
      },
      { deltas: ['Listo, guardé cigarra.'] },
    ]);
    const { runner, toolRequests, captions } = setup(engine, {
      requestTool: async () => ({ ok: true, result: { ok: true, savedWordId: 'w1' } }),
    });

    await runner.run('Guarda la palabra cigarra', new AbortController().signal);

    expect(toolRequests).toEqual([
      { callId: 'call_1', name: 'save_vocabulary', args: { tokenId: 'b1.s1.t6', word: 'cigarra' } },
    ]);
    // Two turns => two tutor captions, the second after the tool result.
    expect(captions.map((c) => c.text)).toEqual([
      'Guardando la palabra.',
      'Listo, guardé cigarra.',
    ]);
    expect(engine.calls).toHaveLength(2);
    // Second call's messages include the tool result fed back to the model.
    const secondCallMessages = engine.calls[1]!;
    const toolMsg = secondCallMessages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('"savedWordId":"w1"');
  });

  it('caps tool iterations at the configured max', async () => {
    const alwaysCallsTool = (): { deltas: string[]; toolCalls: EngineToolCall[] } => ({
      deltas: ['ok'],
      toolCalls: [{ id: 'call_x', name: 'get_current_passage', arguments: '{}' }],
    });
    const engine = new ScriptedEngine([
      alwaysCallsTool(),
      alwaysCallsTool(),
      alwaysCallsTool(),
      alwaysCallsTool(),
      alwaysCallsTool(), // never reached if the cap holds at 4
    ]);
    const { runner, toolRequests } = setup(engine);
    (runner as unknown as { maxToolIterations: number }).maxToolIterations = 4;

    await runner.run('hola', new AbortController().signal);

    expect(toolRequests.length).toBeLessThanOrEqual(4);
    expect(engine.calls.length).toBeLessThanOrEqual(4);
  });

  it('stops mid-stream on interrupt and does not emit a final caption', async () => {
    let deltasEmitted = 0;
    const controller = new AbortController();
    const engine: LlmEngine = {
      chat: async (_messages, handlers, signal) => {
        for (const delta of ['Primero. ', 'Segundo. ', 'Tercero.']) {
          if (signal.aborted) break;
          await handlers.onTextDelta?.(delta);
          deltasEmitted += 1;
          if (deltasEmitted === 1) controller.abort();
        }
        return { text: 'Primero. Segundo. Tercero.', toolCalls: [] };
      },
    };
    const { runner, captions, states } = setup(engine);

    await runner.run('hola', controller.signal);

    // The loop breaks as soon as the signal is observed aborted; no final
    // "listening" state transition (the caller — worker.ts's interrupt
    // handler — is responsible for that, same as the server's bargeIn()).
    expect(states).not.toContain('listening');
    expect(captions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// run 9 lane B — the reply contract.
//
// Noel's live Discuss turn (planning/run9/PLAN.md) streamed a filler line and
// then a five-line list, and every line was spoken because nothing between
// the engine and TTS looked at the SHAPE of the reply. These tests drive the
// runner with a fake engine that streams exactly that.
// ---------------------------------------------------------------------------
describe('TutorTurnRunner reply contract', () => {
  const BULLET_REPLY = [
    "Okay, let's see.\n",
    '- The passage is about a man walking on a frozen trail. \n',
    '- The dog is a big **grey husky**. \n',
    '- It is fifty below zero. \n',
    '- The man has no imagination. \n',
    '- The dog is unhappy but loyal. \n',
  ];

  it('normalizes a markdown bullet reply into prose and speaks at most three sentences (discuss)', async () => {
    const engine = new ScriptedEngine([{ deltas: BULLET_REPLY }]);
    const { runner, sentences, captions } = setup(engine, { mode: () => 'discuss' });

    await runner.run('Tell me more about the gray husky dog.', new AbortController().signal);

    expect(sentences).toHaveLength(3);
    expect(sentences.join(' ')).not.toMatch(/[-*#`]/);
    expect(sentences[0]).toBe('The passage is about a man walking on a frozen trail.');
    expect(sentences[1]).toBe('The dog is a big grey husky.');
    expect(sentences[2]).toBe('It is fifty below zero.');
    // The caption that finalizes is exactly what was spoken.
    const final = captions.filter((c) => c.final);
    expect(final).toHaveLength(1);
    expect(final[0]!.text).toBe(sentences.join(' '));
  });

  it('does not cap read_to_me (the passage may run long)', async () => {
    const engine = new ScriptedEngine([
      { deltas: ['Uno. ', 'Dos. ', 'Tres. ', 'Cuatro. ', 'Cinco.'] },
    ]);
    const { runner, sentences } = setup(engine, { mode: () => 'read_to_me' });

    await runner.run('lee', new AbortController().signal);

    expect(sentences).toHaveLength(5);
  });

  it('caps read_with_me and pronunciation at two spoken sentences', async () => {
    for (const mode of ['read_with_me', 'pronunciation'] as const) {
      const engine = new ScriptedEngine([{ deltas: ['Uno. ', 'Dos. ', 'Tres. ', 'Cuatro.'] }]);
      const { runner, sentences } = setup(engine, { mode: () => mode });
      await runner.run('hola', new AbortController().signal);
      expect(sentences).toHaveLength(2);
    }
  });

  it('is uncapped when no mode is supplied (every existing caller is unchanged)', async () => {
    const engine = new ScriptedEngine([{ deltas: ['Uno. ', 'Dos. ', 'Tres. ', 'Cuatro.'] }]);
    const { runner, sentences } = setup(engine);
    await runner.run('hola', new AbortController().signal);
    expect(sentences).toHaveLength(4);
  });

  it('aborts the engine stream when the cap is reached, without marking the turn barged-in', async () => {
    let deltasRequested = 0;
    let sawAbort = false;
    const engine: LlmEngine = {
      chat: async (_messages, handlers, signal) => {
        let text = '';
        for (const delta of ['Uno. ', 'Dos. ', 'Tres. ', 'Cuatro. ', 'Cinco. ']) {
          if (signal.aborted) {
            sawAbort = true;
            break;
          }
          deltasRequested += 1;
          text += delta;
          await handlers.onTextDelta?.(delta);
        }
        return { text, toolCalls: [] };
      },
    };
    const { runner, sentences, captions, states } = setup(engine, { mode: () => 'discuss' });
    const external = new AbortController();

    await runner.run('hola', external.signal);

    expect(sawAbort).toBe(true);
    expect(deltasRequested).toBeLessThan(5);
    expect(sentences).toEqual(['Uno.', 'Dos.', 'Tres.']);
    // Not a barge-in: the external signal is untouched, the caption still
    // finalizes, and the runner still hands the session back to `listening`.
    expect(external.signal.aborted).toBe(false);
    expect(captions.filter((c) => c.final).map((c) => c.text)).toEqual(['Uno. Dos. Tres.']);
    expect(states).toEqual(['thinking', 'listening']);
  });

  it('records the spoken text (not the truncated remainder) in history', async () => {
    const engine = new ScriptedEngine([
      { deltas: ['Uno. ', 'Dos. ', 'Tres. ', 'Cuatro. '] },
      { deltas: ['Cinco.'] },
    ]);
    const { runner } = setup(engine, { mode: () => 'discuss' });

    await runner.run('hola', new AbortController().signal);
    await runner.run('otra vez', new AbortController().signal);

    const second = engine.calls[1]!;
    const assistant = second.filter((m) => m.role === 'assistant');
    expect(assistant.map((m) => m.content)).toEqual(['Uno. Dos. Tres.']);
  });

  it('passes the per-mode token ceiling down to the engine', async () => {
    const seen: Array<number | undefined> = [];
    const engine: LlmEngine = {
      chat: async (_m, handlers, _s, opts) => {
        seen.push(opts?.maxTokens);
        await handlers.onTextDelta?.('Hola.');
        return { text: 'Hola.', toolCalls: [] };
      },
    };
    const { runner } = setup(engine, { mode: () => 'discuss', maxTokens: () => 160 });
    await runner.run('hola', new AbortController().signal);
    expect(seen).toEqual([160]);
  });

  it('drops a leading filler sentence before it is ever spoken', async () => {
    const engine = new ScriptedEngine([
      { deltas: ['Okay, ', "let's ", 'see. ', 'El perro es gris.'] },
    ]);
    const { runner, sentences } = setup(engine, { mode: () => 'discuss' });

    await runner.run('hola', new AbortController().signal);

    expect(sentences).toEqual(['El perro es gris.']);
  });
});

describe('the sentence cap is safe to abort on (lane R, P1-5)', () => {
  it('reports llm_capped when the budget fires, and nothing when it does not', async () => {
    const metrics: Array<{ name: string; detail?: string }> = [];
    const onMetric = (name: string, detail?: string) => metrics.push({ name, detail });

    const capped = new ScriptedEngine([{ deltas: ['Uno. ', 'Dos. ', 'Tres. ', 'Cuatro. '] }]);
    const a = setup(capped, { mode: () => 'discuss', onMetric });
    await a.runner.run('hola', new AbortController().signal);
    expect(metrics.map((m) => m.name)).toEqual(['llm_capped']);
    expect(metrics[0]!.detail).toContain('discuss');

    metrics.length = 0;
    const short = new ScriptedEngine([{ deltas: ['Uno. ', 'Dos.'] }]);
    const b = setup(short, { mode: () => 'discuss', onMetric });
    await b.runner.run('hola', new AbortController().signal);
    expect(metrics).toEqual([]);
  });

  it('does not resolve the turn until the capped engine call has actually returned', async () => {
    // worker.ts serializes turns on `currentTurnPromise`, which is the
    // `run()` promise: starting a second chat() on the same MLCEngine
    // before an interrupted one unwound hung the session indefinitely.
    // That guard is only worth anything if `run()` outlives the engine
    // call it aborted — before this, `interruptGenerate()` was fired and
    // forgotten, and with the cap firing on ordinary replies rather than
    // only on a barge-in, this is now the common path.
    let releaseEngine: () => void = () => {};
    const engineSettled = new Promise<void>((resolve) => {
      releaseEngine = resolve;
    });
    let sawAbort = false;
    let engineCalls = 0;

    const engine: LlmEngine = {
      chat: async (_messages, handlers, signal) => {
        engineCalls += 1;
        let text = '';
        for (const delta of ['Uno. ', 'Dos. ', 'Tres. ', 'Cuatro. ', 'Cinco. ']) {
          if (signal.aborted) {
            sawAbort = true;
            break;
          }
          text += delta;
          await handlers.onTextDelta?.(delta);
        }
        // Stands in for `await interruptGenerate()`: the engine has been
        // told to stop but has not finished unwinding yet.
        await engineSettled;
        return { text, toolCalls: [] };
      },
    };

    const { runner, sentences } = setup(engine, { mode: () => 'discuss' });
    let turnResolved = false;
    const turn = runner.run('hola', new AbortController().signal).then(() => {
      turnResolved = true;
    });

    // Let every already-queued microtask run: the cap has fired and the
    // stream loop has broken, but the engine call is still unwinding.
    for (let i = 0; i < 200; i++) await Promise.resolve();
    expect(sawAbort).toBe(true);
    expect(sentences).toEqual(['Uno.', 'Dos.', 'Tres.']);
    expect(turnResolved).toBe(false);

    releaseEngine();
    await turn;
    expect(turnResolved).toBe(true);
    expect(engineCalls).toBe(1);
  });
});
