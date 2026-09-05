#!/usr/bin/env node
/**
 * E2E checks for BRIEF rows 15 (SessionBar), 16 (reader completion), 24
 * (language-pair isolation) and 6 (voice mode chips). Same pattern as
 * screenshots.mjs: drives the real web app (Metro dev server,
 * EXPO_PUBLIC_VOICE=fake) with Playwright/Chromium, seeding profiles by
 * writing straight into the idb-keyval "keyval-store"/"keyval" IndexedDB
 * store `src/platform/persistence.web.ts` reads (see createStore.ts's KEYS
 * for the exact key names) rather than clicking through onboarding.
 *
 * Usage: BASE_URL=http://localhost:8086 node apps/client/e2e/rows.mjs
 * (BASE_URL must point at a dev server started with EXPO_PUBLIC_VOICE=fake;
 * `pnpm e2e:rows` wires that up.)
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../docs/screenshots/web/rows');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8086';

const FR_BOOK_ID = 'fr-petit-chaperon-rouge'; // fr-FR, 2 chapters — shortest
const ES_BOOK_ID = 'es-fabulas-samaniego'; // es-419, 3 chapters
const ES_BOOK_TITLE = 'Tres fábulas de Samaniego';

mkdirSync(OUT_DIR, { recursive: true });

const t0 = Date.now();
function log(...args) {
  console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);
}

const issues = [];
const rowResults = { 15: [], 16: [], 24: [], 6: [] };

function record(row, name, ok, detail) {
  rowResults[row].push({ name, ok, detail });
  const tag = ok ? 'PASS' : 'FAIL';
  log(`  [${tag}] row ${row}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) issues.push(`row ${row}: ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Writes idb-keyval-shaped rows directly into the "keyval-store"/"keyval"
 * IndexedDB object store persistence.web.ts uses, so a reload boots the app
 * straight past onboarding with the given preferences/progress/vocabulary/
 * session already hydrated. */
