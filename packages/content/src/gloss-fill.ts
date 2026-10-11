/**
 * Fills missing glossary entries via the local LLM (planning/CONTRACTS.md
 * §5d LLM shape). Used by `content:build` when a bundle has word tokens
 * with no glossary entry and the LLM is reachable (or `--fill` was passed).
 * The same call returns each word's lemma and grammar tags (`withGrammar`);
 * `fillGrammarBatch` asks for those alone, for `content:build --fill-grammar`.
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

/**
 * One word's fill result. `glosses` holds the per-locale translations (plus
 * `pinyin` for zh); `lemma` and `grammar` are present only when the model
 * returned them in a usable shape — a malformed or missing value leaves the
 * field absent rather than failing the batch.
 */
export interface GlossFillEntry {
  glosses: Record<string, string>;
  lemma?: string;
  grammar?: Record<string, string>;
}

/** Lemma + grammar only, for backfilling words that already have glosses. */
export interface GrammarFillEntry {
  lemma?: string;
  grammar?: Record<string, string>;
}

const FillResponseSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

/** Keeps a lemma only when it is a non-empty string. */
function parseLemma(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Keeps the GLOSS_LOCALES keys whose value is a non-empty string. */
function parseGrammar(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const locale of GLOSS_LOCALES) {
    const tag = (value as Record<string, unknown>)[locale];
    if (typeof tag === 'string' && tag.trim().length > 0) out[locale] = tag.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Splits one raw LLM entry into glosses (string values) and lemma/grammar extras. */
export function parseFillEntry(raw: Record<string, unknown>): GlossFillEntry {
  const glosses: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'lemma' || key === 'grammar') continue;
    if (typeof value === 'string') glosses[key] = value;
  }
  const lemma = parseLemma(raw.lemma);
  const grammar = parseGrammar(raw.grammar);
  return { glosses, ...(lemma ? { lemma } : {}), ...(grammar ? { grammar } : {}) };
}

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

/**
 * Words per call when glosses and lemma/grammar come back together. The
 * grammar map roughly doubles the output per word, so a full 40-word batch
 * would risk DeepSeek's max_tokens ceiling.
 */
export const GLOSS_GRAMMAR_FILL_BATCH_SIZE = 20;

interface LlmCallOpts {
  baseUrl: string;
  model: string;
  backend?: LlmBackend;
}

