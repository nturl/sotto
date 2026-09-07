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
import { TOOL_NAMES, type ToolName, type TutorMode } from '@sotto/core';
import type { VoiceState } from '../events.ts';
import { SentenceChunker } from './chunker.ts';
import { safeReleaseIndex, stripMarkers } from './markers.ts';
import {
  QUESTION_NUDGE,
  QUESTION_RETRY_MAX_TOKENS,
  QUESTION_RETRY_TIMEOUT_MS,
  ReplyBudget,
  ReplyNormalizer,
  endsWithQuestion,
  isStopRequest,
  questionContinuation,
} from './reply-shape.ts';

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

/** Per-call generation options. Only `maxTokens` so far: the browser
 * cascade's 2B model fills whatever room it is given, so the conversational
 * modes ask for a ceiling too small to hold a five-line list (run 9 lane B;
 * `reply-shape.ts`'s `maxTokensForMode`). */
export interface EngineChatOptions {
  maxTokens?: number;
}

/** The one thing `worker.ts` must implement against a real LLM. */
export interface LlmEngine {
  chat(
    messages: ChatMessage[],
    handlers: EngineChatHandlers,
    signal: AbortSignal,
    options?: EngineChatOptions,
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
  /** The session's current tutor mode, read fresh each turn. Drives the
   * spoken-sentence cap (`ReplyBudget`). Omitted => no cap, which is what
   * every caller that predates run 9 lane B gets. */
  mode?: () => TutorMode;
  /** The generation ceiling to ask the engine for, read fresh each turn. */
  maxTokens?: () => number | undefined;
  /**
   * Diagnostic counter, wired to the worker's `metric` message. Two names
   * so far. `llm_capped`: the sentence cap aborts the engine mid-stream on
   * any reply longer than the mode's cap, and nothing in the log
   * distinguished that from the model stopping by itself — so if the abort
   * ever does hang the engine it reads as the old silent stall (run 9 lane
   * R, P1-5). `llm_question_retry` (detail `ok` / `dropped`): the
   * question-only continuation ran, and whether its answer was speakable —
   * the only way to see, in a log, how often the 2B model can be talked
   * into the one thing the contract asks for (run 9 lane H2, P0-2).
   * Optional: callers that predate this simply report nothing.
   */
  onMetric?: (name: string, detail?: string) => void;
  maxHistory?: number;
  maxToolIterations?: number;
}

const DEFAULT_MAX_HISTORY = 24;
const DEFAULT_MAX_TOOL_ITERATIONS = 4;

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * One signal that fires when either input does. `AbortSignal.any` exists in
 * every browser that can run WebGPU, but not in every runtime a unit test
 * might use, so the fallback is spelled out rather than assumed.
 */
function anySignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') return anyFn.call(AbortSignal, [a, b]);
  const merged = new AbortController();
  const onAbort = () => merged.abort();
  if (a.aborted || b.aborted) merged.abort();
  else {
    a.addEventListener('abort', onAbort, { once: true });
    b.addEventListener('abort', onAbort, { once: true });
  }
  return merged.signal;
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

