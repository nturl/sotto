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
import { CLIENT_I18N_DIR, PACKS_DIR, SOURCE_DIR, TEST_FIXTURES_DIR } from './paths.ts';
import { GLOSS_LOCALES } from './gloss-fill.ts';

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  scope: string;
  rule: string;
  message: string;
  /** Defaults to 'error'. A 'warning' is reported but doesn't fail the run. */
  severity?: IssueSeverity;
}

function issue(
  scope: string,
  rule: string,
  message: string,
  severity: IssueSeverity = 'error',
): ValidationIssue {
  return { scope, rule, message, severity };
}

/** The threshold below which a chapter's alignment match rate warns (not errors). */
const ALIGNMENT_WARN_THRESHOLD = 0.8;

function readJson<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/**
 * F2.3: a book's own content language is also one of the 9 gloss/explanation
 * locales (GLOSS_LOCALES) — a Spanish book's "es" gloss is shown to a Spanish
 * learner and should just be the word itself. That invariant is enforced by
 * code (a no-LLM identity map, docs/content-qa.md) for pt-BR/it-IT/ro-RO/
 * ca-ES/zh-CN, and holds there with 0 exceptions (✓ verified: 442/442,
 * 1021/1021, 307/307, 424/424 tokens) — but fr-FR/es-419/en-US/zh-TW own-
 * language glosses are genuine LLM output and legitimately sometimes clarify
 * rather than repeat the word (contractions "l'" -> "la / le", function-word
 * distinctions "e" -> "y", synonyms "moraleja" -> "enseñanza"; ✓ verified
 * against the built packs, dozens of pre-existing, unrelated instances).
 * A blanket identity-or-error rule would flag all of those as errors and
 * break `content:validate` for every book in the corpus, not just the one
 * this task fixed.
 *
 * So this reports an ERROR only when the mismatch is corroborated by the
 * same signature as the actual `es-licenciado-vidriera` bug (`niño`/`a`
 * carrying their French gloss verbatim into the `es` field): the own-locale
 * gloss is byte-identical to a *different* locale's gloss for the same
 * token — unambiguous copy/paste, not a plausible paraphrase. An
 * uncorroborated non-identity own-locale gloss is still surfaced, but only
 * as a warning, since it may be exactly this kind of legitimate LLM
 * clarification.
 */
