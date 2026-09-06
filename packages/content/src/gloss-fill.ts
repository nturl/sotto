/**
 * Fills missing glossary entries via the local LLM (planning/CONTRACTS.md
 * §5d LLM shape). Used by `content:build` when a bundle has word tokens
 * with no glossary entry and the LLM is reachable (or `--fill` was passed).
 *
 * Backend: `local` (default, llama.cpp at SOTTO_LLM_URL) or `deepseek` (set
 * `SOTTO_LLM_BACKEND=deepseek`) — DeepSeek's OpenAI-compatible chat
 * completions API (https://api.deepseek.com/chat/completions, model
 * deepseek-v4-flash). Reads the bearer token at runtime from
 * ~/.config/deepseek/api_key — never logged, never written into the repo.
 * Mirrors translate-sentences.ts's deepseek backend exactly: extended
 * "thinking" disabled, JSON response format, temperature 0.2, two retries on
 * parse failure or 5xx.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';

export const DEFAULT_LLM_URL = 'http://127.0.0.1:8080/v1';
export const DEFAULT_LLM_MODEL = 'qwen3.6-35b-a3b';

const DEEPSEEK_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';

export type LlmBackend = 'local' | 'deepseek';

let cachedDeepseekKey: string | null = null;
function getDeepseekKey(): string {
  if (cachedDeepseekKey) return cachedDeepseekKey;
  const keyPath = path.join(homedir(), '.config', 'deepseek', 'api_key');
  cachedDeepseekKey = readFileSync(keyPath, 'utf8').trim();
  return cachedDeepseekKey;
}

/** Accumulated DeepSeek token usage across every fillGlossesBatch call in
 * this process — printed as a one-line summary at the end of `content:build`. */
export const deepseekGlossUsage = { promptTokens: 0, completionTokens: 0, calls: 0 };

/**
 * The gloss/explanation locales every pack declares today (the fields the
 * glossary and gloss-fill LLM prompt produce). Also the set of locales
 * `Sentence.translations` must cover — see validate.ts's
 * sentence-translation-coverage rule and translate-sentences.ts.
 */
export const GLOSS_LOCALES = [
  'en',
  'fr',
  'es',
  'pt',
  'it',
  'zh-Hans',
  'zh-Hant',
  'ro',
  'ca',
] as const;

/**
 * Maps a book's `contentLocale` (e.g. "fr-FR") to the GLOSS_LOCALES key that
 * is always identity — the word/title in its own language, never a real
 * translation. Mirrors scripts/fill-locales.mjs's NATIVE_EXPLANATION_LOCALE.
 * fillGlossesBatch has no way to ask the LLM to skip this locale (the prompt
 * is one call across all GLOSS_LOCALES), so callers must force it back to
 * identity after the fact — see fillMissingGlosses in build.ts.
 */
export const OWN_GLOSS_LOCALE: Record<string, (typeof GLOSS_LOCALES)[number]> = {
  'en-US': 'en',
  'fr-FR': 'fr',
  'es-419': 'es',
  'ro-RO': 'ro',
  'it-IT': 'it',
  'pt-BR': 'pt',
  'ca-ES': 'ca',
  'zh-CN': 'zh-Hans',
};

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

/** English names for GLOSS_LOCALES, used to build the fill-batch system prompt. */
const LOCALE_NAMES: Record<(typeof GLOSS_LOCALES)[number], string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
  'zh-Hans': 'Chinese (Simplified)',
  'zh-Hant': 'Chinese (Traditional)',
  ro: 'Romanian',
  ca: 'Catalan',
};

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
  opts: {
    baseUrl: string;
    model: string;
    needsPinyin: boolean;
    contentLanguageName: string;
    backend?: LlmBackend;
  },
  attempt = 0,
): Promise<Record<string, Record<string, string>>> {
  if (words.length === 0) return {};
  if (words.length > GLOSS_FILL_BATCH_SIZE) {
    throw new Error(
      `fillGlossesBatch called with ${words.length} words, max is ${GLOSS_FILL_BATCH_SIZE}`,
    );
  }
  console.error(`fillGlossesBatch: called with ${words.length} words (attempt ${attempt})`);

  const backend = opts.backend ?? 'local';
  const fields = opts.needsPinyin ? ['pinyin', ...GLOSS_LOCALES] : [...GLOSS_LOCALES];
  const wordList = words
    .map((w) => `- "${w.word}" (in context: "${w.contextSentence}")`)
    .join('\n');
  const localeNames = GLOSS_LOCALES.map((locale) => `${LOCALE_NAMES[locale]} (${locale})`).join(
    ', ',
  );
  const system = [
    `You are a lexicographer building a glossary for learners of ${opts.contentLanguageName}.`,
    `For each word below, using its sentence context to pick the right sense, give its translation into ${localeNames}${
      opts.needsPinyin ? ', plus Mandarin pinyin with tone marks (pinyin)' : ''
    }. For "zh-Hant" use Traditional Chinese characters only (never Simplified).`,
    `Reply with ONLY a JSON object mapping each word EXACTLY as given (same spelling and case) to an object with keys ${fields.join(', ')}. The object must have exactly ${words.length} top-level keys — one per word listed below, no more and no fewer; do not add entries for any other word that appears in a context sentence. Escape any double-quote characters that appear inside a value as \\" so the result is valid JSON. No prose, no markdown code fences.`,
  ].join(' ');

  let content = '';
  let finishReason: string | undefined;
  try {
    if (backend === 'deepseek') {
      const key = getDeepseekKey();
      const res = await fetch(`${DEEPSEEK_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Words:\n${wordList}` },
          ],
          temperature: 0.2,
          max_tokens: 8000,
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          stream: false,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `DeepSeek auth rejected (${res.status}) — check ~/.config/deepseek/api_key`,
        );
      }
      if (!res.ok) {
        throw new Error(`DeepSeek fill request failed: ${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      if (body.usage) {
        deepseekGlossUsage.promptTokens += body.usage.prompt_tokens ?? 0;
        deepseekGlossUsage.completionTokens += body.usage.completion_tokens ?? 0;
        deepseekGlossUsage.calls += 1;
      }
      finishReason = body.choices?.[0]?.finish_reason;
      content = body.choices?.[0]?.message?.content ?? '';
    } else {
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
      content = body.choices?.[0]?.message?.content ?? '';
    }
    const parsed = FillResponseSchema.safeParse(JSON.parse(extractJsonObject(content)));
    if (!parsed.success) {
      throw new Error(`LLM fill response was not the expected shape: ${parsed.error.message}`);
    }
    return parsed.data;
  } catch (err) {
    if (attempt < 2) {
      return fillGlossesBatch(words, opts, attempt + 1);
    }
    if (content) {
      console.error(
        `fillGlossesBatch: giving up after ${attempt + 1} attempts (finish_reason: ${finishReason ?? 'unknown'}); raw LLM content (first 2000 chars):\n${content.slice(0, 2000)}`,
      );
    }
    throw err;
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
