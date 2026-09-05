#!/usr/bin/env node
/**
 * Lane D3 standalone level-sanity report — for every built book (18 base
 * books + the zh-TW Traditional edition), computes deterministic text
 * stats (sentence count, mean/max sentence length in words, type/token
 * ratio, distinct word count) from the built pack's tokens, then makes one
 * DeepSeek call per book asking for a CEFR estimate (A0/A1/A2/B1) with
 * three reasons citing tense inventory and vocabulary, given the full text
 * and the claimed level.
 *
 * Read-only against packs/ and source/ — writes nothing back into content.
 * Prints a markdown table + notes to stdout; the caller pastes it into
 * docs/content-qa.md (the only file D3 is allowed to touch).
 *
 * Usage: node scripts/level-sanity.mjs > /tmp/level-sanity.md
 */
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = path.join(__dirname, '..', 'packs');

const DEEPSEEK_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const CONCURRENCY = 6;

const usage = { promptTokens: 0, completionTokens: 0, calls: 0 };

let deepseekKey = null;
function getDeepseekKey() {
  if (deepseekKey) return deepseekKey;
  const keyPath = path.join(homedir(), '.config', 'deepseek', 'api_key');
  deepseekKey = readFileSync(keyPath, 'utf8').trim();
  return deepseekKey;
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('LLM response did not contain a JSON object');
  }
  return text.slice(start, end + 1);
}

async function deepseekChat(system, user, attempt = 0) {
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
  const content = body.choices?.[0]?.message?.content ?? '';
  try {
    return JSON.parse(extractJsonObject(content));
  } catch (err) {
    if (attempt === 0) return deepseekChat(system, user, 1);
    throw err;
  }
}

const CONTENT_LANGUAGE_NAME = {
  'fr-FR': 'French',
  'es-419': 'Spanish',
  'en-US': 'English',
  'pt-BR': 'Portuguese',
  'it-IT': 'Italian',
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  'ro-RO': 'Romanian',
  'ca-ES': 'Catalan',
};

/** Discover every built book across all locale packs (includes the zh-TW edition). */
function discoverBooks() {
  const books = [];
  for (const localeDir of readdirSync(PACKS_DIR)) {
    const booksDir = path.join(PACKS_DIR, localeDir, 'books');
    let bookIds;
    try {
      bookIds = readdirSync(booksDir);
    } catch {
      continue;
    }
    for (const bookId of bookIds) {
      const bookJsonPath = path.join(booksDir, bookId, 'book.json');
      try {
        const book = JSON.parse(readFileSync(bookJsonPath, 'utf8'));
        books.push({ localeDir, bookId, bookDir: path.join(booksDir, bookId), book });
      } catch {
        // not a book dir
      }
    }
  }
  return books;
}

function loadChapters(bookDir, book) {
  return book.chapters.map((summary) => {
    const chapterPath = path.join(bookDir, summary.file);
    return JSON.parse(readFileSync(chapterPath, 'utf8'));
  });
}

