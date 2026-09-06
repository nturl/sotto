#!/usr/bin/env node
/**
 * Lane D1 standalone gloss filler — widens glossary/vocabulary-gloss/
 * localizedTitles/premise/summary coverage across all nine explanation
 * locales (en, fr, es, pt, it, zh-Hans, zh-Hant, ro, ca), reusing the same
 * batch-prompt shape as src/gloss-fill.ts's fillGlossesBatch (read-only for
 * this lane — see docs/content-qa.md for the exact diff that would let
 * build.ts's native --fill do this natively). en/fr/es were added for the
 * library-expansion run (planning/LIBRARY-EXPANSION.md Lane P): a French
 * book, for instance, is missing es/en premise/summary/localizedTitles/
 * vocabulary.gloss just like it's missing pt/it/etc — only its own content
 * locale (fr, via NATIVE_EXPLANATION_LOCALE) short-circuits to identity.
 *
 * Writes directly into packages/content/source/<bookId>.bundle.json.
 * Does NOT touch packs/ — run `pnpm content:build` (under the build lock)
 * afterward to regenerate them.
 *
 * Backends:
 *   --backend=local (default) — llama.cpp at http://127.0.0.1:8080/v1, qwen3.6-35b-a3b.
 *   --backend=deepseek — DeepSeek's OpenAI-compatible chat completions API
 *     (https://api.deepseek.com/chat/completions, model deepseek-v4-flash). Reads the
 *     bearer token at runtime from ~/.config/deepseek/api_key — never printed, never
 *     written into the repo. Runs up to 8 books concurrently per locale; retries a
 *     batch once on parse failure or 5xx.
 *
 * Usage:
 *   node scripts/fill-locales.mjs [--locales pt,it,zh-Hans,zh-Hant,ro,ca] [--books a,b,c] [--dry-run] [--backend=deepseek]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(__dirname, '..', 'source');

const LOCAL_LLM_URL = 'http://127.0.0.1:8080/v1';
const LOCAL_LLM_MODEL = 'qwen3.6-35b-a3b';
const DEEPSEEK_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const DEEPSEEK_CONCURRENCY = 8;
const BATCH_SIZE = 40;

const LOCALE_LANGUAGE_NAME = {
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

const CONTENT_LANGUAGE_NAME = {
  'fr-FR': 'French',
  'es-419': 'Spanish',
  'en-US': 'English',
  'pt-BR': 'Portuguese',
  'it-IT': 'Italian',
  'zh-CN': 'Chinese',
  'ro-RO': 'Romanian',
  'ca-ES': 'Catalan',
};

const DEFAULT_ORDER = ['en', 'fr', 'es', 'pt', 'it', 'zh-Hans', 'zh-Hant', 'ro', 'ca'];

/**
 * A book's own content language, mapped to the explanation-locale code that
 * means "the same language". For these (bookId content in that language,
 * explanation locale = that language), the established convention already
 * visible in every existing bundle (en/en, fr/fr, es/es glossary entries are
 * always the word itself) is: glossary/vocabulary gloss and localizedTitles
 * are IDENTITY — the word/title in its own language — not a translation.
 * premise/summary are NOT identity: those are meta-text authored in English
 * and always genuinely translated per locale, including into a book's own
 * content language (see fr/es books' premise.fr/premise.es, which are real
 * translations of premise.en, not copies of any book text).
 */
const NATIVE_EXPLANATION_LOCALE = {
  'en-US': 'en',
  'fr-FR': 'fr',
  'es-419': 'es',
  'ro-RO': 'ro',
  'it-IT': 'it',
  'pt-BR': 'pt',
  'ca-ES': 'ca',
  'zh-CN': 'zh-Hans',
};

// ---- token usage tracking (for the spend estimate in the report) --------
const usage = { promptTokens: 0, completionTokens: 0, calls: 0 };

function parseArgs(argv) {
  const out = { locales: DEFAULT_ORDER, books: null, dryRun: false, backend: 'local' };
  for (const a of argv) {
    if (a.startsWith('--locales=')) out.locales = a.slice('--locales='.length).split(',');
    else if (a.startsWith('--books=')) out.books = a.slice('--books='.length).split(',');
    else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--backend=')) out.backend = a.slice('--backend='.length);
  }
  return out;
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('LLM response did not contain a JSON object');
  }
  return text.slice(start, end + 1);
}

let deepseekKey = null;
function getDeepseekKey() {
  if (deepseekKey) return deepseekKey;
  const keyPath = path.join(homedir(), '.config', 'deepseek', 'api_key');
  deepseekKey = readFileSync(keyPath, 'utf8').trim();
  return deepseekKey;
}

