#!/usr/bin/env node
/**
 * Lane D1 standalone gloss filler — widens glossary/vocabulary-gloss/
 * localizedTitles/premise/summary coverage to the six explanation locales
 * beyond en/fr/es (pt, it, zh-Hans, zh-Hant, ro, ca), reusing the same
 * batch-prompt shape as src/gloss-fill.ts's fillGlossesBatch (read-only for
 * this lane — see docs/content-qa.md for the exact diff that would let
 * build.ts's native --fill do this natively).
 *
 * Writes directly into packages/content/source/<bookId>.bundle.json.
 * Does NOT touch packs/ — run `pnpm content:build` (under the build lock)
 * afterward to regenerate them.
 *
 * Usage:
 *   node scripts/fill-locales.mjs [--locales pt,it,zh-Hans,zh-Hant,ro,ca] [--books a,b,c] [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(__dirname, '..', 'source');

const LLM_URL = 'http://127.0.0.1:8080/v1';
const LLM_MODEL = 'qwen3.6-35b-a3b';
const BATCH_SIZE = 40;

const LOCALE_LANGUAGE_NAME = {
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

const DEFAULT_ORDER = ['pt', 'it', 'zh-Hans', 'zh-Hant', 'ro', 'ca'];

function parseArgs(argv) {
  const out = { locales: DEFAULT_ORDER, books: null, dryRun: false };
  for (const a of argv) {
    if (a.startsWith('--locales=')) out.locales = a.slice('--locales='.length).split(',');
    else if (a.startsWith('--books=')) out.books = a.slice('--books='.length).split(',');
    else if (a === '--dry-run') out.dryRun = true;
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

async function chatComplete(system, user) {
  const res = await fetch(`${LLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: LLM_MODEL,
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

/** words: [{word, contextSentence}]; returns {word: translation} */
async function fillWordBatch(words, targetLocale, contentLanguageName, attempt = 0) {
  const langName = LOCALE_LANGUAGE_NAME[targetLocale];
  const wordList = words.map((w) => `- "${w.word}" (in context: "${w.contextSentence}")`).join('\n');
  const system =
    `You are a lexicographer building a glossary for learners of ${contentLanguageName}. ` +
    `For each word below, using its sentence context to pick the right sense, give its translation into ${langName}` +
    (targetLocale === 'zh-Hant' ? ' using Traditional Chinese characters only (never Simplified).' : '.') +
    ` Reply with ONLY a JSON object mapping each word EXACTLY as given (same spelling and case) to a single string translation. No prose, no markdown code fences, no nested objects.`;
  const content = await chatComplete(system, `Words:\n${wordList}`);
  try {
    const parsed = JSON.parse(extractJsonObject(content));
    return parsed;
  } catch (err) {
    if (attempt === 0) {
      console.warn(`  retrying batch of ${words.length} words for ${targetLocale} (parse failure)`);
      return fillWordBatch(words, targetLocale, contentLanguageName, 1);
    }
    throw err;
  }
}

