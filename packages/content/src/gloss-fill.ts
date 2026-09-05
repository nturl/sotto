/**
 * Fills missing glossary entries via the local LLM (planning/CONTRACTS.md
 * §5d LLM shape). Used by `content:build` when a bundle has word tokens
 * with no glossary entry and the LLM is reachable (or `--fill` was passed).
 */
import { z } from 'zod';

export const DEFAULT_LLM_URL = 'http://127.0.0.1:8080/v1';
export const DEFAULT_LLM_MODEL = 'qwen3.6-35b-a3b';

/**
 * The gloss/explanation locales every pack declares today (the fields the
 * glossary and gloss-fill LLM prompt produce). Also the set of locales
 * `Sentence.translations` must cover — see validate.ts's
 * sentence-translation-coverage rule and translate-sentences.ts.
 */
export const GLOSS_LOCALES = ['en', 'fr', 'es'] as const;

export async function isLlmReachable(baseUrl: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl}/models`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export interface GlossFillWord {
  word: string;
  /** One example sentence the word appears in, for disambiguation. */
  contextSentence: string;
}

const FillResponseSchema = z.record(z.string(), z.record(z.string(), z.string()));

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('LLM fill response did not contain a JSON object');
  }
  return text.slice(start, end + 1);
}

/** Fills at most 40 words per call (the batch size the brief specifies). */
export const GLOSS_FILL_BATCH_SIZE = 40;

export async function fillGlossesBatch(
  words: GlossFillWord[],
  opts: { baseUrl: string; model: string; needsPinyin: boolean; contentLanguageName: string },
): Promise<Record<string, Record<string, string>>> {
  if (words.length === 0) return {};
  if (words.length > GLOSS_FILL_BATCH_SIZE) {
    throw new Error(
      `fillGlossesBatch called with ${words.length} words, max is ${GLOSS_FILL_BATCH_SIZE}`,
    );
  }

  const fields = opts.needsPinyin ? ['pinyin', ...GLOSS_LOCALES] : [...GLOSS_LOCALES];
  const wordList = words
    .map((w) => `- "${w.word}" (in context: "${w.contextSentence}")`)
    .join('\n');
  const system = [
    `You are a lexicographer building a glossary for learners of ${opts.contentLanguageName}.`,
    `For each word below, using its sentence context to pick the right sense, give its translation into English (en), French (fr), and Spanish (es)${
      opts.needsPinyin ? ', plus Mandarin pinyin with tone marks (pinyin)' : ''
    }.`,
    `Reply with ONLY a JSON object mapping each word EXACTLY as given (same spelling and case) to an object with keys ${fields.join(', ')}. No prose, no markdown code fences.`,
  ].join(' ');

  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Words:\n${wordList}` },
      ],
      chat_template_kwargs: { enable_thinking: false },
      temperature: 0.2,
      stream: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM fill request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? '';
  const parsed = FillResponseSchema.safeParse(JSON.parse(extractJsonObject(content)));
  if (!parsed.success) {
    throw new Error(`LLM fill response was not the expected shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
