/**
 * `sotto-content validate` (planning/CONTRACTS.md §2b validator rules) and
 * its `--fixtures` self-test mode.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  contentLocales,
  getLanguage,
  type Book,
  type Chapter,
  type Pack,
  type Token,
} from '@sotto/core';
import { MESSAGES_DIR, PACKS_DIR, TEST_FIXTURES_DIR } from './paths.ts';

export interface ValidationIssue {
  scope: string;
  rule: string;
  message: string;
}

function issue(scope: string, rule: string, message: string): ValidationIssue {
  return { scope, rule, message };
}

function readJson<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function validateChapter(
  scopePrefix: string,
  chapter: Chapter,
  needsPinyin: boolean,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();
  const noteId = (id: string, where: string): void => {
    if (seenIds.has(id)) {
      issues.push(issue(scopePrefix, 'duplicate-ids', `duplicate id "${id}" (${where})`));
    }
    seenIds.add(id);
  };

  chapter.blocks.forEach((block, blockIndex) => {
    const expectedBlockId = `b${blockIndex + 1}`;
    noteId(block.id, 'block');
    if (block.id !== expectedBlockId) {
      issues.push(
        issue(
          scopePrefix,
          'token-sentence-mismatch',
          `block id "${block.id}" should be "${expectedBlockId}"`,
        ),
      );
    }
    block.sentences.forEach((sentence, sentenceIndex) => {
      const expectedSentenceId = `${block.id}.s${sentenceIndex + 1}`;
      noteId(sentence.id, 'sentence');
      if (sentence.id !== expectedSentenceId) {
        issues.push(
          issue(
            scopePrefix,
            'token-sentence-mismatch',
            `sentence id "${sentence.id}" should be "${expectedSentenceId}"`,
          ),
        );
      }
      sentence.tokens.forEach((token: Token, tokenIndex) => {
        const expectedTokenId = `${sentence.id}.t${tokenIndex + 1}`;
        noteId(token.id, 'token');
        if (token.id !== expectedTokenId) {
          issues.push(
            issue(
              scopePrefix,
              'token-sentence-mismatch',
              `token id "${token.id}" should be "${expectedTokenId}"`,
            ),
          );
        }
        if (token.isWord && !token.glosses) {
          issues.push(
            issue(
              scopePrefix,
              'missing-gloss',
              `word token "${token.id}" ("${token.text}") has no glosses`,
            ),
          );
        }
        if (needsPinyin && token.isWord && !token.pinyin) {
          issues.push(
            issue(
              scopePrefix,
              'zh-missing-pinyin',
              `word token "${token.id}" ("${token.text}") has no pinyin`,
            ),
          );
        }
      });
    });
  });

  return issues;
}

function validateBook(localeDir: string, bookId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const dir = path.join(localeDir, 'books', bookId);
  const scope = `${path.basename(localeDir)}/${bookId}`;

  const bookJsonPath = path.join(dir, 'book.json');
  if (!existsSync(bookJsonPath)) {
    return [issue(scope, 'missing-asset', 'missing book.json')];
  }
  const book = readJson<Book>(bookJsonPath);
  if (!book) {
    return [issue(scope, 'missing-asset', 'book.json is not valid JSON')];
  }

  if (!book.license || !book.license.spdx || !book.license.attribution) {
    issues.push(issue(scope, 'missing-license', 'book.json has no license'));
  }
  if (!contentLocales().includes(book.contentLocale)) {
    issues.push(
      issue(
        scope,
        'invalid-locale',
        `book.json contentLocale "${book.contentLocale}" is not a known locale`,
      ),
    );
  }
  if (book.reviewStatus === 'stable' && !book.reviewedBy) {
    issues.push(
      issue(scope, 'stable-without-reviewer', 'reviewStatus is "stable" but reviewedBy is missing'),
    );
  }

  const attrPath = path.join(dir, 'attribution.json');
  if (!existsSync(attrPath)) {
    issues.push(issue(scope, 'missing-asset', 'missing attribution.json'));
  } else {
    const attribution = readJson<{ text?: { license?: { spdx?: string; attribution?: string } } }>(
      attrPath,
    );
    if (!attribution?.text?.license?.spdx || !attribution.text.license.attribution) {
      issues.push(issue(scope, 'missing-license', 'attribution.json has no text license'));
    }
  }

  const coverPath = path.join(dir, book.cover ?? 'cover.svg');
  if (!existsSync(coverPath)) {
    issues.push(
      issue(scope, 'missing-asset', `missing referenced asset: ${book.cover ?? 'cover.svg'}`),
    );
  }

  let language: ReturnType<typeof getLanguage> | undefined;
  try {
    language = getLanguage(book.contentLocale);
  } catch {
    language = undefined;
  }
  const needsPinyin = language?.pronunciationGuide === 'pinyin';

  for (const chapterSummary of book.chapters ?? []) {
    const chapterPath = path.join(dir, chapterSummary.file);
    if (!existsSync(chapterPath)) {
      issues.push(
        issue(scope, 'missing-asset', `missing referenced asset: ${chapterSummary.file}`),
      );
      continue;
    }
    if (chapterSummary.audio) {
      const audioPath = path.join(dir, chapterSummary.audio);
      if (!existsSync(audioPath)) {
        issues.push(
          issue(scope, 'missing-asset', `missing referenced asset: ${chapterSummary.audio}`),
        );
      }
    }
    const chapter = readJson<Chapter>(chapterPath);
    if (!chapter) {
      issues.push(issue(scope, 'missing-asset', `${chapterSummary.file} is not valid JSON`));
      continue;
    }
    issues.push(...validateChapter(`${scope}/${chapterSummary.file}`, chapter, needsPinyin));
  }

  return issues;
}

export function validatePackDir(localeDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const localeName = path.basename(localeDir);

  const packJsonPath = path.join(localeDir, 'pack.json');
  if (!existsSync(packJsonPath)) {
    return [issue(localeName, 'missing-asset', 'missing pack.json')];
  }
  const pack = readJson<Pack>(packJsonPath);
  if (!pack) {
    return [issue(localeName, 'missing-asset', 'pack.json is not valid JSON')];
  }
  if (!contentLocales().includes(pack.locale)) {
    issues.push(
      issue(
        localeName,
        'invalid-locale',
        `pack.json locale "${pack.locale}" is not a known locale`,
      ),
    );
  }

  const booksDir = path.join(localeDir, 'books');
  if (!existsSync(booksDir)) {
    return issues;
  }
  for (const bookId of readdirSync(booksDir)) {
    if (!statSync(path.join(booksDir, bookId)).isDirectory()) continue;
    issues.push(...validateBook(localeDir, bookId));
  }

  return issues;
}

function flattenMessageKeys(obj: Record<string, unknown>): string[] {
  // Messages catalogs use flat dotted keys at the top level (e.g.
  // "errors.generic"), not nested objects — see the WS-1 report.
  return Object.keys(obj);
}

export function validateMessageCatalogs(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const enPath = path.join(MESSAGES_DIR, 'en.json');
  if (!existsSync(enPath)) return issues; // nothing to compare against yet

  const en = readJson<Record<string, unknown>>(enPath);
  if (!en) return issues;
  const enKeys = new Set(flattenMessageKeys(en));

  if (!existsSync(MESSAGES_DIR)) return issues;
  for (const file of readdirSync(MESSAGES_DIR)) {
    if (!file.endsWith('.json') || file === 'en.json') continue;
    const catalog = readJson<Record<string, unknown>>(path.join(MESSAGES_DIR, file));
    if (!catalog) {
      issues.push(issue(`messages/${file}`, 'missing-asset', `${file} is not valid JSON`));
      continue;
    }
    const catalogKeys = new Set(flattenMessageKeys(catalog));
    const missing = [...enKeys].filter((k) => !catalogKeys.has(k));
    for (const key of missing) {
      issues.push(
        issue(
          `messages/${file}`,
          'incomplete-catalog',
          `missing key "${key}" (present in en.json)`,
        ),
      );
    }
  }
  return issues;
}

function printReport(title: string, issuesByScope: Map<string, ValidationIssue[]>): void {
  console.log(`\n${title}`);
  if (issuesByScope.size === 0) {
    console.log('  (no errors)');
    return;
  }
  for (const [scope, issues] of issuesByScope) {
    console.log(`  ${scope}:`);
    for (const iss of issues) {
      console.log(`    [${iss.rule}] ${iss.message}`);
    }
  }
}

function groupByScope(issues: ValidationIssue[]): Map<string, ValidationIssue[]> {
  const map = new Map<string, ValidationIssue[]>();
  for (const iss of issues) {
    const list = map.get(iss.scope) ?? [];
    list.push(iss);
    map.set(iss.scope, list);
  }
  return map;
}

export function validateAllPacks(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (existsSync(PACKS_DIR)) {
    for (const locale of readdirSync(PACKS_DIR)) {
      const dir = path.join(PACKS_DIR, locale);
      if (!statSync(dir).isDirectory()) continue;
      issues.push(...validatePackDir(dir));
    }
  }
  issues.push(...validateMessageCatalogs());
  return issues;
}

export function runValidateCommand(): void {
  if (!existsSync(PACKS_DIR) || readdirSync(PACKS_DIR).length === 0) {
    console.log('sotto-content validate: packs/ is empty, nothing to validate');
    return;
  }
  const issues = validateAllPacks();
  printReport('sotto-content validate:', groupByScope(issues));
  console.log(`\n${issues.length} error${issues.length === 1 ? '' : 's'} across ${PACKS_DIR}`);
  if (issues.length > 0) process.exitCode = 1;
}

// ---- --fixtures self-test --------------------------------------------------

export function runValidateFixturesCommand(): void {
  const invalidDir = path.join(TEST_FIXTURES_DIR, 'invalid');
  let ok = true;

  if (!existsSync(invalidDir)) {
    console.error(`sotto-content validate --fixtures: no fixtures at ${invalidDir}`);
    process.exitCode = 1;
    return;
  }

  console.log('sotto-content validate --fixtures:\n');
  for (const name of readdirSync(invalidDir).sort()) {
    const dir = path.join(invalidDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const issues = validatePackDir(dir);
    const rejected = issues.length > 0;
    console.log(
      `  ${rejected ? 'PASS' : 'FAIL'}  ${name}  (${issues.length} issue${issues.length === 1 ? '' : 's'})`,
    );
    for (const iss of issues) console.log(`        [${iss.rule}] ${iss.message}`);
    if (!rejected) ok = false;
  }

  if (existsSync(PACKS_DIR) && readdirSync(PACKS_DIR).length > 0) {
    const goodIssues = validateAllPacks();
    const good = goodIssues.length === 0;
    console.log(
      `\n  ${good ? 'PASS' : 'FAIL'}  real packs/ (${goodIssues.length} issue${goodIssues.length === 1 ? '' : 's'})`,
    );
    for (const iss of goodIssues)
      console.log(`        [${iss.scope}] [${iss.rule}] ${iss.message}`);
    if (!good) ok = false;
  } else {
    console.log('\n  SKIP  real packs/ (not built yet — run `pnpm content:build` first)');
  }

  console.log(`\n${ok ? 'all fixture expectations met' : 'fixture expectations NOT met'}`);
  if (!ok) process.exitCode = 1;
}