/** One chat-completions call returning the raw message content. */
async function callLlm(
  system: string,
  user: string,
  opts: LlmCallOpts,
): Promise<{ content: string; finishReason?: string }> {
  const backend = opts.backend ?? 'local';
  if (backend === 'deepseek') {
    const key = getDeepseekKey();
    const res = await fetch(`${DEEPSEEK_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        stream: false,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`DeepSeek auth rejected (${res.status}) — check ~/.config/deepseek/api_key`);
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
    return {
      content: body.choices?.[0]?.message?.content ?? '',
      finishReason: body.choices?.[0]?.finish_reason,
    };
  }
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
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
  return { content: body.choices?.[0]?.message?.content ?? '' };
}

/** Calls the LLM and parses a word -> object reply, retrying twice on failure. */
async function callForWordMap(
  label: string,
  system: string,
  user: string,
  opts: LlmCallOpts,
  attempt = 0,
): Promise<Record<string, Record<string, unknown>>> {
  let content = '';
  let finishReason: string | undefined;
  try {
    ({ content, finishReason } = await callLlm(system, user, opts));
    const parsed = FillResponseSchema.safeParse(JSON.parse(extractJsonObject(content)));
    if (!parsed.success) {
      throw new Error(`LLM fill response was not the expected shape: ${parsed.error.message}`);
    }
    return parsed.data;
  } catch (err) {
    if (attempt < 2) return callForWordMap(label, system, user, opts, attempt + 1);
    if (content) {
      console.error(
        `${label}: giving up after ${attempt + 1} attempts (finish_reason: ${finishReason ?? 'unknown'}); raw LLM content (first 2000 chars):\n${content.slice(0, 2000)}`,
      );
    }
    throw err;
  }
}

function wordListFor(words: GlossFillWord[]): string {
  return words.map((w) => `- "${w.word}" (in context: "${w.contextSentence}")`).join('\n');
}

const GRAMMAR_SHAPE_EXAMPLE = JSON.stringify({
  mangé: {
    lemma: 'manger',
    grammar: Object.fromEntries(
      GLOSS_LOCALES.map((l) => [l, l === 'en' ? 'verb · past participle' : '...']),
    ),
  },
});

/** The lemma/grammar instructions shared by the gloss and backfill prompts. */
function grammarInstructions(contentLanguageName: string): string {
  const localeNames = GLOSS_LOCALES.map((locale) => `${LOCALE_NAMES[locale]} (${locale})`).join(
    ', ',
  );
  return [
    `"lemma": the dictionary form in ${contentLanguageName} for the word as used in its sentence (infinitive for verbs, including reflexive verbs such as "se lever"; singular for nouns; masculine singular for adjectives; for Chinese, just the word itself).`,
    `"grammar": an object with keys ${GLOSS_LOCALES.join(', ')}, each a short grammatical tag for this occurrence written in that language (${localeNames}), at most 40 characters, parts separated by " · ". Examples in English: "verb · passé composé · 3rd sing.", "noun · fem. pl.", "article · fem. sing.", "preposition". Read the context sentence: the same spelling can be a different word (French "est" can be the verb être or the noun meaning east).`,
    `"grammar" must always be an object with all ${GLOSS_LOCALES.length} locale keys, never a single string. Shape for one word: ${GRAMMAR_SHAPE_EXAMPLE}`,
  ].join(' ');
}

export async function fillGlossesBatch(
  words: GlossFillWord[],
  opts: {
    baseUrl: string;
    model: string;
    needsPinyin: boolean;
    contentLanguageName: string;
    backend?: LlmBackend;
    /** Also ask for lemma + grammar in the same call (build does; import does not). */
    withGrammar?: boolean;
  },
): Promise<Record<string, GlossFillEntry>> {
  if (words.length === 0) return {};
  const max = opts.withGrammar ? GLOSS_GRAMMAR_FILL_BATCH_SIZE : GLOSS_FILL_BATCH_SIZE;
  if (words.length > max) {
    throw new Error(`fillGlossesBatch called with ${words.length} words, max is ${max}`);
  }
  console.error(`fillGlossesBatch: called with ${words.length} words`);

  const fields = opts.needsPinyin ? ['pinyin', ...GLOSS_LOCALES] : [...GLOSS_LOCALES];
  if (opts.withGrammar) fields.push('lemma', 'grammar');
  const localeNames = GLOSS_LOCALES.map((locale) => `${LOCALE_NAMES[locale]} (${locale})`).join(
    ', ',
  );
  const system = [
    `You are a lexicographer building a glossary for learners of ${opts.contentLanguageName}.`,
    `For each word below, using its sentence context to pick the right sense, give its translation into ${localeNames}${
      opts.needsPinyin ? ', plus Mandarin pinyin with tone marks (pinyin)' : ''
    }. For "zh-Hant" use Traditional Chinese characters only (never Simplified).`,
    ...(opts.withGrammar ? [`Also give ${grammarInstructions(opts.contentLanguageName)}`] : []),
    `Reply with ONLY a JSON object mapping each word EXACTLY as given (same spelling and case) to an object with keys ${fields.join(', ')}. The object must have exactly ${words.length} top-level keys — one per word listed below, no more and no fewer; do not add entries for any other word that appears in a context sentence. Escape any double-quote characters that appear inside a value as \\" so the result is valid JSON. No prose, no markdown code fences.`,
  ].join(' ');

  const raw = await callForWordMap(
    'fillGlossesBatch',
    system,
    `Words:\n${wordListFor(words)}`,
    opts,
  );
  const out: Record<string, GlossFillEntry> = {};
  for (const [word, entry] of Object.entries(raw)) {
    const parsed = parseFillEntry(entry);
    out[word] = opts.withGrammar ? parsed : { glosses: parsed.glosses };
  }
  return out;
}

/**
 * Backfill: asks only for lemma + grammar for words that already have
 * glosses, so existing glosses are never regenerated.
 */
export async function fillGrammarBatch(
  words: GlossFillWord[],
  opts: { baseUrl: string; model: string; contentLanguageName: string; backend?: LlmBackend },
): Promise<Record<string, GrammarFillEntry>> {
  if (words.length === 0) return {};
  if (words.length > GLOSS_FILL_BATCH_SIZE) {
    throw new Error(
      `fillGrammarBatch called with ${words.length} words, max is ${GLOSS_FILL_BATCH_SIZE}`,
    );
  }
  console.error(`fillGrammarBatch: called with ${words.length} words`);
  const system = [
    `You are a lexicographer annotating words for learners of ${opts.contentLanguageName}.`,
    `For each word below, using its sentence context, give ${grammarInstructions(opts.contentLanguageName)}`,
    `Reply with ONLY a JSON object mapping each word EXACTLY as given (same spelling and case) to an object with keys lemma, grammar. The object must have exactly ${words.length} top-level keys, one per word listed below. No prose, no markdown code fences.`,
  ].join(' ');
  const raw = await callForWordMap(
    'fillGrammarBatch',
    system,
    `Words:\n${wordListFor(words)}`,
    opts,
  );
  const out: Record<string, GrammarFillEntry> = {};
  for (const [word, entry] of Object.entries(raw)) {
    const { lemma, grammar } = parseFillEntry(entry);
    out[word] = { ...(lemma ? { lemma } : {}), ...(grammar ? { grammar } : {}) };
  }
  return out;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
