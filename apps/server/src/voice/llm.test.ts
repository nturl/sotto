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

  it('uses max_completion_tokens and turns reasoning off for a GPT-5.x model on api.openai.com', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      return new Response(sseStream([{ choices: [{ delta: { content: 'hi' } }] }]));
    }) as unknown as typeof fetch;

    await streamChatCompletion(
      MESSAGES,
      { url: 'https://api.openai.com/v1', model: 'gpt-5.6-terra', fetchImpl },
      {},
    );

    // GPT-5.x rejects `max_tokens` outright (verified live 2026-09-06).
    expect(capturedBody).not.toHaveProperty('max_tokens');
    expect(capturedBody).toMatchObject({ max_completion_tokens: 400, reasoning_effort: 'none' });
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

describe('asynchronous spoken text handling', () => {
  it('waits for each sentence handler before the next delta or stream completion', async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const order: string[] = [];
    let completed = false;
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          sseStream([
            { choices: [{ delta: { content: 'First.' } }] },
            { choices: [{ delta: { content: 'Second.' } }] },
          ]),
        ),
    ) as unknown as typeof fetch;
    const pending = streamChatCompletion(
      MESSAGES,
      {
        url: 'http://127.0.0.1:8080/v1',
        model: 'fixture',
        fetchImpl,
      },
      {
        onTextDelta: async (text) => {
          order.push(`start:${text}`);
          if (text === 'First.') {
            started();
            await gate;
          }
          order.push(`end:${text}`);
        },
      },
    ).then((result) => {
      completed = true;
      return result;
    });
    await firstStarted;
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      expect(order).toEqual(['start:First.']);
      expect(completed).toBe(false);
    } finally {
      release();
    }
    await expect(pending).resolves.toMatchObject({ text: 'First.Second.' });
    expect(order).toEqual(['start:First.', 'end:First.', 'start:Second.', 'end:Second.']);
  });
});

it('propagates an asynchronous speech-handler failure to the voice pipeline', async () => {
  const fetchImpl = vi.fn(
    async () => new Response(sseStream([{ choices: [{ delta: { content: 'A sentence.' } }] }])),
  ) as unknown as typeof fetch;
  await expect(
    streamChatCompletion(
      MESSAGES,
      {
        url: 'http://127.0.0.1:8080/v1',
        model: 'fixture',
        fetchImpl,
      },
      {
        onTextDelta: async () => {
          throw new Error('speech fixture failed');
        },
      },
    ),
  ).rejects.toThrow('speech fixture failed');
});