function glossIdentityIssue(
  scopePrefix: string,
  token: Token,
  ownGlossLocale: string | undefined,
): ValidationIssue | undefined {
  if (!ownGlossLocale || !token.glosses) return undefined;
  const ownGloss = token.glosses[ownGlossLocale];
  // Case-insensitive: `token.normalized` is always lowercased (tokenize.ts),
  // but a proper noun's identity gloss legitimately keeps its original case
  // ("Tomás" glossing normalized "tomás").
  // Elided forms ("l'", "c'", "s'", "d'", "t'", "n'", ...) are legitimately
  // glossed as their expansion ("le/la", "ce", "se", "de", "te", "ne"), and
  // that expansion is a real, short function word that can coincide byte-
  // for-byte with a cognate in another Latin gloss locale (fr "se" / es
  // "se") — a coincidence, not a leak. Skip identity checking for them.
  if (/['’]$/.test(token.normalized)) return undefined;
  if (ownGloss === undefined || ownGloss.toLowerCase() === token.normalized) return undefined;
  const leakedFromLocale = GLOSS_LOCALES.find(
    (locale) => locale !== ownGlossLocale && token.glosses?.[locale] === ownGloss,
  );
  const message = leakedFromLocale
    ? `word token "${token.id}" ("${token.text}") has a non-identity "${ownGlossLocale}" gloss ` +
      `("${ownGloss}") byte-identical to its "${leakedFromLocale}" gloss — the book's content ` +
      `language is "${ownGlossLocale}", so this looks like a copy/paste leak, not a real gloss ` +
      `(should be the token's own form, "${token.normalized}")`
    : `word token "${token.id}" ("${token.text}") has a non-identity "${ownGlossLocale}" gloss ` +
      `("${ownGloss}") — the book's content language is "${ownGlossLocale}", so this is normally ` +
      `the token's own form ("${token.normalized}"); flagging in case this is unintentional`;
  return issue(scopePrefix, 'gloss-not-identity', message, leakedFromLocale ? 'error' : 'warning');
}

/**
 * F2.3 heuristic: a gloss copy/paste across locales (the same bug in a more
 * general form — any two gloss locales carrying the exact same string while
 * the surface word differs from both) is suspicious even when neither locale
 * is the book's own. This over-fires on genuine cognates (`animal`, `jaguar`,
 * Catalan `ball`, ...), so it's a warning, never an error.
 */
function glossCrossLocaleLeakIssues(scopePrefix: string, token: Token): ValidationIssue[] {
  if (!token.glosses) return [];
  const issues: ValidationIssue[] = [];
  const locales = GLOSS_LOCALES;
  for (let i = 0; i < locales.length; i++) {
    for (let j = i + 1; j < locales.length; j++) {
      const localeA = locales[i];
      const localeB = locales[j];
      if (!localeA || !localeB) continue;
      const glossA = token.glosses[localeA];
      const glossB = token.glosses[localeB];
      if (
        glossA !== undefined &&
        glossB !== undefined &&
        glossA === glossB &&
        glossA !== token.normalized
      ) {
        issues.push(
          issue(
            scopePrefix,
            'gloss-cross-locale-leak',
            `word token "${token.id}" ("${token.text}") has identical "${localeA}" and "${localeB}" ` +
              `glosses ("${glossA}") that both differ from the token's own form ("${token.normalized}") — ` +
              'possible copy/paste from one locale into the other',
            'warning',
          ),
        );
      }
    }
  }
  return issues;
}

function validateChapter(
  scopePrefix: string,
  chapter: Chapter,
  needsPinyin: boolean,
  ownGlossLocale: string | undefined,
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
      for (const locale of GLOSS_LOCALES) {
        if (!sentence.translations[locale]) {
          issues.push(
            issue(
              scopePrefix,
              'missing-sentence-translation',
              `sentence "${sentence.id}" has no translation for "${locale}"`,
            ),
          );
        }
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
        } else if (token.isWord && token.glosses) {
          const identityIssue = glossIdentityIssue(scopePrefix, token, ownGlossLocale);
          if (identityIssue) issues.push(identityIssue);
          issues.push(...glossCrossLocaleLeakIssues(scopePrefix, token));
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

/**
 * ADVERSARIAL-REVIEW.md §2 "content/licensing": the zh-TW edition is built
 * by exact-token/greedy replacement against the zh-CN source bundle's
 * `hantOverrides` map (build.ts's `convertGreedy`/`convertChaptersToHant`);
 * anything not in that map (or added to the source afterward and never
 * re-run through the build) ships unconverted, and nothing previously
 * caught that. Re-derives the same map the build used and flags any
 * remaining simplified single character in a zh-TW book's title or token
 * text — a signal the pack is stale relative to its source, not that the
 * map itself is complete (a still-real gap this doesn't close).
 */
function zhTwUnconvertedSimplifiedChars(localeDir: string, bookId: string): Set<string> {
  if (path.basename(localeDir) !== 'zh-TW') return new Set();
  const baseBookId = bookId.replace(/-hant$/, '');
  const bundle = readJson<{ hantOverrides?: Record<string, string> }>(
    path.join(SOURCE_DIR, `${baseBookId}.bundle.json`),
  );
  const overrides = bundle?.hantOverrides;
  if (!overrides) return new Set();
  return new Set(Object.keys(overrides).filter((key) => key.length === 1));
}

function findSimplifiedChars(text: string, simplifiedChars: Set<string>): string[] {
  const found = new Set<string>();
  for (const ch of text) {
    if (simplifiedChars.has(ch)) found.add(ch);
  }
  return [...found];
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

  const simplifiedChars = zhTwUnconvertedSimplifiedChars(localeDir, bookId);
  if (simplifiedChars.size > 0) {
    const titleHits = findSimplifiedChars(book.title, simplifiedChars);
    if (titleHits.length > 0) {
      issues.push(
        issue(
          scope,
          'zh-tw-unconverted-simplified',
          `book.json title "${book.title}" still contains unconverted simplified character(s): ${titleHits.join(', ')}`,
        ),
      );
    }
  }

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
    if (chapterSummary.alignment && chapterSummary.alignment.total > 0) {
      const rate = chapterSummary.alignment.matched / chapterSummary.alignment.total;
      if (rate < ALIGNMENT_WARN_THRESHOLD) {
        issues.push(
          issue(
            scope,
            'low-alignment-match-rate',
            `${chapterSummary.file} matched ${chapterSummary.alignment.matched}/${chapterSummary.alignment.total} (${(rate * 100).toFixed(1)}%) of tokens — below the ${ALIGNMENT_WARN_THRESHOLD * 100}% warning threshold`,
            'warning',
          ),
        );
      }
    }
    const chapter = readJson<Chapter>(chapterPath);
    if (!chapter) {
      issues.push(issue(scope, 'missing-asset', `${chapterSummary.file} is not valid JSON`));
      continue;
    }
    issues.push(
      ...validateChapter(
        `${scope}/${chapterSummary.file}`,
        chapter,
        needsPinyin,
        language?.catalog,
      ),
    );

    if (chapter.bookId !== book.bookId) {
      issues.push(
        issue(
          scope,
          'chapter-bookid-mismatch',
          `${chapterSummary.file} bookId "${chapter.bookId}" does not match book.json bookId "${book.bookId}"`,
        ),
      );
    }

    if (simplifiedChars.size > 0) {
      const chapterScope = `${scope}/${chapterSummary.file}`;
      chapter.blocks.forEach((block) => {
        block.sentences.forEach((sentence) => {
          sentence.tokens.forEach((token) => {
            const hits = findSimplifiedChars(token.text, simplifiedChars);
            if (hits.length > 0) {
              issues.push(
                issue(
                  chapterScope,
                  'zh-tw-unconverted-simplified',
                  `token "${token.id}" ("${token.text}") still contains unconverted simplified character(s): ${hits.join(', ')}`,
                ),
              );
            }
          });
        });
      });
    }
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

/** Checks every `<dir>/*.json` catalog (except en.json) for key parity
 * against `<dir>/en.json`, reporting each missing key as an
 * `incomplete-catalog` error scoped as `<scopePrefix>/<file>`. Used for
 * `apps/client/src/i18n/` (client UI catalogs, CONTRACTS §1/§6). */
function validateMessageDir(dir: string, scopePrefix: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const enPath = path.join(dir, 'en.json');
  if (!existsSync(enPath)) return issues; // nothing to compare against yet

  const en = readJson<Record<string, unknown>>(enPath);
  if (!en) return issues;
  const enKeys = new Set(flattenMessageKeys(en));

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'en.json') continue;
    const catalog = readJson<Record<string, unknown>>(path.join(dir, file));
    if (!catalog) {
      issues.push(issue(`${scopePrefix}/${file}`, 'missing-asset', `${file} is not valid JSON`));
      continue;
    }
    const catalogKeys = new Set(flattenMessageKeys(catalog));
    const missing = [...enKeys].filter((k) => !catalogKeys.has(k));
    for (const key of missing) {
      issues.push(
        issue(
          `${scopePrefix}/${file}`,
          'incomplete-catalog',
          `missing key "${key}" (present in en.json)`,
        ),
      );
    }
  }
  return issues;
}

export function validateMessageCatalogs(): ValidationIssue[] {
  if (!existsSync(CLIENT_I18N_DIR)) return [];
  return validateMessageDir(CLIENT_I18N_DIR, 'client/i18n');
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
      console.log(`    [${iss.severity ?? 'error'}] [${iss.rule}] ${iss.message}`);
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
  const errors = issues.filter((i) => (i.severity ?? 'error') === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  console.log(
    `\n${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'} across ${PACKS_DIR}`,
  );
  if (errors.length > 0) process.exitCode = 1;
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
    const goodErrors = goodIssues.filter((i) => (i.severity ?? 'error') === 'error');
    const good = goodErrors.length === 0;
    console.log(
      `\n  ${good ? 'PASS' : 'FAIL'}  real packs/ (${goodErrors.length} error${goodErrors.length === 1 ? '' : 's'}, ${goodIssues.length - goodErrors.length} warning${goodIssues.length - goodErrors.length === 1 ? '' : 's'})`,
    );
    for (const iss of goodIssues)
      console.log(
        `        [${iss.severity ?? 'error'}] [${iss.scope}] [${iss.rule}] ${iss.message}`,
      );
    if (!good) ok = false;
  } else {
    console.log('\n  SKIP  real packs/ (not built yet — run `pnpm content:build` first)');
  }

  console.log(`\n${ok ? 'all fixture expectations met' : 'fixture expectations NOT met'}`);
  if (!ok) process.exitCode = 1;
}