/** Deterministic stats from the built pack's own tokenization (isWord tokens). */
function computeStats(chapters) {
  const sentenceLengths = [];
  const wordCounts = new Map(); // normalized word -> count
  const textParts = [];
  for (const chapter of chapters) {
    for (const block of chapter.blocks) {
      for (const sentence of block.sentences) {
        textParts.push(sentence.text);
        const words = sentence.tokens.filter((t) => t.isWord);
        sentenceLengths.push(words.length);
        for (const w of words) {
          const key = (w.normalized ?? w.text).toLowerCase();
          wordCounts.set(key, (wordCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  const sentenceCount = sentenceLengths.length;
  const totalWords = sentenceLengths.reduce((a, b) => a + b, 0);
  const meanSentenceLength = sentenceCount > 0 ? totalWords / sentenceCount : 0;
  const maxSentenceLength = sentenceLengths.length > 0 ? Math.max(...sentenceLengths) : 0;
  const distinctWordCount = wordCounts.size;
  const typeTokenRatio = totalWords > 0 ? distinctWordCount / totalWords : 0;
  return {
    sentenceCount,
    meanSentenceLength,
    maxSentenceLength,
    typeTokenRatio,
    distinctWordCount,
    fullText: textParts.join(' '),
  };
}

async function estimateCefr(bookId, title, languageName, claimedLevel, fullText) {
  const system = [
    `You are a CEFR-level assessor for graded readers aimed at learners of ${languageName}.`,
    "Given the full text of a short story and the level its author claims, estimate the text's actual CEFR level as one of A0, A1, A2, B1 (A0 means pre-A1, extremely minimal).",
    'Base your estimate on tense inventory (which verb tenses/moods appear) and vocabulary (frequency band, abstractness, idioms).',
    'Reply with ONLY a JSON object: {"estimatedLevel": "A0"|"A1"|"A2"|"B1", "reasons": [three short strings, each citing a specific tense or vocabulary observation from the text]}. No prose, no markdown fences.',
  ].join(' ');
  const user = `Title: ${title}\nClaimed level: ${claimedLevel}\n\nFull text:\n${fullText}`;
  return deepseekChat(system, user);
}

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

function verdict(claimed, estimated) {
  const order = ['A0', 'A1', 'A2', 'B1', 'B2'];
  const ci = order.indexOf(claimed);
  const ei = order.indexOf(estimated);
  if (ci === -1 || ei === -1) return 'unknown';
  if (ci === ei) return 'matches';
  if (ei === ci + 1) return 'one above';
  if (ei === ci - 1) return 'one below';
  return ei > ci ? `${ei - ci} above` : `${ci - ei} below`;
}

async function main() {
  getDeepseekKey(); // fail fast
  const books = discoverBooks().sort((a, b) => a.bookId.localeCompare(b.bookId));

  const rows = await pool(books, CONCURRENCY, async ({ localeDir, bookId, bookDir, book }) => {
    const chapters = loadChapters(bookDir, book);
    const stats = computeStats(chapters);
    const languageName = CONTENT_LANGUAGE_NAME[book.contentLocale] ?? book.contentLocale;
    let cefr;
    try {
      cefr = await estimateCefr(bookId, book.title, languageName, book.level, stats.fullText);
    } catch (err) {
      cefr = { estimatedLevel: 'ERROR', reasons: [String(err.message ?? err)] };
    }
    return {
      bookId,
      localeDir,
      claimedLevel: book.level,
      estimatedLevel: cefr.estimatedLevel,
      reasons: cefr.reasons ?? [],
      verdict: verdict(book.level, cefr.estimatedLevel),
      ...stats,
    };
  });

  console.log(
    '| book | claimed | estimated | verdict | sentences | mean len | max len | TTR | distinct words |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    console.log(
      `| ${r.bookId}${r.localeDir === 'zh-TW' ? ' (zh-TW edition)' : ''} | ${r.claimedLevel} | ${r.estimatedLevel} | ${r.verdict} | ${r.sentenceCount} | ${r.meanSentenceLength.toFixed(1)} | ${r.maxSentenceLength} | ${(r.typeTokenRatio * 100).toFixed(1)}% | ${r.distinctWordCount} |`,
    );
  }
  console.log('\n### Reasons and reviewer notes\n');
  for (const r of rows) {
    console.log(
      `**${r.bookId}${r.localeDir === 'zh-TW' ? ' (zh-TW edition)' : ''}** (${r.verdict}):`,
    );
    for (const reason of r.reasons) console.log(`- ${reason}`);
    if (r.verdict !== 'matches') {
      console.log(
        `  - *For the human reviewer*: claimed ${r.claimedLevel}, model estimate ${r.estimatedLevel} (${r.verdict}) — worth a manual read-through before promoting this book past draft.`,
      );
    }
    console.log('');
  }

  console.error(
    `\nDeepSeek token usage (level-sanity): calls=${usage.calls} prompt=${usage.promptTokens} completion=${usage.completionTokens}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
