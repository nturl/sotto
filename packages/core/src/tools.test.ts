import { describe, expect, it, vi } from 'vitest';
import {
  executeTool,
  TOOL_DEFINITIONS,
  type ToolExecutionContext,
  type ToolFailure,
  type ToolResult,
} from './tools.ts';

function isFailure(result: ToolResult): result is ToolFailure {
  return 'ok' in result && result.ok === false;
}

function makeCtx(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    getPassage: vi.fn().mockResolvedValue({
      chapterTitle: 'Chapitre 1',
      sentences: [
        {
          id: 'b1.s1',
          text: 'Bonjour.',
          tokenIds: ['b1.s1.t1', 'b1.s1.t2'],
          words: [{ id: 'b1.s1.t1', text: 'Bonjour' }],
        },
      ],
      positionTokenId: 'b1.s1.t1',
    }),
    setPosition: vi.fn().mockResolvedValue({ ok: true }),
    saveWord: vi.fn().mockResolvedValue({ ok: true, savedWordId: 'w1' }),
    removeWord: vi.fn().mockResolvedValue({ ok: true }),
    showExplanation: vi.fn().mockResolvedValue({ ok: true }),
    setMode: vi.fn().mockResolvedValue({ ok: true }),
    markComplete: vi.fn().mockResolvedValue({ ok: true, advanced: true }),
    ...overrides,
  };
}

describe('TOOL_DEFINITIONS', () => {
  it('defines exactly the 7 contract tools as OpenAI function-calling entries', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(7);
    for (const def of TOOL_DEFINITIONS) {
      expect(def.type).toBe('function');
      expect(def.function.name).toBeTruthy();
      expect(def.function.description.length).toBeGreaterThan(10);
      expect(def.function.parameters.type).toBe('object');
    }
  });
});

describe('executeTool', () => {
  it('rejects an unknown tool name without throwing', async () => {
    const ctx = makeCtx();
    const result = await executeTool('not_a_real_tool', {}, ctx);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('unknown tool') });
  });

  it('rejects a bad payload (missing required field) without calling ctx', async () => {
    const ctx = makeCtx();
    const result = await executeTool('save_vocabulary', {}, ctx);
    expect(isFailure(result)).toBe(true);
    expect(ctx.saveWord).not.toHaveBeenCalled();
  });

  it('rejects set_reading_position with both or neither of tokenId/sentenceId', async () => {
    const ctx = makeCtx();
    expect(isFailure(await executeTool('set_reading_position', {}, ctx))).toBe(true);
    expect(
      isFailure(
        await executeTool('set_reading_position', { tokenId: 't1', sentenceId: 's1' }, ctx),
      ),
    ).toBe(true);
    expect(ctx.setPosition).not.toHaveBeenCalled();
  });

  it('passes valid args through to the matching ctx method', async () => {
    const ctx = makeCtx();
    const result = await executeTool('save_vocabulary', { tokenId: 'b1.s1.t1' }, ctx);
    expect(ctx.saveWord).toHaveBeenCalledWith('b1.s1.t1', undefined, undefined);
    expect(result).toEqual({ ok: true, savedWordId: 'w1' });
  });

  it('save_vocabulary forwards the optional word hint so the executor can check the id against it', async () => {
    const ctx = makeCtx();
    await executeTool(
      'save_vocabulary',
      { tokenId: 'b1.s1.t1', word: 'Bonjour', translation: 'hello' },
      ctx,
    );
    expect(ctx.saveWord).toHaveBeenCalledWith('b1.s1.t1', 'hello', 'Bonjour');
  });

  it('propagates a ctx-reported failure for an unknown id without throwing', async () => {
    const ctx = makeCtx({
      saveWord: vi.fn().mockResolvedValue({ ok: false, error: 'unknown tokenId: b9.s9.t9' }),
    });
    const result = await executeTool('save_vocabulary', { tokenId: 'b9.s9.t9' }, ctx);
    expect(result).toEqual({ ok: false, error: 'unknown tokenId: b9.s9.t9' });
  });

  it('catches a ctx throw and returns ok:false instead of propagating', async () => {
    const ctx = makeCtx({
      setMode: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const result = await executeTool('set_session_mode', { mode: 'discuss' }, ctx);
    expect(result).toEqual({ ok: false, error: 'boom' });
  });

  it('returns the result only after the ctx promise resolves', async () => {
    const order: string[] = [];
    let resolveCtx!: () => void;
    const ctx = makeCtx({
      markComplete: vi.fn(
        () =>
          new Promise<{ ok: true; advanced: boolean }>((resolve) => {
            resolveCtx = () => {
              order.push('ctx-resolved');
              resolve({ ok: true, advanced: true });
            };
          }),
      ),
    });

    const pending = executeTool('mark_section_complete', {}, ctx).then((result) => {
      order.push('tool-resolved');
      return result;
    });

    // Give the microtask queue a turn; the tool call must still be pending.
    await Promise.resolve();
    expect(order).toEqual([]);

    resolveCtx();
    const result = await pending;
    expect(order).toEqual(['ctx-resolved', 'tool-resolved']);
    expect(result).toEqual({ ok: true, advanced: true });
  });

  it('get_current_passage returns the raw passage shape (no ok wrapper) on success', async () => {
    const ctx = makeCtx();
    const result = await executeTool('get_current_passage', {}, ctx);
    expect(result).toEqual({
      chapterTitle: 'Chapitre 1',
      sentences: [
        {
          id: 'b1.s1',
          text: 'Bonjour.',
          tokenIds: ['b1.s1.t1', 'b1.s1.t2'],
          words: [{ id: 'b1.s1.t1', text: 'Bonjour' }],
        },
      ],
      positionTokenId: 'b1.s1.t1',
    });
  });
});