  /**
   * Runs a full turn for one piece of learner text (from STT or
   * `sendText`). `skipUserTurn` (run7/G directive 1(c)) runs the model
   * against the system instruction alone, with no user message pushed into
   * history — for the automatic opening turn, where there is no learner
   * text yet and nothing should read back as "the learner said ''".
   */
  async run(
    userText: string,
    signal: AbortSignal,
    opts?: { skipUserTurn?: boolean },
  ): Promise<void> {
    if (!opts?.skipUserTurn) {
      this.history.push({ role: 'user', content: userText });
      this.trimHistory();
    }

    this.deps.onState('thinking');
    let messages = this.buildMessages();
    let finalText = '';
    // The final caption of the LAST engine call is held until the turn is
    // really over, because a question-only continuation (below) appends to
    // it. Earlier iterations — the tool round trip — still caption as they
    // always did, flushed on the way round the loop.
    let pendingCaption: string | null = null;
    // True only if the loop runs out of iterations with tool calls still
    // outstanding: a turn that ends mid-tool has nothing to follow up on.
    let toolsUnresolved = false;

    const flushCaption = (): void => {
      if (pendingCaption === null) return;
      this.deps.onTutorCaption(pendingCaption, true);
      pendingCaption = null;
    };

    for (let iteration = 0; iteration < this.maxToolIterations; iteration++) {
      if (signal.aborted) break;
      toolsUnresolved = false;

      const chunker = new SentenceChunker();
      // One normalizer and one budget per engine call: the leading-filler
      // rule is about the START of a reply, and the cap is per reply.
      const normalizer = new ReplyNormalizer();
      const budget = ReplyBudget.forMode(this.deps.mode?.());
      // The cap aborts the ENGINE, not the turn. A barge-in flips the
      // caller's `signal` and deliberately suppresses the final caption and
      // the `listening` transition (see the interrupt test); hitting the cap
      // is the opposite — the tutor said everything it was allowed to say,
      // so the caption must finalize and the session must go back to
      // listening. Hence a separate controller, merged only for the engine.
      const capAbort = new AbortController();
      const engineSignal = anySignal(signal, capAbort.signal);
      let capped = false;
      const spoken: string[] = [];

      const speak = async (sentences: string[]): Promise<void> => {
        for (const sentence of sentences) {
          if (!budget.take()) {
            capped = true;
            break;
          }
          spoken.push(sentence);
          await this.deps.onSentence(sentence);
        }
        if (capped && !capAbort.signal.aborted) {
          this.deps.onMetric?.('llm_capped', `${this.deps.mode?.() ?? 'unknown'} ${budget.count}`);
          capAbort.abort();
        }
      };

      let rawBuffer = '';

      const { text: rawText, toolCalls } = await this.deps.engine.chat(
        messages,
        {
          onTextDelta: async (delta) => {
            if (capped) return;
            rawBuffer += delta;
            const safeIdx = safeReleaseIndex(rawBuffer);
            const release = rawBuffer.slice(0, safeIdx);
            rawBuffer = rawBuffer.slice(safeIdx);
            if (!release) return;

            const { text: clean, readingTokenIds, pace } = stripMarkers(release);
            if (readingTokenIds.length > 0) this.deps.onReading(readingTokenIds);
            if (pace) this.deps.onPace(pace);

            const normalized = normalizer.push(clean);
            if (normalized) await speak(chunker.push(normalized));
          },
        },
        engineSignal,
        { maxTokens: this.deps.maxTokens?.() },
      );

      if (signal.aborted) break;

      if (!capped) {
        const { text: cleanRest, readingTokenIds, pace } = stripMarkers(rawBuffer);
        if (readingTokenIds.length > 0) this.deps.onReading(readingTokenIds);
        if (pace) this.deps.onPace(pace);

        const tail = normalizer.push(cleanRest) + normalizer.flush();
        await speak([...chunker.push(tail), ...chunker.flush()]);
      }

      // The caption, and the history entry, are exactly what was SPOKEN —
      // not the raw stream, which may hold a half-sentence the cap cut off.
      const turnText = spoken.join(' ');

      if (turnText.trim() && !signal.aborted) {
        pendingCaption = turnText.trim();
      }
      finalText += (finalText ? ' ' : '') + turnText.trim();

      // A capped generation was cut mid-stream, so any tool call it had
      // started is partial; do not replay it.
      if (capped) break;
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
      flushCaption();
      toolsUnresolved = true;
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

    const continuation = await this.maybeAskQuestion({
      answered: pendingCaption,
      learnerText: opts?.skipUserTurn ? '' : userText,
      toolsUnresolved,
      signal,
    });
    if (continuation) {
      await this.deps.onSentence(continuation);
      pendingCaption = `${pendingCaption} ${continuation}`;
      finalText = `${finalText.trim()} ${continuation}`;
    }
    if (!signal.aborted) flushCaption();

    if (finalText.trim()) {
      this.history.push({ role: 'assistant', content: finalText.trim() });
      this.trimHistory();
    }
    if (!signal.aborted) this.deps.onState('listening');
  }

  /**
   * The question-only continuation (run 9 lane H2, P0-2): ONE extra engine
   * call, discuss only, when the reply the tutor just gave does not end in a
   * question. See `reply-shape.ts` for why this exists rather than another
   * prompt rule.
   *
   * Returns the question to speak, or null — including for every reason not
   * to try at all, so `run()` reads as one condition. Never more than one
   * call: this is invoked once, after the turn loop.
   *
   * Deliberately NOT charged to `ReplyBudget`. The budget is per engine call
   * and is, in the common live case, exactly what cut the reply off before
   * it could ask anything; charging the continuation to it would make the
   * fix unreachable precisely when it is needed.
   */
  private async maybeAskQuestion(args: {
    answered: string | null;
    learnerText: string;
    toolsUnresolved: boolean;
    signal: AbortSignal;
  }): Promise<string | null> {
    const { answered, learnerText, toolsUnresolved, signal } = args;
    // Barged-in turns are the caller's to finish (see the interrupt test):
    // no caption, no `listening`, and certainly no extra decode.
    if (signal.aborted) return null;
    if (this.deps.mode?.() !== 'discuss') return null;
    if (toolsUnresolved) return null;
    if (!answered || !answered.trim()) return null;
    if (endsWithQuestion(answered)) return null;
    if (isStopRequest(learnerText)) return null;

    // The deadline is load-bearing, not defensive: see
    // QUESTION_RETRY_TIMEOUT_MS. It aborts the engine call AND stops
    // awaiting it, because the failure it exists for is a call that never
    // returns at all.
    const deadline = new AbortController();
    const engineSignal = anySignal(signal, deadline.signal);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        deadline.abort();
        resolve(null);
      }, QUESTION_RETRY_TIMEOUT_MS);
    });

    let raw: string | null = '';
    try {
      const result = await Promise.race([
        this.deps.engine.chat(
          [
            ...this.buildMessages(),
            { role: 'assistant', content: answered },
            { role: 'user', content: QUESTION_NUDGE },
          ],
          {},
          engineSignal,
          { maxTokens: QUESTION_RETRY_MAX_TOKENS },
        ),
        expired,
      ]);
      raw = result === null ? null : result.text;
    } catch {
      raw = '';
    } finally {
      clearTimeout(timer);
    }
    // A barge-in during the continuation is a barge-in: say nothing, and do
    // not report a drop that the learner caused.
    if (signal.aborted) return null;
    if (raw === null) {
      this.deps.onMetric?.('llm_question_retry', 'timeout');
      return null;
    }

    // The same marker pass every delta of the main stream gets. Without it
    // the model's empty `<think> </think>` wrapper reached Kokoro and was
    // read aloud as "think slash think" (AFTER3/run3.log, mic scenario).
    // Any reading/pace marker inside a follow-up question is noise, so it is
    // stripped and dropped rather than acted on.
    const { text: clean } = stripMarkers(raw);
    const question = questionContinuation(clean);
    this.deps.onMetric?.('llm_question_retry', question ? 'ok' : 'dropped');
    return question;
  }
}