/** fields: {en,fr,es,...} strings; translates one text field per key into targetLocale */
async function fillTextBatch(items, targetLocale, contentLanguageName, attempt = 0) {
  // items: [{key, text}] where key is e.g. "localizedTitles", "premise:sent0" etc; text is the English source text.
  const langName = LOCALE_LANGUAGE_NAME[targetLocale];
  const list = items.map((it) => `- "${it.key}": "${it.text}"`).join('\n');
  const system =
    `You are a translator localizing a language-learning app's book metadata into ${langName}` +
    (targetLocale === 'zh-Hant' ? ' (Traditional Chinese characters only, never Simplified).' : '.') +
    ` The source text is in ${contentLanguageName === 'English' ? 'English' : 'English'}. ` +
    `Translate each labeled text into ${langName}, preserving meaning and tone for language learners. ` +
    `Reply with ONLY a JSON object mapping each key EXACTLY as given to its translated string. No prose, no markdown fences.`;
  const content = await chatComplete(system, `Texts:\n${list}`);
  try {
    return JSON.parse(extractJsonObject(content));
  } catch (err) {
    if (attempt === 0) {
      console.warn(`  retrying text batch (${items.length} items) for ${targetLocale}`);
      return fillTextBatch(items, targetLocale, contentLanguageName, 1);
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

async function fillBundleLocale(bundle, sourceFilePath, targetLocale, dryRun) {
  const contentLanguageName = CONTENT_LANGUAGE_NAME[bundle.contentLocale] ?? bundle.contentLocale;
  let filled = 0;
  let total = 0;

  // 1. glossary
  const missingGlossary = Object.entries(bundle.glossary).filter(
    ([, entry]) => !(targetLocale in entry),
  );
  total += Object.keys(bundle.glossary).length;
  if (missingGlossary.length > 0) {
    const words = missingGlossary.map(([word]) => ({
      word,
      contextSentence: firstContextSentence(bundle, word),
    }));
    for (const batch of chunk(words, BATCH_SIZE)) {
      if (dryRun) {
        filled += batch.length;
        continue;
      }
      const result = await fillWordBatch(batch, targetLocale, contentLanguageName);
      for (const w of batch) {
        const translation = result[w.word];
        if (typeof translation === 'string' && translation.length > 0) {
          bundle.glossary[w.word][targetLocale] = translation;
          filled += 1;
        } else {
          console.warn(`  MISSING after fill: glossary["${w.word}"].${targetLocale} in ${bundle.bookId}`);
        }
      }
    }
  }

  // 2. vocabulary[].gloss
  const missingVocab = bundle.vocabulary.filter((v) => !(targetLocale in v.gloss));
  if (missingVocab.length > 0 && !dryRun) {
    const words = missingVocab.map((v) => ({
      word: v.word,
      contextSentence: firstContextSentence(bundle, v.word),
    }));
    for (const batch of chunk(words, BATCH_SIZE)) {
      const result = await fillWordBatch(batch, targetLocale, contentLanguageName);
      for (const v of missingVocab) {
        const translation = result[v.word];
        if (typeof translation === 'string' && translation.length > 0) {
          v.gloss[targetLocale] = translation;
        }
      }
    }
  }

  // 3. localizedTitles / premise / summary
  if (!dryRun) {
    const textItems = [];
    if (!(targetLocale in bundle.localizedTitles) && bundle.localizedTitles.en) {
      textItems.push({ key: 'localizedTitles', text: bundle.localizedTitles.en });
    }
    if (!(targetLocale in bundle.premise) && bundle.premise.en) {
      textItems.push({ key: 'premise', text: bundle.premise.en });
    }
    if (!(targetLocale in bundle.summary) && bundle.summary.en) {
      textItems.push({ key: 'summary', text: bundle.summary.en });
    }
    if (textItems.length > 0) {
      const result = await fillTextBatch(textItems, targetLocale, contentLanguageName);
      if (typeof result.localizedTitles === 'string') bundle.localizedTitles[targetLocale] = result.localizedTitles;
      if (typeof result.premise === 'string') bundle.premise[targetLocale] = result.premise;
      if (typeof result.summary === 'string') bundle.summary[targetLocale] = result.summary;
    }
  }

  return { filled, total };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.bundle.json'));
  const targetFiles = args.books
    ? files.filter((f) => args.books.some((b) => f.startsWith(b)))
    : files;

  const coverage = {};

  for (const locale of args.locales) {
    console.log(`\n=== locale: ${locale} ===`);
    for (const file of targetFiles) {
      const filePath = path.join(SOURCE_DIR, file);
      const bundle = JSON.parse(readFileSync(filePath, 'utf8'));
      const bookId = bundle.bookId;
      process.stdout.write(`  ${bookId} ... `);
      const { filled, total } = await fillBundleLocale(bundle, filePath, locale, args.dryRun);
      if (!args.dryRun && filled > 0) {
        writeFileSync(filePath, JSON.stringify(bundle, null, 1) + '\n', 'utf8');
      }
      const alreadyHad = total - filled - Object.entries(bundle.glossary).filter(([, e]) => !(locale in e)).length;
      const nowFilled = Object.entries(bundle.glossary).filter(([, e]) => locale in e).length;
      console.log(`${nowFilled}/${total} glossary words have ${locale}`);
      coverage[bookId] = coverage[bookId] || {};
      coverage[bookId][locale] = { filled: nowFilled, total };
    }
  }

  console.log('\n=== coverage summary ===');
  console.log(JSON.stringify(coverage, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
