/**
 * LLM client: streams an OpenAI-compatible chat completion
 * (planning/CONTRACTS.md §5d — llama-server, qwen3.6-35b-a3b,
 * chat_template_kwargs.enable_thinking=false is required or the model
 * reasons for ~15s before responding). Accumulates streamed `delta.tool_calls`
 * into complete tool calls and reports text deltas as they arrive so the
 * caller can sentence-chunk into TTS immediately.
 */
import type { ChatMessage } from './types.js';
import { openAiTools } from './tools.js';

export interface LlmConfig {
  url: string; // e.g. http://127.0.0.1:8080/v1
  model: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface StreamedToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LlmStreamHandlers {
  onTextDelta?: (delta: string) => void;
  onToolCalls?: (calls: StreamedToolCall[]) => void;
}

interface RawStreamToolCall {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

export async function streamChatCompletion(
  messages: ChatMessage[],
  config: LlmConfig,
  handlers: LlmStreamHandlers,
  signal?: AbortSignal,
): Promise<{ text: string; toolCalls: StreamedToolCall[] }> {
  const doFetch = config.fetchImpl ?? fetch;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const res = await doFetch(`${config.url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: openAiTools,
      stream: true,
      temperature: 0.4,
      max_tokens: 200,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`LLM request failed: ${res.status} ${await res.text().catch(() => '')}`);
  }

  const toolCallsByIndex = new Map<number, RawStreamToolCall>();
  let text = '';

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lineEnd: number;
      while ((lineEnd = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice('data:'.length).trim();
        if (payload === '[DONE]') continue;

        let event: unknown;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = (event as { choices?: Array<{ delta?: Record<string, unknown> }> }).choices?.[0]?.delta;
        if (!delta) continue;

        if (typeof delta.content === 'string' && delta.content.length > 0) {
          text += delta.content;
          handlers.onTextDelta?.(delta.content);
        }

        const rawToolCalls = delta.tool_calls as RawStreamToolCall[] | undefined;
        if (Array.isArray(rawToolCalls)) {
          for (const tc of rawToolCalls) {
            const existing = toolCallsByIndex.get(tc.index) ?? { index: tc.index, id: '', function: { name: '', arguments: '' } };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.function!.name = (existing.function!.name ?? '') + tc.function.name;
            if (tc.function?.arguments) existing.function!.arguments = (existing.function!.arguments ?? '') + tc.function.arguments;
            toolCallsByIndex.set(tc.index, existing);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const toolCalls: StreamedToolCall[] = [...toolCallsByIndex.values()]
    .sort((a, b) => a.index - b.index)
    .map((tc) => ({ id: tc.id || `call_${tc.index}`, name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '' }));

  if (toolCalls.length > 0) handlers.onToolCalls?.(toolCalls);

  return { text, toolCalls };
}
