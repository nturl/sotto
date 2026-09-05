/**
 * `sotto-content translate-sentences [--locale xx] [--book id] [--dry-run]`
 * (O2-C task C1): fills missing `translation[<locale>]` entries directly in
 * the SOURCE bundles via the local LLM, same call shape/batching as
 * gloss-fill.ts, then rebuilds the affected packs so the new translations
 * reach `Sentence.translations`.
 *
 * `--dry-run` only reports what's missing, with no LLM calls and no writes
 * — used for the smoke test in the O2-C brief (today every sentence in
 * every bundle already has en/fr/es, so a plain run against those locales
 * finds nothing to do; this command exists for the explanation locales
 * Lane D adds later).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
  opts: { baseUrl: string; model: string; targetLocaleName: string; contentLanguageName: string },
): Promise<Record<string, string>> {
  if (sentences.length === 0) return {};
  if (sentences.length > TRANSLATE_BATCH_SIZE) {
    throw new Error(
      `translateSentencesBatch called with ${sentences.length} sentences, max is ${TRANSLATE_BATCH_SIZE}`,
    );
  }

  const sentenceList = sentences.map((s) => `- "${s.key}": "${s.text}"`).join('\n');
  const system = [
    `You are translating short sentences from a graded reader written in ${opts.contentLanguageName} for language learners.`,
    `Translate each sentence below into natural, level-appropriate ${opts.targetLocaleName}, keeping the same meaning and register — this is for a learner reading side-by-side, not a literary retranslation.`,
    'Reply with ONLY a JSON object mapping each sentence key EXACTLY as given to its translation as a plain string. No prose, no markdown code fences.',
  ].join(' ');

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
  const content = body.choices?.[0]?.message?.content ?? '';
  const parsed = TranslateResponseSchema.safeParse(JSON.parse(extractJsonObject(content)));
  if (!parsed.success) {
    throw new Error(
      `LLM sentence-translation response was not the expected shape: ${parsed.error.message}`,
    );
  }
  return parsed.data;
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
  const llmUrl = process.env.SOTTO_LLM_URL ?? DEFAULT_LLM_URL;
  const llmModel = process.env.SOTTO_LLM_MODEL ?? DEFAULT_LLM_MODEL;

  if (!existsSync(SOURCE_DIR)) {
    console.log('sotto-content translate-sentences: no source/ directory found');
    return [];
  }

  const rows: TranslateReportRow[] = [];
  const touchedFiles: string[] = [];
  const touchedBookIds: string[] = [];
  const reachable = opts.dryRun ? false : await isLlmReachable(llmUrl);
  if (!opts.dryRun && !reachable) {
    console.log(
      `sotto-content translate-sentences: LLM at ${llmUrl} is not reachable — running as a dry-run report only`,
    );
  }
  const willCallLlm = !opts.dryRun && reachable;

  for (const file of readdirSync(SOURCE_DIR)) {
    if (!file.endsWith('.bundle.json')) continue;
    const bookId = file.replace(/\.bundle\.json$/, '');
    if (opts.book && opts.book !== bookId) continue;

    const filePath = path.join(SOURCE_DIR, file);
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    const parsed = SourceBundleSchema.safeParse(raw);
    if (!parsed.success) {
      console.log(`sotto-content translate-sentences: ${file} failed schema validation, skipping`);
      continue;
    }
    const bundle = parsed.data;
    let language;
    try {
      language = getLanguage(bundle.contentLocale);
    } catch {
      language = undefined;
    }
    const contentLanguageName = language?.localizedNames.en ?? bundle.contentLocale;

    for (const locale of targetLocales) {
      const missing = collectMissingSentenceTranslations(bundle, locale);
      const missingBefore = missing.length;
      let filled = 0;

      if (missingBefore > 0 && willCallLlm) {
        const batches = chunk(missing, TRANSLATE_BATCH_SIZE);
        for (const batch of batches) {
          const result = await translateSentencesBatch(batch, {
            baseUrl: llmUrl,
            model: llmModel,
            targetLocaleName: targetLocaleName(locale),
            contentLanguageName,
          });
          filled += applyTranslations(bundle, locale, result);
        }
        if (filled > 0) touchedFiles.push(filePath);
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

    if (touchedFiles.includes(filePath)) {
      writeFileSync(filePath, JSON.stringify(bundle, null, 1) + '\n', 'utf8');
      touchedBookIds.push(bookId);
    }
  }

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

  return rows;
}
