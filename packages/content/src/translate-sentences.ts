/**
 * `sotto-content translate-sentences [--locale xx] [--book id] [--dry-run]`
 * (O2-C task C1): fills missing `translation[<locale>]` entries directly in
 * the SOURCE bundles via an LLM, same call shape/batching as gloss-fill.ts,
 * then rebuilds the affected packs so the new translations reach
 * `Sentence.translations`.
 *
 * Backend: `local` (default, llama.cpp at SOTTO_LLM_URL) or `deepseek` (set
 * `SOTTO_LLM_BACKEND=deepseek`) — DeepSeek's OpenAI-compatible chat
 * completions API (https://api.deepseek.com/chat/completions, model
 * deepseek-v4-flash). Reads the bearer token at runtime from
 * ~/.config/deepseek/api_key — never logged, never written into the repo.
 * DeepSeek requests disable the model's extended "thinking" (it's a
 * reasoning model by default, which is slow and burns tokens for a plain
 * translation task) and run up to DEEPSEEK_CONCURRENCY books in flight at
 * once; a batch is retried once on parse failure or 5xx.
 *
 * `--dry-run` only reports what's missing, with no LLM calls and no writes
 * — used for the smoke test in the O2-C brief (today every sentence in
 * every bundle already has en/fr/es, so a plain run against those locales
 * finds nothing to do; this command exists for the explanation locales
 * Lane D adds later).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { getLanguage } from '@sotto/core';
import { SourceBundleSchema, type SourceBundle } from './types.ts';
import { SOURCE_DIR } from './paths.ts';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_URL,
  GLOSS_LOCALES,
  chunk,
  isLlmReachable,
} from './gloss-fill.ts';
import { runBuildCommand } from './build.ts';

const DEEPSEEK_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const DEEPSEEK_CONCURRENCY = 8;

type LlmBackend = 'local' | 'deepseek';

let cachedDeepseekKey: string | null = null;
function getDeepseekKey(): string {
  if (cachedDeepseekKey) return cachedDeepseekKey;
  const keyPath = path.join(homedir(), '.config', 'deepseek', 'api_key');
  cachedDeepseekKey = readFileSync(keyPath, 'utf8').trim();
  return cachedDeepseekKey;
}

/** Runs `worker(item)` over `items` with at most `limit` in flight at once. */
async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function runOne(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      if (item === undefined) continue;
      results[i] = await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
}

const deepseekUsage = { promptTokens: 0, completionTokens: 0, calls: 0 };

/**
 * A book's own content language, mapped to the explanation-locale code that
 * means "the same language" — mirrors fill-locales.mjs's
 * NATIVE_EXPLANATION_LOCALE. The established convention (every existing
 * bundle's sentence.translation.en for an English book, .fr for a French
 * book, etc. equals sentence.text verbatim) means a sentence's own-language
 * "translation" is identity, not a fresh LLM call.
 */
const NATIVE_EXPLANATION_LOCALE: Record<string, string> = {
  'ro-RO': 'ro',
  'it-IT': 'it',
  'pt-BR': 'pt',
  'ca-ES': 'ca',
  'zh-CN': 'zh-Hans',
};

/** Mirrors gloss-fill's GLOSS_FILL_BATCH_SIZE — sentences are longer than
 * words, so a smaller batch keeps prompts a reasonable size. */
export const TRANSLATE_BATCH_SIZE = 20;

export interface SentenceToTranslate {
  /** Stable per-bundle key: "<chapterIndex>.<paragraphIndex>.<sentenceIndex>". */
  key: string;
  text: string;
}

const TranslateResponseSchema = z.record(z.string(), z.string());

export function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('LLM sentence-translation response did not contain a JSON object');
  }
  return text.slice(start, end + 1);
}

/**
 * Sends one batch of sentences to the local LLM and returns a map of
 * sentence key -> translated text. Same OpenAI-compatible chat-completions
 * shape as gloss-fill.ts's fillGlossesBatch: stable system instruction
 * first, cache_prompt + enable_thinking:false, JSON in/out.
 */
