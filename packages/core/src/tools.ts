/**
 * Tutor tool schemas + client-side executor (planning/CONTRACTS.md §5c).
 * Tools execute CLIENT-side against the store after zod parsing; invalid
 * args or unknown ids return `{ ok: false, error }` and never throw.
 */
import { z } from 'zod';
import type { TutorMode } from './models.ts';

export const TOOL_NAMES = [
  'get_current_passage',
  'set_reading_position',
  'save_vocabulary',
  'remove_vocabulary',
  'show_explanation',
  'set_session_mode',
  'mark_section_complete',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

const TutorModeSchema = z.enum(['read_to_me', 'read_with_me', 'pronunciation', 'discuss']);
const ExplanationKindSchema = z.enum(['translation', 'grammar', 'pronunciation']);

export const GetCurrentPassageArgs = z.object({}).strict();

export const SetReadingPositionArgs = z
  .object({
    tokenId: z.string().min(1).optional(),
    sentenceId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => Number(!!v.tokenId) + Number(!!v.sentenceId) === 1, {
    message: 'exactly one of tokenId or sentenceId is required',
  });

export const SaveVocabularyArgs = z
  .object({
    tokenId: z.string().min(1),
    translation: z.string().min(1).optional(),
  })
  .strict();

export const RemoveVocabularyArgs = z
  .object({
    savedWordId: z.string().min(1).optional(),
    tokenId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => Number(!!v.savedWordId) + Number(!!v.tokenId) === 1, {
    message: 'exactly one of savedWordId or tokenId is required',
  });

export const ShowExplanationArgs = z
  .object({
    tokenId: z.string().min(1).optional(),
    title: z.string().min(1),
    body: z.string().min(1),
    kind: ExplanationKindSchema,
  })
  .strict();

export const SetSessionModeArgs = z
  .object({
    mode: TutorModeSchema,
  })
  .strict();

export const MarkSectionCompleteArgs = z.object({}).strict();

const TOOL_SCHEMAS = {
  get_current_passage: GetCurrentPassageArgs,
  set_reading_position: SetReadingPositionArgs,
  save_vocabulary: SaveVocabularyArgs,
  remove_vocabulary: RemoveVocabularyArgs,
  show_explanation: ShowExplanationArgs,
  set_session_mode: SetSessionModeArgs,
  mark_section_complete: MarkSectionCompleteArgs,
} satisfies Record<ToolName, z.ZodTypeAny>;

/** OpenAI function-calling tool definitions, written for a tutor model. */
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_current_passage',
      description:
        "Get the sentences the learner currently has open, with their ids, and the learner's exact position in them. Call this before referring to specific words or sentences by id, or whenever you are unsure what the learner is looking at.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_reading_position',
      description:
        "Move the reader's current position to a specific token or sentence in the passage, e.g. after the learner asks to jump ahead or back, or after you finish reading a sentence aloud. Provide exactly one of tokenId or sentenceId.",
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Id of a token, e.g. "b1.s2.t3".' },
          sentenceId: { type: 'string', description: 'Id of a sentence, e.g. "b1.s2".' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_vocabulary',
      description:
        "Save a word the learner wants to remember, by the id of one of its tokens in the current passage. Omit translation to use the pack's own gloss for that word; pass translation only when you are giving a different explanation than the pack default.",
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Id of the token to save, e.g. "b1.s2.t3".' },
          translation: {
            type: 'string',
            description: 'Optional translation to store instead of the pack gloss.',
          },
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
      description:
        'Remove a previously saved word, e.g. when the learner says they already know it. Provide exactly one of savedWordId or tokenId.',
      parameters: {
        type: 'object',
        properties: {
          savedWordId: { type: 'string', description: 'Id of the saved word record.' },
          tokenId: {
            type: 'string',
            description: 'Id of the token whose saved word should be removed.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_explanation',
      description:
        'Show a short written explanation panel to the learner alongside your spoken reply — for a translation, a grammar point, or a pronunciation note. Keep body short; this supplements what you say, it does not replace it.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Optional token this explanation is about.' },
          title: {
            type: 'string',
            description: 'Short title for the panel, e.g. the word or phrase.',
          },
          body: { type: 'string', description: 'The explanation text, kept short.' },
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
      description:
        'Switch the tutoring mode, e.g. when the learner asks to practice pronunciation instead of reading, or to switch from listening to a free conversation about the passage.',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['read_to_me', 'read_with_me', 'pronunciation', 'discuss'],
          },
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
      description:
        'Mark the current chapter section as complete once the learner has finished it, advancing their reading progress. Call this only after the passage has actually been fully read or discussed.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
] as const;

export interface PassageSentenceView {
  id: string;
  text: string;
  tokenIds: string[];
}

export interface PassageContextResult {
  chapterTitle: string;
  sentences: PassageSentenceView[];
  positionTokenId: string | null;
}

export interface OkResult {
  ok: true;
}

export interface SaveVocabularyResult {
  ok: true;
  savedWordId: string;
}

export interface MarkSectionCompleteResult {
  ok: true;
  advanced: boolean;
}

export interface ToolFailure {
  ok: false;
  error: string;
}

export type ToolResult =
  PassageContextResult | OkResult | SaveVocabularyResult | MarkSectionCompleteResult | ToolFailure;

type MaybePromise<T> = T | Promise<T>;

/**
 * Implemented by the client store. Each method reports its own success/
 * failure (e.g. an unknown tokenId) rather than throwing; `executeTool`
 * additionally guards against a throw so a tool call can never crash the
 * session.
 */
export interface ToolExecutionContext {
  getPassage(): MaybePromise<PassageContextResult>;
  setPosition(id: string): MaybePromise<OkResult | ToolFailure>;
  saveWord(tokenId: string, translation?: string): MaybePromise<SaveVocabularyResult | ToolFailure>;
  removeWord(ref: { savedWordId?: string; tokenId?: string }): MaybePromise<OkResult | ToolFailure>;
  showExplanation(payload: {
    tokenId?: string;
    title: string;
    body: string;
    kind: 'translation' | 'grammar' | 'pronunciation';
  }): MaybePromise<OkResult | ToolFailure>;
  setMode(mode: TutorMode): MaybePromise<OkResult | ToolFailure>;
  markComplete(): MaybePromise<MarkSectionCompleteResult | ToolFailure>;
}

function zodErrorMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ');
}

export async function executeTool(
  name: string,
  args: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const schema = (TOOL_SCHEMAS as Record<string, z.ZodTypeAny | undefined>)[name];
  if (!schema) {
    return { ok: false, error: `unknown tool: ${name}` };
  }

  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: zodErrorMessage(parsed.error) };
  }

  try {
    switch (name as ToolName) {
      case 'get_current_passage':
        return await ctx.getPassage();
      case 'set_reading_position': {
        const data = parsed.data as z.infer<typeof SetReadingPositionArgs>;
        const id = data.tokenId ?? data.sentenceId;
        // Both branches are covered by the schema refine; id is always set here.
        return await ctx.setPosition(id as string);
      }
      case 'save_vocabulary': {
        const data = parsed.data as z.infer<typeof SaveVocabularyArgs>;
        return await ctx.saveWord(data.tokenId, data.translation);
      }
      case 'remove_vocabulary': {
        const data = parsed.data as z.infer<typeof RemoveVocabularyArgs>;
        return await ctx.removeWord({ savedWordId: data.savedWordId, tokenId: data.tokenId });
      }
      case 'show_explanation': {
        const data = parsed.data as z.infer<typeof ShowExplanationArgs>;
        return await ctx.showExplanation(data);
      }
      case 'set_session_mode': {
        const data = parsed.data as z.infer<typeof SetSessionModeArgs>;
        return await ctx.setMode(data.mode);
      }
      case 'mark_section_complete':
        return await ctx.markComplete();
      default:
        return { ok: false, error: `unknown tool: ${name}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