async function seed(page, { preferences, progress, savedWords, sessionRecord }) {
  await page.evaluate(
    async ({ preferences, progress, savedWords, sessionRecord }) => {
      const req = indexedDB.open('keyval-store', 1);
      await new Promise((resolve, reject) => {
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('keyval'))
            req.result.createObjectStore('keyval');
        };
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      const db = req.result;
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      if (preferences) store.put(JSON.stringify(preferences), 'sotto.preferences');
      if (progress) store.put(JSON.stringify(progress), 'sotto.progress');
      if (savedWords) store.put(JSON.stringify(savedWords), 'sotto.vocabulary');
      if (sessionRecord) store.put(JSON.stringify(sessionRecord), 'sotto.session');
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { preferences, progress, savedWords, sessionRecord },
  );
}

/** Reads one idb-keyval row back out (for asserting persisted state after
 * UI interactions, not just what we seeded). */
async function readKey(page, key) {
  return page.evaluate(async (key) => {
    const req = indexedDB.open('keyval-store', 1);
    const db = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!db.objectStoreNames.contains('keyval')) return null;
    const tx = db.transaction('keyval', 'readonly');
    const raw = await new Promise((resolve, reject) => {
      const getReq = tx.objectStore('keyval').get(key);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    });
    db.close();
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, key);
}

function basePreferences(overrides) {
  return {
    interfaceLocale: 'en',
    explanationLocale: 'en',
    learningLocale: 'fr-FR',
    level: 'A1',
    immersionMode: false,
    defaultTutorMode: 'read_to_me',
    captionsEnabled: true,
    turnDetection: 'auto',
    correctionFrequency: 'normal',
    speakingPace: 'normal',
    narrationSpeed: 1,
    onboarded: true,
    ...overrides,
  };
}

/** getByText(...).first() can pick up an invisible leftover DOM node from
 * the previous screen right after an SPA (client-side router) navigation —
 * confirmed by dumping the DOM after clicking SessionBar: a detached
 * zero-size node with stale styling sits ahead of the real, visible,
 * correctly-styled one in document order. Filter to the first genuinely
 * visible match instead of trusting `.first()` alone. */
async function firstVisible(locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = locator.nth(i);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return locator.first();
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// ---------------------------------------------------------------------
// Row 15: SessionBar — visible above the tab bar, shows title+mode,
// tapping it navigates to /voice/<bookId> with the mode preserved.
// ---------------------------------------------------------------------
async function testRow15(browser) {
  log('--- Row 15: SessionBar ---');
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await context.newPage();

  const startedAt = new Date().toISOString();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await seed(page, {
    preferences: basePreferences({ learningLocale: 'es-419' }),
    sessionRecord: {
      id: 'sess-row15',
      bookId: ES_BOOK_ID,
      chapterId: '01',
      mode: 'discuss',
      status: 'active',
      startedAt,
    },
  });
  await page.goto(`${BASE_URL}/(tabs)/home`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // SessionBar's Pressable carries an exact accessible name of
  // "<title> — <mode label>" (SessionBar.tsx) — an exact match keeps this
  // from also matching a "For you"/recommended book tile whose accessible
  // name is just the title with no mode suffix.
  const barName = `${ES_BOOK_TITLE} — Discuss`;
  const bar = page.getByRole('button', { name: barName, exact: true }).first();
  const barVisible = await bar.isVisible().catch(() => false);
  record(15, 'SessionBar visible on home', barVisible);
  if (!barVisible) {
    await page.screenshot({ path: path.join(OUT_DIR, '15-sessionbar-home.png') });
    await context.close();
    return;
  }

  const titleVisible = await page.getByText(ES_BOOK_TITLE, { exact: true }).first().isVisible();
  const modeVisible = await page.getByText('Discuss', { exact: true }).first().isVisible();
  record(15, 'shows book title text', titleVisible);
  record(15, 'shows mode label text', modeVisible);

  const barBox = await bar.boundingBox();
  // TabBar.tsx marks each tab with accessibilityRole="tab" — role:'tab' is
  // unambiguous, unlike matching the visible "For you" text (which also
  // appears as the home screen's own page heading).
  const tabBarTab = page.getByRole('tab', { name: 'For you' }).first();
  const tabBarBox = await tabBarTab.boundingBox().catch(() => null);
  if (barBox && tabBarBox) {
    const overlap = boxesOverlap(barBox, tabBarBox);
    record(
      15,
      'SessionBar does not overlap tab bar',
      !overlap,
      `sessionBar y=${barBox.y.toFixed(0)}-${(barBox.y + barBox.height).toFixed(0)}, tab y=${tabBarBox.y.toFixed(0)}-${(tabBarBox.y + tabBarBox.height).toFixed(0)}`,
    );
    record(
      15,
      'SessionBar sits above tab bar (lower y)',
      barBox.y < tabBarBox.y,
      `sessionBar.y=${barBox.y.toFixed(0)} tab.y=${tabBarBox.y.toFixed(0)}`,
    );
  } else {
    record(15, 'could compute bounding boxes for overlap check', false, 'missing box(es)');
  }

  await page.screenshot({ path: path.join(OUT_DIR, '15-sessionbar-home.png') });
  log('  screenshot: rows/15-sessionbar-home.png');

  await bar.click();
  await page.waitForURL(new RegExp(`/voice/${ES_BOOK_ID}`), { timeout: 5000 }).catch(() => {});
  const url = page.url();
  const navigatedOk = url.includes(`/voice/${ES_BOOK_ID}`);
  record(15, 'tap navigates to /voice/<bookId>', navigatedOk, url);

  if (navigatedOk) {
    // Give RN Web's post-navigation render a moment to settle before
    // reading computed style — the mode row can briefly paint with
    // pre-hydration styling right after the route transition.
    await page
      .getByText('Discuss', { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});
    let chipColor = null;
    for (let i = 0; i < 8; i += 1) {
      const discussChip = await firstVisible(page.getByText('Discuss', { exact: true }));
      chipColor = await discussChip.evaluate((el) => getComputedStyle(el).color).catch(() => null);
      if (chipColor === 'rgb(251, 246, 236)') break;
      await page.waitForTimeout(300);
    }
    // active chip label is colored 'surface' (#FBF6EC -> rgb(251, 246, 236));
    // see apps/client/app/voice/[bookId].tsx modeChipActive / MODES map.
    const chipActive = chipColor === 'rgb(251, 246, 236)';
    record(15, 'mode chip for "discuss" still active on voice screen', chipActive, chipColor);
  }

  await page.screenshot({ path: path.join(OUT_DIR, '15-sessionbar-tapped.png') });
  log('  screenshot: rows/15-sessionbar-tapped.png');

  await context.close();
}

// ---------------------------------------------------------------------
// Row 16: reader completion — scrolling the last block of the last
// chapter into view (the actual trigger read from app/reader/[bookId].tsx)
// should fire markCompleted()/setProgress(completedAt) and render
// CompletionView.
// ---------------------------------------------------------------------
async function testRow16(browser) {
  log('--- Row 16: reader completion ---');
  const context = await browser.newContext({ viewport: { width: 430, height: 852 } });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await seed(page, { preferences: basePreferences({ learningLocale: 'fr-FR' }) });
  await page.goto(`${BASE_URL}/reader/${FR_BOOK_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Advance to the last chapter (book has 2 chapters) via the "Next
  // chapter" transport button (only rendered once narration audio loads).
  const nextChapterBtn = page.getByRole('button', { name: 'Next chapter' }).first();
  const hasNextChapterBtn = await nextChapterBtn.isVisible().catch(() => false);
  record(16, 'transport bar with "Next chapter" control is visible', hasNextChapterBtn);
  if (hasNextChapterBtn) {
    await nextChapterBtn.click();
    await page.waitForTimeout(800);
  }

  // Scroll the reader's ScrollView (the RN-Web div whose scrollHeight
  // exceeds its clientHeight) to the very bottom — the real DOM 'scroll'
  // event this fires is what app/reader/[bookId].tsx's onScroll listens
  // to, so this legitimately satisfies
  // `contentOffset.y + layoutMeasurement.height >= lastBlockBottomRef.current - 4`
  // rather than calling any internal function directly. On a short-enough
  // chapter the passage may already fit entirely inside the viewport (no
  // scrollable overflow at all) — in that case the last block is already
  // "seen" the moment it renders, and no scroll is needed.
  async function scrollReaderToBottom() {
    return page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('div')).filter(
        (el) => el.scrollHeight - el.clientHeight > 40,
      );
      if (candidates.length === 0) return false;
      const target = candidates.sort(
        (a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
      )[0];
      target.scrollTop = target.scrollHeight;
      return true;
    });
  }

  let scrolled = false;
  for (let i = 0; i < 6; i += 1) {
    scrolled = await scrollReaderToBottom();
    await page.waitForTimeout(400);
  }

  const completionHeading = page.getByText('Choose your next book', { exact: true }).first();
  let completionVisible = false;
  try {
    await completionHeading.waitFor({ state: 'visible', timeout: 6000 });
    completionVisible = true;
  } catch {
    completionVisible = false;
  }

  record(
    16,
    'last block scrolled into view, or already fit on screen without overflow',
    scrolled || completionVisible,
    scrolled
      ? 'found a scrollable container'
      : 'no scrollable container found (content fit at this viewport)',
  );
  record(16, 'CompletionView appears ("Choose your next book")', completionVisible);

  await page.screenshot({ path: path.join(OUT_DIR, '16-completion.png') });
  log('  screenshot: rows/16-completion.png');

  const progress = await readKey(page, 'sotto.progress');
  const bookProgress = progress?.progress?.find((p) => p.bookId === FR_BOOK_ID);
  const completedAtSet = !!bookProgress?.completedAt;
  record(
    16,
    'sotto.progress record has non-null completedAt',
    completedAtSet,
    JSON.stringify(bookProgress),
  );

  if (!completionVisible || !completedAtSet) {
    issues.push(
      'row 16 SUSPECTED APP BUG candidate: scrolling the last block into view did not trigger ' +
        'completion. See app/reader/[bookId].tsx onScroll (~line 265) / persistProgress ' +
        '(~line 206) / the last-block onLayout (~line 619) — verify lastBlockBottomRef is being ' +
        'set for the rendered chapter and that the scrolled container is the one carrying onScroll.',
    );
  }

  await context.close();
}

// ---------------------------------------------------------------------
// Row 24: language-pair isolation — home/library should only ever show
// books from the current learningLocale pack; vocabulary is checked for
// the same isolation (and for not losing data when switching back).
// ---------------------------------------------------------------------
async function testRow24(browser) {
  log('--- Row 24: language-pair isolation ---');
  const context = await browser.newContext({ viewport: { width: 430, height: 852 } });
  const page = await context.newPage();

  const frProgress = {
    bookId: FR_BOOK_ID,
    chapterId: '01',
    audioPositionMs: 0,
    percentComplete: 0.4,
    updatedAt: new Date().toISOString(),
  };
  const frWord = {
    id: 'word-fr-1',
    bookId: FR_BOOK_ID,
    chapterId: '01',
    tokenId: 'tok-fr-1',
    sentenceId: 'sent-fr-1',
    sourceLocale: 'fr-FR',
    explanationLocale: 'en',
    sourceWord: 'chaperon',
    normalizedWord: 'chaperon',
    translation: 'hood',
    contextSentence: 'Le Petit Chaperon rouge.',
    savedAt: new Date().toISOString(),
    review: { ease: 2.5, intervalDays: 1, dueAt: new Date().toISOString(), reps: 0, lapses: 0 },
  };

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await seed(page, {
    preferences: basePreferences({ learningLocale: 'fr-FR' }),
    progress: { progress: [frProgress], completedBooks: [] },
    savedWords: [frWord],
  });
  await page.goto(`${BASE_URL}/(tabs)/home`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const frBookVisibleHome = await page
    .getByText('Le Petit Chaperon rouge', { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  const esBookHiddenHome = (await page.getByText(ES_BOOK_TITLE).count()) === 0;
  record(24, 'fr-FR home shows the seeded fr book', frBookVisibleHome);
  record(24, 'fr-FR home does not show the es-419 book', esBookHiddenHome);
  await page.screenshot({ path: path.join(OUT_DIR, '24-fr.png') });
  log('  screenshot: rows/24-fr.png');

  await page.goto(`${BASE_URL}/(tabs)/vocabulary`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const frWordVisible = await page
    .getByText('chaperon', { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  record(24, 'vocabulary shows the fr word', frWordVisible);

  // Switch learning language to es-419.
  await page.goto(`${BASE_URL}/settings/learning-language`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const esOption = page.getByText('Español (Latinoamérica)', { exact: false }).first();
  const esOptionFound = await esOption.isVisible().catch(() => false);
  record(24, 'es-419 option present in learning-language settings', esOptionFound);
  if (esOptionFound) {
    await esOption.click();
    await page.waitForTimeout(500);
  }

  await page.goto(`${BASE_URL}/(tabs)/home`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const esBookVisibleHome = await page
    .getByText(ES_BOOK_TITLE, { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  const frBookHiddenHomeAfterSwitch =
    (await page.getByText('Le Petit Chaperon rouge').count()) === 0;
  record(24, 'es-419 home shows the es-419 book after switching', esBookVisibleHome);
  record(24, 'es-419 home hides the fr book after switching', frBookHiddenHomeAfterSwitch);
  await page.screenshot({ path: path.join(OUT_DIR, '24-es.png') });
  log('  screenshot: rows/24-es.png');

  await page.goto(`${BASE_URL}/(tabs)/vocabulary`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const frWordHiddenAfterSwitch =
    (await page.getByText('chaperon', { exact: false }).count()) === 0;
  record(24, 'vocabulary hides the fr word once on the es-419 pair', frWordHiddenAfterSwitch);
  if (!frWordHiddenAfterSwitch) {
    issues.push(
      'row 24 SUSPECTED APP BUG: apps/client/app/(tabs)/vocabulary.tsx line 128 ' +
        '(`selectBooksWithVocabulary(savedWords)`) and apps/client/src/ui/data.ts around line 193 ' +
        "(`byId` resolves against `allSummaries`, every pack, not the current pack's " +
        '`summaries`) never filter by `preferences.learningLocale` — the vocabulary tab shows ' +
        'saved words from every language pair regardless of which one is currently selected, ' +
        'unlike home/library (data.ts ~line 153, `selectPackForLocale`). Repro: seed a saved ' +
        'word for a fr-FR book while learningLocale is fr-FR, switch learningLocale to es-419 ' +
        'via /settings/learning-language, open /(tabs)/vocabulary — the fr-FR word is still shown.',
    );
  }

  // Switch back to fr-FR and confirm no data loss.
  await page.goto(`${BASE_URL}/settings/learning-language`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const frOption = page.getByText('Français', { exact: true }).first();
  const frOptionFound = await frOption.isVisible().catch(() => false);
  if (frOptionFound) {
    await frOption.click();
    await page.waitForTimeout(500);
  }

  const progressAfter = await readKey(page, 'sotto.progress');
  const vocabAfter = await readKey(page, 'sotto.vocabulary');
  const frProgressIntact = progressAfter?.progress?.some(
    (p) => p.bookId === FR_BOOK_ID && p.percentComplete === frProgress.percentComplete,
  );
  const frWordIntact = vocabAfter?.some((w) => w.id === frWord.id && w.sourceWord === 'chaperon');
  record(24, 'fr progress record unchanged after switching away and back', !!frProgressIntact);
  record(24, 'fr saved word unchanged after switching away and back', !!frWordIntact);

  await context.close();
}

// ---------------------------------------------------------------------
// Row 6: voice mode chips — each chip becomes visibly active on tap.
// ---------------------------------------------------------------------
async function testRow6(browser) {
  log('--- Row 6: mode chips ---');
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await seed(page, { preferences: basePreferences({ learningLocale: 'es-419' }) });
  await page.goto(`${BASE_URL}/voice/${ES_BOOK_ID}`, { waitUntil: 'networkidle' });

  const modes = [
    { key: 'read_to_me', label: 'Read to me' },
    { key: 'read_with_me', label: 'Read with me' },
    { key: 'pronunciation', label: 'Pronunciation' },
    { key: 'discuss', label: 'Discuss' },
  ];

  const firstChip = page.getByText(modes[0].label, { exact: true }).first();
  let chipsReady = false;
  try {
    await firstChip.waitFor({ state: 'visible', timeout: 10000 });
    chipsReady = true;
  } catch {
    chipsReady = false;
  }
  record(6, 'mode chips render on voice screen', chipsReady);
  if (!chipsReady) {
    await page.screenshot({ path: path.join(OUT_DIR, '6-mode-chips-missing.png') });
    await context.close();
    return;
  }

  // SessionBar (a distinct component) only mounts inside the (tabs) layout
  // (app/(tabs)/_layout.tsx), never on the standalone /voice/[bookId]
  // screen — confirmed by reading both files — so there is no separate
  // element to check it against here; the chip's own active styling (text
  // recolored to the 'surface' token per modeChipActive) is the on-screen
  // reflection of the mode.
  for (const mode of modes) {
    const chip = await firstVisible(page.getByText(mode.label, { exact: true }));
    await chip.click();
    await page.waitForTimeout(400);
    const settledChip = await firstVisible(page.getByText(mode.label, { exact: true }));
    const color = await settledChip.evaluate((el) => getComputedStyle(el).color).catch(() => null);
    // active chip text is colored 'surface' (#FBF6EC -> rgb(251, 246, 236));
    // see apps/client/app/voice/[bookId].tsx MODES / modeChipActive.
    const active = color === 'rgb(251, 246, 236)';
    record(6, `chip "${mode.label}" becomes active on tap`, active, color);

    await page.screenshot({ path: path.join(OUT_DIR, `6-mode-${mode.key}.png`) });
    log(`  screenshot: rows/6-mode-${mode.key}.png`);
  }

  await context.close();
}

async function main() {
  const browser = await chromium.launch();

  await testRow15(browser);
  await testRow16(browser);
  await testRow24(browser);
  await testRow6(browser);

  await browser.close();

  console.log('\n===== Summary =====');
  for (const [row, results] of Object.entries(rowResults)) {
    const passed = results.filter((r) => r.ok).length;
    console.log(`Row ${row}: ${passed}/${results.length} assertions passed`);
    for (const r of results) {
      console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    }
  }

  if (issues.length) {
    console.log('\n[rows] issues observed during the run:');
    for (const issue of issues) console.log('  -', issue);
    process.exitCode = 1;
  } else {
    console.log('\n[rows] all rows passed.');
  }
}

main().catch((err) => {
  console.error('[rows] FAILED:', err);
  process.exit(1);
});