export async function translateSentencesBatch(
  sentences: SentenceToTranslate[],
  opts: {
    baseUrl: string;
    model: string;
    targetLocaleName: string;
    contentLanguageName: string;
    backend?: LlmBackend;
    targetLocale?: string;
  },
  attempt = 0,
): Promise<Record<string, string>> {
  if (sentences.length === 0) return {};
  if (sentences.length > TRANSLATE_BATCH_SIZE) {
    throw new Error(
      `translateSentencesBatch called with ${sentences.length} sentences, max is ${TRANSLATE_BATCH_SIZE}`,
    );
  }

  const backend = opts.backend ?? 'local';
  const sentenceList = sentences.map((s) => `- "${s.key}": "${s.text}"`).join('\n');
  const system = [
    `You are translating short sentences from a graded reader written in ${opts.contentLanguageName} for language learners.`,
    `Translate each sentence below into natural, level-appropriate ${opts.targetLocaleName}, keeping the same meaning and register — this is for a learner reading side-by-side, not a literary retranslation.` +
      (opts.targetLocale === 'zh-Hant'
        ? ' Use Traditional Chinese characters only (Taiwan conventions, never Simplified).'
        : ''),
    'Reply with ONLY a JSON object mapping each sentence key EXACTLY as given to its translation as a plain string. No prose, no markdown code fences.',
  ].join(' ');

  try {
    let content: string;
    if (backend === 'deepseek') {
      const key = getDeepseekKey();
      const res = await fetch(`${DEEPSEEK_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Sentences:\n${sentenceList}` },
          ],
          temperature: 0.2,
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
        throw new Error(
          `DeepSeek sentence-translation request failed: ${res.status} ${res.statusText}`,
        );
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      if (body.usage) {
        deepseekUsage.promptTokens += body.usage.prompt_tokens ?? 0;
        deepseekUsage.completionTokens += body.usage.completion_tokens ?? 0;
        deepseekUsage.calls += 1;
      }
      content = body.choices?.[0]?.message?.content ?? '';
    } else {
      const res = await fetch(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: opts.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Sentences:\n${sentenceList}` },
          ],
          chat_template_kwargs: { enable_thinking: false },
          cache_prompt: true,
          temperature: 0.2,
          stream: false,
        }),
      });
      if (!res.ok) {
        throw new Error(`LLM sentence-translation request failed: ${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      content = body.choices?.[0]?.message?.content ?? '';
    }
    const parsed = TranslateResponseSchema.safeParse(JSON.parse(extractJsonObject(content)));
    if (!parsed.success) {
      throw new Error(
        `LLM sentence-translation response was not the expected shape: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  } catch (err) {
    if (attempt === 0) {
      return translateSentencesBatch(sentences, opts, 1);
    }
    throw err;
  }
}

/** Collects every (chapter, paragraph, sentence) missing `translation[locale]`. */
export function collectMissingSentenceTranslations(
  bundle: SourceBundle,
  locale: string,
): SentenceToTranslate[] {
  const missing: SentenceToTranslate[] = [];
  bundle.chapters.forEach((chapter, ci) => {
    chapter.paragraphs.forEach((paragraph, pi) => {
      paragraph.sentences.forEach((sentence, si) => {
        if (!sentence.translation[locale]) {
          missing.push({ key: `${ci}.${pi}.${si}`, text: sentence.text });
        }
      });
    });
  });
  return missing;
}

function applyTranslations(
  bundle: SourceBundle,
  locale: string,
  translations: Record<string, string>,
): number {
  let applied = 0;
  for (const [key, text] of Object.entries(translations)) {
    const [ciStr, piStr, siStr] = key.split('.');
    const ci = Number(ciStr);
    const pi = Number(piStr);
    const si = Number(siStr);
    const sentence = bundle.chapters[ci]?.paragraphs[pi]?.sentences[si];
    if (sentence) {
      sentence.translation[locale] = text;
      applied += 1;
    }
  }
  return applied;
}

/** English name for a target locale, used in the LLM prompt. */
function targetLocaleName(locale: string): string {
  // The gloss-locale set (en/fr/es) plus whatever future explanation
  // locales Lane D adds all resolve through @sotto/core's UI catalogs.
  const names: Record<string, string> = {
    en: 'English',
    fr: 'French',
    es: 'Spanish',
    pt: 'Portuguese',
    it: 'Italian',
    'zh-Hans': 'Simplified Chinese',
    'zh-Hant': 'Traditional Chinese',
    ro: 'Romanian',
    ca: 'Catalan',
  };
  return names[locale] ?? locale;
}

interface TranslateReportRow {
  bookId: string;
  locale: string;
  targetLocale: string;
  missingBefore: number;
  filled: number;
  missingAfter: number;
}

export interface TranslateSentencesOptions {
  locale?: string;
  book?: string;
  dryRun?: boolean;
}

export async function runTranslateSentencesCommand(
  opts: TranslateSentencesOptions = {},
): Promise<TranslateReportRow[]> {
  const targetLocales = opts.locale ? [opts.locale] : [...GLOSS_LOCALES];
  const backend: LlmBackend = process.env.SOTTO_LLM_BACKEND === 'deepseek' ? 'deepseek' : 'local';
  const llmUrl = process.env.SOTTO_LLM_URL ?? DEFAULT_LLM_URL;
  const llmModel = process.env.SOTTO_LLM_MODEL ?? DEFAULT_LLM_MODEL;

  if (!existsSync(SOURCE_DIR)) {
    console.log('sotto-content translate-sentences: no source/ directory found');
    return [];
  }

  const rows: TranslateReportRow[] = [];
  const touchedFiles = new Set<string>();
  const touchedBookIds: string[] = [];

  let reachable = false;
  if (!opts.dryRun) {
    if (backend === 'deepseek') {
      try {
        getDeepseekKey();
        reachable = true;
      } catch {
        console.log(
          'sotto-content translate-sentences: ~/.config/deepseek/api_key not found — running as a dry-run report only',
        );
      }
    } else {
      reachable = await isLlmReachable(llmUrl);
      if (!reachable) {
        console.log(
          `sotto-content translate-sentences: LLM at ${llmUrl} is not reachable — running as a dry-run report only`,
        );
      }
    }
  }
  const willCallLlm = !opts.dryRun && reachable;

  const files = readdirSync(SOURCE_DIR).filter(
    (file) => file.endsWith('.bundle.json') && (!opts.book || file.startsWith(opts.book)),
  );

  async function processFile(file: string): Promise<void> {
    const bookId = file.replace(/\.bundle\.json$/, '');
    if (opts.book && opts.book !== bookId) return;

    const filePath = path.join(SOURCE_DIR, file);
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    const parsed = SourceBundleSchema.safeParse(raw);
    if (!parsed.success) {
      console.log(`sotto-content translate-sentences: ${file} failed schema validation, skipping`);
      return;
    }
    const bundle = parsed.data;
    let language;
    try {
      language = getLanguage(bundle.contentLocale);
    } catch {
      language = undefined;
    }
    const contentLanguageName = language?.localizedNames.en ?? bundle.contentLocale;

    const isNative = NATIVE_EXPLANATION_LOCALE[bundle.contentLocale] !== undefined;

    for (const locale of targetLocales) {
      const missing = collectMissingSentenceTranslations(bundle, locale);
      const missingBefore = missing.length;
      let filled = 0;

      if (
        !opts.dryRun &&
        missingBefore > 0 &&
        isNative &&
        NATIVE_EXPLANATION_LOCALE[bundle.contentLocale] === locale
      ) {
        // Identity: this book's own-language "translation" is the sentence text itself.
        const identity: Record<string, string> = {};
        for (const m of missing) identity[m.key] = m.text;
        filled += applyTranslations(bundle, locale, identity);
        if (filled > 0) touchedFiles.add(filePath);
      } else if (missingBefore > 0 && willCallLlm) {
        const batches = chunk(missing, TRANSLATE_BATCH_SIZE);
        for (const batch of batches) {
          const result = await translateSentencesBatch(batch, {
            baseUrl: llmUrl,
            model: llmModel,
            targetLocaleName: targetLocaleName(locale),
            contentLanguageName,
            backend,
            targetLocale: locale,
          });
          filled += applyTranslations(bundle, locale, result);
        }
        if (filled > 0) touchedFiles.add(filePath);
      }

      if (missingBefore > 0 || opts.locale) {
        rows.push({
          bookId,
          locale: bundle.contentLocale,
          targetLocale: locale,
          missingBefore,
          filled,
          missingAfter: missingBefore - filled,
        });
      }
    }

    if (touchedFiles.has(filePath)) {
      writeFileSync(filePath, JSON.stringify(bundle, null, 1) + '\n', 'utf8');
      touchedBookIds.push(bookId);
    }
  }

  const concurrency = backend === 'deepseek' && willCallLlm ? DEEPSEEK_CONCURRENCY : 1;
  await pool(files, concurrency, processFile);

  console.log('\nsotto-content translate-sentences summary:');
  if (rows.length === 0) {
    console.log(
      '(nothing missing for the requested locale(s) — every sentence already has a translation)',
    );
  } else {
    console.log(
      ['bookId', 'targetLocale', 'missingBefore', 'filled', 'missingAfter'].join('  |  '),
    );
    for (const row of rows) {
      console.log(
        [row.bookId, row.targetLocale, row.missingBefore, row.filled, row.missingAfter].join(
          '  |  ',
        ),
      );
    }
  }

  if (touchedBookIds.length > 0) {
    console.log(
      `\n${touchedBookIds.length} source bundle(s) updated — rebuilding affected packs...`,
    );
    for (const bookId of touchedBookIds) {
      await runBuildCommand({ only: bookId });
    }
  } else if (opts.dryRun || !willCallLlm) {
    console.log('\n(dry-run / LLM unreachable — no source bundles were modified)');
  }

  if (backend === 'deepseek' && deepseekUsage.calls > 0) {
    console.log('\n=== DeepSeek token usage (translate-sentences) ===');
    console.log(
      `calls: ${deepseekUsage.calls}, prompt tokens: ${deepseekUsage.promptTokens}, completion tokens: ${deepseekUsage.completionTokens}`,
    );
  }

  return rows;
}