async function chatComplete(system, user, backend) {
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
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        stream: false,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`DeepSeek auth rejected (${res.status}) — check ~/.config/deepseek/api_key`);
    }
    if (!res.ok) throw new Error(`DeepSeek request failed: ${res.status} ${res.statusText}`);
    const body = await res.json();
    if (body.usage) {
      usage.promptTokens += body.usage.prompt_tokens ?? 0;
      usage.completionTokens += body.usage.completion_tokens ?? 0;
      usage.calls += 1;
    }
    return body.choices?.[0]?.message?.content ?? '';
  }

  const res = await fetch(`${LOCAL_LLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: LOCAL_LLM_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      chat_template_kwargs: { enable_thinking: false },
      cache_prompt: true,
      temperature: 0.2,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status} ${res.statusText}`);
  const body = await res.json();
  return body.choices?.[0]?.message?.content ?? '';
}

async function chatCompleteRetrying(system, user, backend, label) {
  try {
    return await chatComplete(system, user, backend);
  } catch (err) {
    const retryable =
      backend === 'deepseek' && (/^DeepSeek request failed: 5\d\d/.test(err.message) || true);
    if (retryable) {
      console.warn(`  retrying ${label} after error: ${err.message}`);
      return await chatComplete(system, user, backend);
    }
    throw err;
  }
}

/** words: [{word, contextSentence}]; returns {word: translation} */
async function fillWordBatch(words, targetLocale, contentLanguageName, backend, attempt = 0) {
  const langName = LOCALE_LANGUAGE_NAME[targetLocale];
  const wordList = words
    .map((w) => `- "${w.word}" (in context: "${w.contextSentence}")`)
    .join('\n');
  const system =
    `You are a lexicographer building a glossary for learners of ${contentLanguageName}. ` +
    `For each word below, using its sentence context to pick the right sense, give its translation into ${langName}` +
    (targetLocale === 'zh-Hant'
      ? ' using Traditional Chinese characters only (Taiwan conventions, never Simplified).'
      : '.') +
    ` Reply with ONLY a JSON object mapping each word EXACTLY as given (same spelling and case) to a single string translation. No prose, no markdown code fences, no nested objects.`;
  try {
    const content = await chatComplete(system, `Words:\n${wordList}`, backend);
    return JSON.parse(extractJsonObject(content));
  } catch (err) {
    if (attempt === 0) {
      console.warn(
        `  retrying batch of ${words.length} words for ${targetLocale} (${err.message})`,
      );
      return fillWordBatch(words, targetLocale, contentLanguageName, backend, 1);
    }
    throw err;
  }
}

