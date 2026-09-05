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
