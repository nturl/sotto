/**
 * Runs one tutor turn — LLM stream -> sentence chunks -> tool-call relay ->
 * continuation — decoupled from any concrete LLM engine or transport, so it
 * can be driven by a fake engine in unit tests. `worker.ts` is the only
 * caller that wires this to a real `@mlc-ai/web-llm` engine and to
 * `postMessage`; nothing here imports an ML library (Metro-safe by
 * construction, though nothing here is reachable from Metro anyway).
 *
 * This is a straight port of the turn loop in
 * apps/server/src/voice/session.ts (`runLlmTurn` + `relayToolCall`):
 * same history trim (24), same tool-iteration cap (4), same
 * safeReleaseIndex/stripMarkers/SentenceChunker pipeline. See
 * planning/BROWSER-TUTOR.md, Slice 2 checklist.
 */
import { TOOL_NAMES, type ToolName } from '@sotto/core';
import type { VoiceState } from '../events.ts';
import { SentenceChunker } from './chunker.ts';
import { safeReleaseIndex, stripMarkers } from './markers.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

/** What the worker gets back over `tool_result` (protocol.ts), reshaped for
 * feeding straight back to the LLM as a tool message. */
export interface ToolCallResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface EngineToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface EngineChatHandlers {
  /** Called for every text delta, in order. May be async — the turn loop
   * awaits it before requesting the next delta, exactly as the server's
   * stream reader awaits `flushSentence` (so TTS/captions stay in order). */
  onTextDelta?: (delta: string) => void | Promise<void>;
}

/** The one thing `worker.ts` must implement against a real LLM. */
export interface LlmEngine {
  chat(
    messages: ChatMessage[],
    handlers: EngineChatHandlers,
    signal: AbortSignal,
  ): Promise<{ text: string; toolCalls: EngineToolCall[] }>;
}

export interface TutorTurnDeps {
  engine: LlmEngine;
  /** Rebuilt each turn so mode/passage/savedWords changes are picked up. */
  buildSystemInstruction: () => string;
  /** Posts `tool_call` and resolves when the matching `tool_result` arrives
   * (or times out) — the Map<callId, resolve> lives in worker.ts. */
  requestTool: (callId: string, name: ToolName, args: unknown) => Promise<ToolCallResult>;
  onState: (state: VoiceState) => void;
  onReading: (tokenIds: string[]) => void;
  onPace: (pace: 'slow' | 'normal') => void;
  /** One complete sentence, ready for TTS. Awaited before the next delta is
   * requested, matching the server's synchronous-looking flush order. */
  onSentence: (sentence: string) => void | Promise<void>;
  onTutorCaption: (text: string, final: boolean) => void;
  maxHistory?: number;
  maxToolIterations?: number;
}

const DEFAULT_MAX_HISTORY = 24;
const DEFAULT_MAX_TOOL_ITERATIONS = 4;

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/** Owns the running chat history for one session and drives turns against
 * it — the in-worker equivalent of the tool-loop half of `VoiceSession`. */
export class TutorTurnRunner {
  private history: ChatMessage[] = [];
  private readonly maxHistory: number;
  private readonly maxToolIterations: number;

  constructor(private readonly deps: TutorTurnDeps) {
    this.maxHistory = deps.maxHistory ?? DEFAULT_MAX_HISTORY;
    this.maxToolIterations = deps.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
  }

  private trimHistory(): void {
    while (this.history.length > this.maxHistory) this.history.shift();
  }

  private buildMessages(): ChatMessage[] {
    return [{ role: 'system', content: this.deps.buildSystemInstruction() }, ...this.history];
  }

  /** Runs a full turn for one piece of learner text (from STT or `sendText`). */
  async run(userText: string, signal: AbortSignal): Promise<void> {
    this.history.push({ role: 'user', content: userText });
    this.trimHistory();

    this.deps.onState('thinking');
    let messages = this.buildMessages();
    let finalText = '';

    for (let iteration = 0; iteration < this.maxToolIterations; iteration++) {
      if (signal.aborted) break;

      const chunker = new SentenceChunker();
      let rawBuffer = '';
      let turnText = '';

      const { text: rawText, toolCalls } = await this.deps.engine.chat(
        messages,
        {
          onTextDelta: async (delta) => {
            rawBuffer += delta;
            const safeIdx = safeReleaseIndex(rawBuffer);
            const release = rawBuffer.slice(0, safeIdx);
            rawBuffer = rawBuffer.slice(safeIdx);
            if (!release) return;

            const { text: clean, readingTokenIds, pace } = stripMarkers(release);
            if (readingTokenIds.length > 0) this.deps.onReading(readingTokenIds);
            if (pace) this.deps.onPace(pace);
            turnText += clean;

            for (const sentence of chunker.push(clean)) {
              await this.deps.onSentence(sentence);
            }
          },
        },
        signal,
      );

      if (signal.aborted) break;

      const { text: cleanRest, readingTokenIds, pace } = stripMarkers(rawBuffer);
      if (readingTokenIds.length > 0) this.deps.onReading(readingTokenIds);
      if (pace) this.deps.onPace(pace);
      turnText += cleanRest;

      for (const sentence of [...chunker.push(cleanRest), ...chunker.flush()]) {
        await this.deps.onSentence(sentence);
      }

      if (turnText.trim() && !signal.aborted) {
        this.deps.onTutorCaption(turnText.trim(), true);
      }
      finalText += (finalText ? ' ' : '') + turnText.trim();

      if (toolCalls.length === 0 || signal.aborted) break;

      messages = [
        ...messages,
        {
          role: 'assistant',
          content: rawText,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        },
      ];
      this.deps.onState('thinking');

      for (const tc of toolCalls) {
        let args: unknown = {};
        try {
          args = tc.arguments.trim() ? JSON.parse(tc.arguments) : {};
        } catch {
          args = {};
        }

        let result: ToolCallResult;
        if (!isToolName(tc.name)) {
          result = { ok: false, error: `unknown tool ${tc.name}` };
        } else {
          result = await this.deps.requestTool(tc.id, tc.name, args);
        }

        messages = [
          ...messages,
          { role: 'tool', tool_call_id: tc.id, name: tc.name, content: JSON.stringify(result) },
        ];
      }
    }

    if (finalText.trim()) {
      this.history.push({ role: 'assistant', content: finalText.trim() });
      this.trimHistory();
    }
    if (!signal.aborted) this.deps.onState('listening');
  }
}
