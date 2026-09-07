/**
 * The JSON-tool fallback protocol (src/browser-cascade/tool-protocol.ts):
 * the shapes the parser must accept, and what the instruction carries.
 * Run 9: Qwen3.5-4B narrated "Guardé **cigarra** para ti." with no fence
 * at all under the old ```tool-only protocol, so the instruction now asks
 * for Qwen's native <tool_call> shape and the parser accepts every shape a
 * Qwen build has been seen to produce.
 */
import { describe, expect, it } from 'vitest';
import {
  parseJsonToolBlock,
  withJsonToolInstruction,
} from '../src/browser-cascade/tool-protocol.ts';

const CALL = '{"name": "save_vocabulary", "arguments": {"tokenId": "b1.s1.t6", "word": "cigarra"}}';

describe('parseJsonToolBlock', () => {
  it('parses the native <tool_call> shape and strips it from the spoken text', () => {
    const r = parseJsonToolBlock(`<tool_call>\n${CALL}\n</tool_call>\nGuardé "cigarra".`);
    expect(r?.call.name).toBe('save_vocabulary');
    expect(JSON.parse(r!.call.arguments)).toEqual({ tokenId: 'b1.s1.t6', word: 'cigarra' });
    expect(r?.strippedText).toBe('Guardé "cigarra".');
  });

  it('still parses the legacy ```tool fence', () => {
    const r = parseJsonToolBlock('Claro.\n```tool\n' + CALL + '\n```');
    expect(r?.call.name).toBe('save_vocabulary');
    expect(r?.strippedText).toBe('Claro.');
  });

  it('accepts a ```json fence and a bare fence too', () => {
    expect(parseJsonToolBlock('```json\n' + CALL + '\n```')?.call.name).toBe('save_vocabulary');
    expect(parseJsonToolBlock('```\n' + CALL + '\n```')?.call.name).toBe('save_vocabulary');
  });

  it('accepts a bare JSON object naming a known tool, with braces inside string values', () => {
    const r = parseJsonToolBlock(
      'Listo. {"name": "show_explanation", "arguments": {"title": "cigarra", "body": "insecto {ruidoso}", "kind": "translation"}} ¿Seguimos?',
    );
    expect(r?.call.name).toBe('show_explanation');
    expect(JSON.parse(r!.call.arguments).body).toBe('insecto {ruidoso}');
    expect(r?.strippedText).toBe('Listo.  ¿Seguimos?');
  });

  it('accepts "parameters" as an alias for "arguments"', () => {
    const r = parseJsonToolBlock(
      '<tool_call>{"name": "save_vocabulary", "parameters": {"tokenId": "b1.s1.t6"}}</tool_call>',
    );
    expect(JSON.parse(r!.call.arguments)).toEqual({ tokenId: 'b1.s1.t6' });
  });

  it('ignores a bare JSON object that is not a known tool, and prose with no call', () => {
    expect(parseJsonToolBlock('{"name": "Ana", "arguments": {}}')).toBeNull();
    expect(parseJsonToolBlock('Guardé **cigarra** para ti.')).toBeNull();
  });

  it('returns null for a malformed block rather than throwing', () => {
    expect(parseJsonToolBlock('<tool_call>{"name": </tool_call>')).toBeNull();
  });
});

describe('withJsonToolInstruction', () => {
  it('appends the native Qwen tools block with every tool signature to the system message', () => {
    const [system, user] = withJsonToolInstruction([
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: 'hola' },
    ]);
    expect(system!.content.startsWith('You are a tutor.')).toBe(true);
    expect(system!.content).toContain('<tools>');
    expect(system!.content).toContain('"name":"save_vocabulary"');
    expect(system!.content).toContain('<tool_call>');
    expect(user).toEqual({ role: 'user', content: 'hola' });
  });

  it('re-renders tool-role results and assistant tool calls in the native Qwen shape', () => {
    const out = withJsonToolInstruction([
      { role: 'system', content: 'S' },
      { role: 'user', content: 'guarda cigarra' },
      {
        role: 'assistant',
        content: 'Claro.',
        tool_calls: [
          {
            id: 'call_0',
            type: 'function',
            function: { name: 'save_vocabulary', arguments: '{"tokenId":"b1.s1.t6"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_0', name: 'save_vocabulary', content: '{"ok":true}' },
    ]);
    expect(out.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(out[2]).toEqual({
      role: 'assistant',
      content:
        'Claro.\n<tool_call>\n{"name":"save_vocabulary","arguments":{"tokenId":"b1.s1.t6"}}\n</tool_call>',
    });
    expect(out[3]).toEqual({
      role: 'user',
      content: '<tool_response>\n{"ok":true}\n</tool_response>',
    });
  });

  it('leaves messages untouched when there is no leading system message', () => {
    const msgs = [{ role: 'user' as const, content: 'hola' }];
    expect(withJsonToolInstruction(msgs)).toBe(msgs);
  });
});
