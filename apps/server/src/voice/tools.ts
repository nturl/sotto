/**
 * The 7 tutor tools (planning/CONTRACTS.md §5c) as OpenAI `tools` definitions,
 * plus zod schemas to validate `delta.tool_calls[].function.arguments` before
 * relaying a tool_call to the client. The server never executes these — it
 * only validates shape and relays; @sotto/core will later own the canonical
 * copy shared with the client, but this package does not depend on it (WS-3
 * scope note).
 */
import { z } from 'zod';
import { tutorModeSchema, type ToolName } from './types.js';

export const toolArgSchemas = {
  get_current_passage: z.object({}),
  set_reading_position: z
    .object({ tokenId: z.string().optional(), sentenceId: z.string().optional() })
    .refine((v) => !!v.tokenId || !!v.sentenceId, 'tokenId or sentenceId required'),
  save_vocabulary: z.object({ tokenId: z.string(), translation: z.string().optional() }),
  remove_vocabulary: z
    .object({ savedWordId: z.string().optional(), tokenId: z.string().optional() })
    .refine((v) => !!v.savedWordId || !!v.tokenId, 'savedWordId or tokenId required'),
  show_explanation: z.object({
    tokenId: z.string().optional(),
    title: z.string(),
    body: z.string(),
    kind: z.enum(['translation', 'grammar', 'pronunciation']),
  }),
  set_session_mode: z.object({ mode: tutorModeSchema }),
  mark_section_complete: z.object({}),
} as const satisfies Record<ToolName, z.ZodTypeAny>;

/** OpenAI chat-completions `tools` array, sent verbatim to the LLM. */
export const openAiTools = [
  {
    type: 'function',
    function: {
      name: 'get_current_passage',
      description: 'Returns the bounded visible passage, chapter title, token IDs, and current reading position.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_reading_position',
      description: 'Moves the visible reading position to a validated sentence or token in the current chapter.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string' },
          sentenceId: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_vocabulary',
      description: 'Saves a specific word or phrase (by token id) with an optional translation override.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string' },
          translation: { type: 'string' },
        },
        required: ['tokenId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_vocabulary',
      description: 'Removes a saved vocabulary item, resolved by its stable saved-word id or source token id.',
      parameters: {
        type: 'object',
        properties: {
          savedWordId: { type: 'string' },
          tokenId: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_explanation',
      description: 'Displays a structured translation, grammar note, or pronunciation tip in the app.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          kind: { type: 'string', enum: ['translation', 'grammar', 'pronunciation'] },
        },
        required: ['title', 'body', 'kind'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_session_mode',
      description: 'Changes the tutor session mode among narration, read-along, pronunciation, and discussion.',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['read_to_me', 'read_with_me', 'pronunciation', 'discuss'] },
        },
        required: ['mode'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_section_complete',
      description: 'Marks the current section complete and advances only when appropriate.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
] as const;

export function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(toolArgSchemas, name);
}

/** Parses raw JSON-string tool-call arguments against the matching schema. */
export function parseToolArgs(name: ToolName, rawArgs: string): { ok: true; args: unknown } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = rawArgs.trim() === '' ? {} : JSON.parse(rawArgs);
  } catch {
    return { ok: false, error: 'invalid JSON arguments' };
  }
  const schema = toolArgSchemas[name];
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, args: result.data };
}
