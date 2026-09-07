/**
 * The JSON-tool fallback protocol for the in-browser tutor — the prompt
 * that asks for it and the parser that reads it back — kept free of any ML
 * import so it has plain unit tests (test/browser-cascade-tool-protocol.
 * test.ts). `worker.ts`'s `WebLlmEngine` is the only caller.
 */
import { TOOL_DEFINITIONS, TOOL_NAMES } from '@sotto/core';
import type { ChatMessage, EngineToolCall } from './llm-turn.ts';

/**
 * Fallback tool protocol for a WebLLM build that rejects the OpenAI `tools`
 * parameter (0.2.84 only wires native tools for the Hermes models; every
 * Qwen build throws `... is not supported for ChatCompletionRequest.tools`).
 *
 * Two generations of this protocol, both accepted by the parser below:
 *
 *  1. The original invented shape — a fenced ```tool { ... } ``` block. It
 *     is what the instruction asked for through run 8, and what Qwen3-1.7B
 *     sometimes produced. Kept so nothing that used to parse stops parsing.
 *  2. Qwen's OWN function-calling shape (run 9): the `<tools>` block in the
 *     system prompt and the `<tool_call>{json}</tool_call>` reply, exactly
 *     as the Qwen2.5/Qwen3/Qwen3.5 chat templates render native tools. The
 *     model was post-trained on that text, not on an ad-hoc fence, so it is
 *     the shape a Qwen build imitates most reliably. WebLLM's non-Jinja
 *     conversation template never injects this block itself, so the
 *     instruction has to carry it verbatim. (Run 9's actual failure —
 *     Qwen3.5-4B answering a save request with "Guardé **cigarra** para
 *     ti." and no block at all — turned out to be worker.ts sending later
 *     turns with no instruction whatsoever; see `WebLlmEngine.chat`.)
 *
 * The parser is deliberately lenient beyond both shapes: a bare JSON
 * object naming a known tool (no fence, no tags) also counts, because a
 * small model that has the right JSON but drops the wrapper should still
 * get its tool executed rather than have the JSON read out as prose.
 */
const TOOL_TAG_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i;
const TOOL_FENCE_RE = /```(?:tool|json)?\s*(\{[\s\S]*?\})\s*```/i;

export function withJsonToolInstruction(messages: ChatMessage[]): ChatMessage[] {
  const signatures = TOOL_DEFINITIONS.map((t) => JSON.stringify(t)).join('\n');
  const instruction =
    '# Tools\n\n' +
    'You may call one or more functions to assist with the user query.\n\n' +
    'You are provided with function signatures within <tools></tools> XML tags:\n' +
    `<tools>\n${signatures}\n</tools>\n\n` +
    'For each function call, return a json object with function name and arguments ' +
    'within <tool_call></tool_call> XML tags:\n' +
    '<tool_call>\n{"name": <function-name>, "arguments": <args-json-object>}\n</tool_call>\n\n' +
    // The worked example and the "do not narrate" line predate the native
    // shape (slice 5): a weak model imitates a concrete shown shape far more
    // reliably than a prose description of one, and without the explicit
    // rule it says "I will save it" and never does.
    'When the learner asks you to save a word, move the passage, or show an ' +
    'explanation, you must emit the <tool_call> block — never just describe the ' +
    'action in prose, and never claim it is done without the block. Put the block ' +
    'at the very start of your reply, before any spoken text. Example: the learner ' +
    'says "guarda la palabra cigarra" and the passage lists cigarra=t6 under b1.s1:\n' +
    '<tool_call>\n{"name": "save_vocabulary", "arguments": {"tokenId": "b1.s1.t6", "word": "cigarra"}}\n</tool_call>\n' +
    'Guardé "cigarra" en tu lista.\n' +
    // whisper-base (the standard tier's STT) hears "cigarra" as "sigurra"
    // or "grab": a 2B model then saves the misheard spelling against the
    // wrong id and the executor rightly rejects it. The passage word list
    // is the ground truth it should snap to.
    "The learner's words are transcribed by speech recognition and may be " +
    'misspelled; when a word is not in the passage word list, use the closest ' +
    'word that is, with that word and its tokenId.';
  if (messages[0]?.role !== 'system') return messages;
  return [
    { ...messages[0], content: `${messages[0].content}\n\n${instruction}` },
    ...messages.slice(1).map(toFallbackMessage),
  ];
}

/**
 * WebLLM's fixed (non-Jinja) Qwen conversation template has no `tool` role:
 * the continuation call after a tool result threw `Role is not supported:
 * tool` on every run, so the learner heard "Sorry, something went wrong
 * there" right after a save that had in fact succeeded (run 9, large-tier
 * e2e). Qwen's own template renders a tool result as a USER turn wrapping
 * `<tool_response>`, and the assistant's call as its text plus the
 * `<tool_call>` block — so that is the shape the history is re-rendered
 * into here. `llm-turn.ts` keeps the OpenAI-shaped history untouched.
 */
function toFallbackMessage(m: ChatMessage): ChatMessage {
  if (m.role === 'tool') {
    return { role: 'user', content: `<tool_response>\n${m.content}\n</tool_response>` };
  }
  if (m.role === 'assistant' && m.tool_calls?.length) {
    const blocks = m.tool_calls.map((tc) => {
      let args: unknown = {};
      try {
        args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        args = {};
      }
      return `<tool_call>\n${JSON.stringify({ name: tc.function.name, arguments: args })}\n</tool_call>`;
    });
    return { role: 'assistant', content: [m.content, ...blocks].filter(Boolean).join('\n') };
  }
  return m;
}

/** End index of the balanced `{...}` starting at `start`, or -1. String
 * literals are skipped so a brace inside an argument value doesn't close
 * the object early. */
function balancedObjectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function toEngineToolCall(json: string): EngineToolCall | null {
  try {
    const parsed = JSON.parse(json) as {
      name?: string;
      arguments?: unknown;
      parameters?: unknown;
    };
    if (typeof parsed.name !== 'string') return null;
    const args = parsed.arguments ?? parsed.parameters ?? {};
    return { id: 'call_0', name: parsed.name, arguments: JSON.stringify(args) };
  } catch {
    return null;
  }
}

export function parseJsonToolBlock(
  text: string,
): { call: EngineToolCall; strippedText: string } | null {
  const strip = (from: number, to: number) => (text.slice(0, from) + text.slice(to)).trim();

  for (const re of [TOOL_TAG_RE, TOOL_FENCE_RE]) {
    const m = re.exec(text);
    if (!m) continue;
    const call = toEngineToolCall(m[1]!.trim());
    if (call) return { call, strippedText: strip(m.index, m.index + m[0].length) };
  }

  // Bare JSON object naming a known tool, anywhere in the reply.
  const bare = /\{\s*"name"\s*:\s*"([a-z_]+)"/gi;
  for (const m of text.matchAll(bare)) {
    if (!(TOOL_NAMES as readonly string[]).includes(m[1]!)) continue;
    const end = balancedObjectEnd(text, m.index!);
    if (end === -1) continue;
    const call = toEngineToolCall(text.slice(m.index!, end));
    if (call) return { call, strippedText: strip(m.index!, end) };
  }
  return null;
}
