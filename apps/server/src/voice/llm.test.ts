import { describe, expect, it, vi } from 'vitest';
import { streamChatCompletion } from './llm.js';
import type { ChatMessage } from './types.js';

function sseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(sseChunk(e)));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

const MESSAGES: ChatMessage[] = [{ role: 'user', content: 'hi' }];

describe('streamChatCompletion request body', () => {
  it('omits the llama-server-only extensions (chat_template_kwargs, cache_prompt) for api.openai.com', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      return new Response(sseStream([{ choices: [{ delta: { content: 'hi' } }] }]));
    }) as unknown as typeof fetch;

    await streamChatCompletion(
      MESSAGES,
      { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', fetchImpl },
      {},
    );

    expect(capturedBody).toBeDefined();
    expect(capturedBody).not.toHaveProperty('chat_template_kwargs');
    expect(capturedBody).not.toHaveProperty('cache_prompt');
  });

  it('sends the llama-server extensions for a non-OpenAI (local) endpoint', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      return new Response(sseStream([{ choices: [{ delta: { content: 'hi' } }] }]));
    }) as unknown as typeof fetch;

    await streamChatCompletion(
      MESSAGES,
      { url: 'http://127.0.0.1:8080/v1', model: 'qwen3.6-35b-a3b', fetchImpl },
      {},
    );

    expect(capturedBody).toMatchObject({
      chat_template_kwargs: { enable_thinking: false },
      cache_prompt: true,
    });
  });
});