/** fields: {en,fr,es,...} strings; translates one text field per key into targetLocale */
async function fillTextBatch(items, targetLocale, contentLanguageName, backend, attempt = 0) {
  // items: [{key, text}] where key is e.g. "localizedTitles", "premise:sent0" etc; text is the English source text.
  const langName = LOCALE_LANGUAGE_NAME[targetLocale];
  const list = items.map((it) => `- "${it.key}": "${it.text}"`).join('\n');
  const system =
    `You are a translator localizing a language-learning app's book metadata into ${langName}` +
    (targetLocale === 'zh-Hant'
      ? ' (Traditional Chinese characters only, Taiwan conventions, never Simplified).'
      : '.') +
    ` The source text is in English. ` +
    `Translate each labeled text into ${langName}, preserving meaning and tone for language learners. ` +
    `Reply with ONLY a JSON object mapping each key EXACTLY as given to its translated string. No prose, no markdown fences.`;
  try {
    const content = await chatComplete(system, `Texts:\n${list}`, backend);
    return JSON.parse(extractJsonObject(content));
  } catch (err) {
    if (attempt === 0) {
      console.warn(
        `  retrying text batch (${items.length} items) for ${targetLocale} (${err.message})`,
      );
      return fillTextBatch(items, targetLocale, contentLanguageName, backend, 1);
    }
    throw err;
  }
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function firstContextSentence(bundle, word) {
  const needle = word.toLowerCase();
  for (const chapter of bundle.chapters) {
    for (const paragraph of chapter.paragraphs) {
      for (const sentence of paragraph.sentences) {
        if (sentence.text.toLowerCase().includes(needle)) return sentence.text;
      }
    }
  }
  return word;
}

async function fillBundleLocale(bundle, sourceFilePath, targetLocale, dryRun, backend) {
  const contentLanguageName = CONTENT_LANGUAGE_NAME[bundle.contentLocale] ?? bundle.contentLocale;
  const isNative = NATIVE_EXPLANATION_LOCALE[bundle.contentLocale] === targetLocale;
  let filled = 0;
  let total = 0;

  // 1. glossary — identity (the word itself) when targetLocale is the book's
  // own content language, matching the established en/en, fr/fr, es/es pattern.
  const missingGlossary = Object.entries(bundle.glossary).filter(
    ([, entry]) => !(targetLocale in entry),
  );
  total += Object.keys(bundle.glossary).length;
  if (missingGlossary.length > 0) {
    if (isNative) {
      if (!dryRun) {
        for (const [word] of missingGlossary) bundle.glossary[word][targetLocale] = word;
      }
      filled += missingGlossary.length;
    } else {
      const words = missingGlossary.map(([word]) => ({
        word,
        contextSentence: firstContextSentence(bundle, word),
      }));
      for (const batch of chunk(words, BATCH_SIZE)) {
        if (dryRun) {
          filled += batch.length;
          continue;
        }
        const result = await fillWordBatch(batch, targetLocale, contentLanguageName, backend);
        for (const w of batch) {
          const translation = result[w.word];
          if (typeof translation === 'string' && translation.length > 0) {
            bundle.glossary[w.word][targetLocale] = translation;
            filled += 1;
          } else {
            console.warn(
              `  MISSING after fill: glossary["${w.word}"].${targetLocale} in ${bundle.bookId}`,
            );
          }
        }
      }
    }
  }

  // 2. vocabulary[].gloss — same identity rule.
  const missingVocab = bundle.vocabulary.filter((v) => !(targetLocale in v.gloss));
  if (missingVocab.length > 0 && !dryRun) {
    if (isNative) {
      for (const v of missingVocab) v.gloss[targetLocale] = v.word;
    } else {
      const words = missingVocab.map((v) => ({
        word: v.word,
        contextSentence: firstContextSentence(bundle, v.word),
      }));
      for (const batch of chunk(words, BATCH_SIZE)) {
        const result = await fillWordBatch(batch, targetLocale, contentLanguageName, backend);
        for (const v of missingVocab) {
          const translation = result[v.word];
          if (typeof translation === 'string' && translation.length > 0) {
            v.gloss[targetLocale] = translation;
          }
        }
      }
    }
  }

  // 3. localizedTitles — identity (bundle.title) when native; premise/summary
  // are always a real translation of the English meta-text, even when native,
  // since they're authored prose, not the book's own title/text.
  if (!dryRun) {
    if (isNative && !(targetLocale in bundle.localizedTitles) && bundle.title) {
      bundle.localizedTitles[targetLocale] = bundle.title;
    }
    const textItems = [];
    if (!isNative && !(targetLocale in bundle.localizedTitles) && bundle.localizedTitles.en) {
      textItems.push({ key: 'localizedTitles', text: bundle.localizedTitles.en });
    }
    if (!(targetLocale in bundle.premise) && bundle.premise.en) {
      textItems.push({ key: 'premise', text: bundle.premise.en });
    }
    if (!(targetLocale in bundle.summary) && bundle.summary.en) {
      textItems.push({ key: 'summary', text: bundle.summary.en });
    }
    if (textItems.length > 0) {
      const result = await fillTextBatch(textItems, targetLocale, contentLanguageName, backend);
      if (typeof result.localizedTitles === 'string')
        bundle.localizedTitles[targetLocale] = result.localizedTitles;
      if (typeof result.premise === 'string') bundle.premise[targetLocale] = result.premise;
      if (typeof result.summary === 'string') bundle.summary[targetLocale] = result.summary;
    }
  }

  return { filled, total };
}

/** Runs `worker(item)` over `items` with at most `limit` in flight at once. */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.backend === 'deepseek') {
    getDeepseekKey(); // fail fast if the key file is missing
  }
  const files = readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.bundle.json'));
  const targetFiles = args.books
    ? files.filter((f) => args.books.some((b) => f.startsWith(b)))
    : files;

  const coverage = {};
  const concurrency = args.backend === 'deepseek' ? DEEPSEEK_CONCURRENCY : 1;

  for (const locale of args.locales) {
    console.log(
      `\n=== locale: ${locale} (backend: ${args.backend}, concurrency: ${concurrency}) ===`,
    );
    await pool(targetFiles, concurrency, async (file) => {
      const filePath = path.join(SOURCE_DIR, file);
      const bundle = JSON.parse(readFileSync(filePath, 'utf8'));
      const bookId = bundle.bookId;
      const { filled, total } = await fillBundleLocale(
        bundle,
        filePath,
        locale,
        args.dryRun,
        args.backend,
      );
      if (!args.dryRun && filled > 0) {
        writeFileSync(filePath, JSON.stringify(bundle, null, 1) + '\n', 'utf8');
      }
      const nowFilled = Object.entries(bundle.glossary).filter(([, e]) => locale in e).length;
      console.log(`  ${bookId}: ${nowFilled}/${total} glossary words have ${locale}`);
      coverage[bookId] = coverage[bookId] || {};
      coverage[bookId][locale] = { filled: nowFilled, total };
    });
  }

  console.log('\n=== coverage summary ===');
  console.log(JSON.stringify(coverage, null, 2));

  if (args.backend === 'deepseek' && usage.calls > 0) {
    console.log('\n=== DeepSeek token usage (fill-locales.mjs) ===');
    console.log(
      `calls: ${usage.calls}, prompt tokens: ${usage.promptTokens}, completion tokens: ${usage.completionTokens}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
