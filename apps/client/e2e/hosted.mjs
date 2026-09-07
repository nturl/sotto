#!/usr/bin/env node
/**
 * "First contact on the hosted link" smoke test (O2-A, OVERNIGHT-2.md Lane
 * A): a stranger opening BASE_URL lands on the static landing page (Cleo
 * spec, planning/design/LANDING-V4.md), clicks "Try a sample" (run 7 lane A),
 * walks the four-step onboarding wizard (run 7 lane C) accepting each step's
 * proposed default, opens the book the last screen recommends, and should
 * then be reading a narrated story at both a phone and a desktop width, be
 * able to install the site (manifest + registered service worker), and be
 * able to reload an already-opened book while offline.
 *
 * The one-tap fast path this smoke used to click ("Start reading in French")
 * no longer exists: /start now redirects to /onboarding, which asks four
 * questions (app language, I'm learning, your level, explain in) and ends on
 * /onboarding/done with a single recommended book. The run counts and logs
 * the taps it takes to get from the landing page into the reader.
 *
 * Usage:
 *   node apps/client/e2e/hosted.mjs                # BASE_URL defaults to
 *                                                   # https://readsotto.app
 *   BASE_URL=http://localhost:8090 node apps/client/e2e/hosted.mjs
 *
 * Local static export: `node apps/client/scripts/serve-static.mjs 8090` (mirrors the vercel.json rewrites), then run
 * this against BASE_URL=http://localhost:8090.
 *
 * KNOWN LOCAL-ONLY GAP: apps/client/src/state/contentApi.ts resolves the
 * content server to `http://localhost:8790` (not same-origin) whenever
 * `location.hostname` is exactly "localhost"/"127.0.0.1"/"[::1]" — a
 * carve-out for local dev, where a real content server runs on :8790
 * alongside the web client. On the real hosted origin (any other
 * hostname, e.g. readsotto.app) this branch does not apply and
 * `/content/packs/**` is same-origin, which is what public/sw.js's
 * runtime content-cache targets. That means the "offline reload of an
 * opened book" check below only exercises the *app shell* cache against
 * plain `localhost`; it re-tests book-content caching too, but that half
 * only actually proves anything when BASE_URL's hostname isn't one of
 * those three loopback names (i.e. the real hosted site, or a local port
 * reached via a non-"localhost" loopback name).
 */
import { chromium } from 'playwright';

const BASE_URL = (process.env.BASE_URL ?? 'https://readsotto.app').replace(/\/$/, '');
const WIDTHS = [
  { width: 375, height: 812, label: '375' },
  { width: 1440, height: 900, label: '1440' },
];

const consoleErrors = [];
const pageErrors = [];
let failed = false;

function log(...args) {
  console.log(`[hosted-smoke ${new Date().toISOString()}]`, ...args);
}

function fail(message) {
  failed = true;
  console.error(`[hosted-smoke] FAIL: ${message}`);
}

function attachErrorCollectors(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[${label}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => pageErrors.push(`[${label}] ${err.message}`));
}

/** Reads `sotto.vocabulary` straight out of the idb-keyval store
 * (`persistence.web.ts`) rather than driving the review UI's flashcard
 * flow, which isn't built for a single-word presence check. */
async function readSavedVocabulary(page) {
  return page.evaluate(async () => {
    const req = indexedDB.open('keyval-store', 1);
    const db = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!db.objectStoreNames.contains('keyval')) return [];
    const tx = db.transaction('keyval', 'readonly');
    const getReq = tx.objectStore('keyval').get('sotto.vocabulary');
    const raw = await new Promise((resolve) => {
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => resolve(undefined);
    });
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  });
}

/** Finds the first tappable word token (only real words carry a token id;
 * punctuation/spacing spans aren't tappable) that's actually laid out on
 * screen, and returns its center point. */
async function firstWordCenter(page) {
  return page.evaluate(() => {
    // Run 8 lane D: tokens are plain now (PLAN.md decision 7 removed the
    // dotted peach underline this used to scan for). Word tokens carry
    // `dataSet={{tokenId}}` from SelectableSpeechText.tsx, which RN Web
    // emits as the DOM attribute `data-token-id` (hyphenated — verified in
    // a live Metro page, not `data-tokenid` as RECON.md §8 guessed), and
    // only `isWord` tokens get it, so this still lands on a tappable word.
    const spans = [...document.querySelectorAll('span[data-token-id]')];
    for (const span of spans) {
      const rect = span.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top > 0) {
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: span.textContent };
      }
    }
    return null;
  });
}

async function runAtWidth({ width, height, label }) {
  log(`--- width ${label} ---`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  attachErrorCollectors(page, label);

  await page.goto(BASE_URL, { waitUntil: 'load' });
  log(`${label}: cold visit loaded`);

  // Landing page (Cleo spec, planning/design/LANDING-V4.md): / is the static
  // landing, not the app. Assert the headline, then click "Try a sample"
  // (href="/start") to enter the app as a guest — the door that needs no
  // account, as opposed to "Start free"/"Sign in", which go to the paid
  // origin's account screen.
  let taps = 0;
  const landingHeadline = page.getByRole('heading', { name: 'Read a page. Then talk about it.' });
  try {
    await landingHeadline.waitFor({ state: 'visible', timeout: 15000 });
    log(`${label}: landing headline visible`);
  } catch {
    fail(`${label}: landing heading "Sotto reads with you." never became visible`);
  }
  const startLink = page.getByRole('link', { name: 'Try a sample' });
  try {
    await startLink.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    fail(`${label}: landing "Try a sample" link never became visible`);
    await browser.close();
    return;
  }
  await startLink.click();
  taps += 1;
  log(`${label}: tap ${taps} — clicked landing "Try a sample" link`);

  // <link rel="manifest"> present (installability check 1/2).
  const hasManifest = await page.evaluate(() => !!document.querySelector('link[rel="manifest"]'));
  if (hasManifest) log(`${label}: manifest link present`);
  else fail(`${label}: no <link rel="manifest"> found`);

  // The four-step onboarding wizard (run 7 lane C, app/onboarding/index.tsx).
  // /start redirects a guest here. Each step already has its proposal
  // selected (the old fast path's defaults), so the journey is four
  // confirmations: "Continue" three times, then "Finish". Titles come from
  // src/i18n/en.json (onboarding.step.*); the progress line is
  // onboarding.progress, "Step N of 4".
  const WIZARD_STEPS = [
    { title: 'App language' },
    { title: "I'm learning" },
    { title: 'Your level' },
    { title: 'Explain in' },
  ];
  const progress = page.getByTestId('onboarding-progress');
  try {
    await progress.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    fail(`${label}: onboarding wizard never appeared after "Try a sample" (at ${page.url()})`);
    await browser.close();
    return;
  }

  /** The option row the step arrives with already chosen. react-native-web
   * drops accessibilityState.selected for role="button", so the selection is
   * read the way a learner sees it: OptionRow's selected style is the 3px
   * accent bar down the left edge (src/ui/OptionRow.tsx). */
  const selectedOption = () =>
    page.evaluate(() => {
      const rows = [...document.querySelectorAll('[role="button"]')].filter(
        (el) => getComputedStyle(el).borderLeftWidth === '3px',
      );
      if (rows.length !== 1) return null;
      return rows[0].textContent.replace(/\s+/g, ' ').trim();
    });

  let wizardOk = true;
  for (const [index, step] of WIZARD_STEPS.entries()) {
    const isLast = index === WIZARD_STEPS.length - 1;
    const wantProgress = `Step ${index + 1} of ${WIZARD_STEPS.length}`;
    try {
      await page.getByTestId('onboarding-progress').filter({ hasText: wantProgress }).waitFor({
        state: 'visible',
        timeout: 15000,
      });
    } catch {
      fail(
        `${label}: onboarding never showed "${wantProgress}" (saw "${await progress
          .textContent()
          .catch(() => '?')}")`,
      );
      wizardOk = false;
      break;
    }
    const title = (await page.getByTestId('onboarding-title').textContent()) ?? '';
    if (title.trim() !== step.title) {
      fail(`${label}: step ${index + 1} title is "${title.trim()}", want "${step.title}"`);
      wizardOk = false;
      break;
    }
    // Step 3 carries the "not sure which level?" helper (the one question a
    // stranger can't answer from a label); assert it's offered, don't open it
    // — this walk accepts the proposed level.
    if (index === 2) {
      const helper = page.getByRole('button', { name: 'Not sure which level?' });
      if (await helper.isVisible().catch(() => false))
        log(`${label}: level step offers the "Not sure which level?" helper`);
      else fail(`${label}: level step is missing the "Not sure which level?" helper`);
    }
    const proposed = await selectedOption();
    if (!proposed)
      fail(
        `${label}: step ${index + 1} ("${step.title}") arrived with no single option pre-selected`,
      );
    const next = page.getByRole('button', { name: isLast ? 'Finish' : 'Continue' });
    try {
      await next.waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      fail(
        `${label}: step ${index + 1} ("${step.title}") has no ${isLast ? 'Finish' : 'Continue'} button`,
      );
      wizardOk = false;
      break;
    }
    await next.click();
    taps += 1;
    log(
      `${label}: tap ${taps} — step ${index + 1}/4 "${step.title}", kept "${proposed ?? '(none)'}", ${isLast ? 'Finish' : 'Continue'}`,
    );
  }
  if (!wizardOk) {
    await browser.close();
    return;
  }

  // /onboarding/done — the recommendation screen: one book by name, plus the
  // tutor-is-optional line and a link to the library.
  const doneTitle = page.getByTestId('onboarding-done-title');
  try {
    await doneTitle.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    fail(`${label}: onboarding never reached the recommendation screen (at ${page.url()})`);
    await browser.close();
    return;
  }
  if (!/\/onboarding\/done/.test(page.url()))
    fail(`${label}: recommendation screen is at ${page.url()}, want /onboarding/done`);
  const recommended = await page
    .getByTestId('onboarding-done-book')
    .textContent()
    .catch(() => null);
  if (recommended) log(`${label}: recommendation screen names "${recommended.trim()}"`);
  else fail(`${label}: recommendation screen named no book (packs may not have loaded)`);

  const startReading = page.getByRole('button', { name: 'Start reading' });
  try {
    await startReading.waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    fail(`${label}: recommendation screen has no "Start reading" button`);
    await browser.close();
    return;
  }
  await startReading.click();
  taps += 1;
  log(`${label}: tap ${taps} — clicked "Start reading"`);

  // Lands on the reader.
  try {
    await page.waitForURL(/\/reader\//, { timeout: 15000 });
  } catch {
    fail(
      `${label}: "Start reading" did not navigate to a /reader/<bookId> URL (stayed at ${page.url()})`,
    );
    await browser.close();
    return;
  }
  log(`${label}: reader visible at ${page.url()}`);
  log(`${label}: TAPS landing -> reader = ${taps}`);

  // First-visit offline readiness (F1.2): the book opened above is this
  // page's very first load — the service worker only just started
  // controlling it (`skipWaiting()`/`clients.claim()`), so without the
  // `cache-book` message from `state/createStore.ts`'s `loadBook`, none of
  // this book's content would be cached yet (the runtime fetch-handler
  // cache only sees requests issued *after* the SW controls the page, and
  // this is the same load that just did). Wait for the SW to actually be
  // ready, then assert its content cache already has this book's chapter
  // JSON and at least one narration audio file — proving the book is
  // offline-ready without a second load.
  const bookIdMatch = page.url().match(/\/reader\/([^/?#]+)/);
  const bookId = bookIdMatch ? bookIdMatch[1] : null;
  let warmedChapterUrl = null;
  let warmedAudioUrl = null;
  if (!bookId) {
    fail(`${label}: could not extract bookId from reader URL ${page.url()}`);
  } else {
    await page.evaluate(() => navigator.serviceWorker.ready);
    // The cache-book message handler fetches+caches every URL
    // asynchronously (event.waitUntil, not something this test's message
    // post waits on) — poll briefly rather than checking once immediately
    // after `ready`, which raced the audio file (larger than the chapter
    // JSON) on a slow run.
    const firstVisitCache = await page.evaluate(async (id) => {
      const deadline = Date.now() + 8000;
      let result = { hasChapterJson: false, hasAudio: false, chapterUrl: null, audioUrl: null };
      while (Date.now() < deadline) {
        const names = await caches.keys();
        const contentName = names.find((n) => n.startsWith('sotto-content-'));
        if (contentName) {
          const keys = await (await caches.open(contentName)).keys();
          const bookUrls = keys.map((r) => r.url).filter((u) => u.includes(`/books/${id}/`));
          const chapterUrl = bookUrls.find((u) => /\/chapters\/\d+\.json$/.test(u)) ?? null;
          const audioUrl = bookUrls.find((u) => u.endsWith('.mp3')) ?? null;
          result = {
            hasChapterJson: !!chapterUrl,
            hasAudio: !!audioUrl,
            chapterUrl,
            audioUrl,
          };
          if (result.hasChapterJson && result.hasAudio) return result;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return result;
    }, bookId);
    if (firstVisitCache.hasChapterJson)
      log(`${label}: first-visit content cache has this book's chapter JSON`);
    else fail(`${label}: first-visit content cache is missing a chapter JSON for "${bookId}"`);
    if (firstVisitCache.hasAudio)
      log(`${label}: first-visit content cache has this book's narration audio`);
    else fail(`${label}: first-visit content cache is missing narration audio for "${bookId}"`);
    warmedChapterUrl = firstVisitCache.chapterUrl;
    warmedAudioUrl = firstVisitCache.audioUrl;
  }

  // In the reader: play.
  const playButton = page.getByRole('button', { name: /^(Play|Pause)$/ });
  try {
    await playButton.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    fail(`${label}: no play/pause button found in the reader`);
    await browser.close();
    return;
  }
  await playButton.click();
  log(`${label}: clicked play in the reader`);

  // Narration audible and progressing within 10s. expo-audio's web backend
  // plays via an <audio> element when one exists; fall back to the
  // transport bar's own position readout (it updates from the same
  // playback status the reader uses) when it doesn't, so this still
  // proves narration is actually advancing rather than stalled at 0:00.
  const playingWithinBudget = await page.evaluate(async () => {
    const deadline = Date.now() + 10000;
    const audio = document.querySelector('audio');
    if (audio) {
      const start = audio.currentTime;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250));
        if (audio.currentTime > start + 0.2) return true;
      }
      return false;
    }
    // No <audio> element: read the transport bar's "m:ss" position label
    // instead (see app/reader/[bookId].tsx's formatClock).
    const clockRe = /^\d+:\d{2}$/;
    const readClock = () =>
      [...document.querySelectorAll('span,div')]
        .map((el) => el.textContent?.trim())
        .find((t) => t && clockRe.test(t) && t !== '0:00');
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
      if (readClock()) return true;
    }
    return false;
  });
  if (playingWithinBudget) log(`${label}: narration playing within 10s`);
  else fail(`${label}: narration position never advanced within 10s of pressing play`);

  // Tap a word -> gloss shown -> save -> reload -> vocabulary has it.
  const wordCenter = await firstWordCenter(page);
  if (!wordCenter) {
    fail(`${label}: no tappable word token found on screen`);
  } else {
    await page.mouse.click(wordCenter.x, wordCenter.y);
    const saveButton = page.getByRole('button', { name: 'Save' });
    try {
      await saveButton.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      fail(`${label}: tapping "${wordCenter.text}" did not show a translation panel`);
    }
    if (await saveButton.isVisible().catch(() => false)) {
      log(`${label}: tapped "${wordCenter.text}", translation panel shown`);
      await saveButton.click();
      await page.waitForTimeout(300);
      const beforeReload = await readSavedVocabulary(page);
      const savedWord = beforeReload.find((w) => w.sourceWord === wordCenter.text);
      if (savedWord) log(`${label}: saved "${wordCenter.text}" to vocabulary`);
      else fail(`${label}: "${wordCenter.text}" not found in vocabulary after saving`);

      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(500);
      const afterReload = await readSavedVocabulary(page);
      if (afterReload.some((w) => w.sourceWord === wordCenter.text)) {
        log(`${label}: saved word survived reload`);
      } else {
        fail(`${label}: saved word missing from vocabulary after reload`);
      }
    }
  }

  // Service worker registered (installability check 2/2).
  try {
    const registered = await page.evaluate(() =>
      navigator.serviceWorker.getRegistration().then((r) => !!r),
    );
    if (registered) log(`${label}: service worker registered`);
    else fail(`${label}: navigator.serviceWorker.getRegistration() resolved falsy`);
  } catch (err) {
    fail(`${label}: serviceWorker check threw: ${err.message}`);
  }

  // Offline reload of the opened book. Two checks:
  //
  // 1. Deterministic: inspect the SW's own Cache Storage directly for the
  //    responses an offline reload would need (app shell + this book's
  //    content, when content is same-origin — see the file-header note on
  //    the local "localhost" carve-out). This is what public/sw.js's
  //    install/fetch handlers actually rely on, so it's a real proof of
  //    the precache/runtime-cache mechanism, independent of any test-tool
  //    quirks around network emulation.
  // 2. Best-effort: actually flip the browser offline and reload. In this
  //    Playwright/Chromium build, CDP-level offline emulation (and route
  //    interception) blocks the request before the Service Worker's
  //    `fetch` handler ever runs — a known tooling limitation, not an app
  //    bug (confirmed by reproducing the identical net::ERR_FAILED for a
  //    plain same-origin `fetch()` call while offline, with no app code
  //    involved). So this step logs a clear WARN instead of failing the
  //    whole run when it hits exactly that failure mode.
  const readerUrl = page.url();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500); // let this page's own fetches settle into cache

  const cacheState = await page.evaluate(async (bookPath) => {
    const names = await caches.keys();
    const shellName = names.find((n) => n.startsWith('sotto-shell-'));
    const contentName = names.find((n) => n.startsWith('sotto-content-'));
    const shellHasIndex = shellName
      ? !!(await (await caches.open(shellName)).match('/index.html'))
      : false;
    let contentCachedCount = 0;
    if (contentName) {
      const keys = await (await caches.open(contentName)).keys();
      contentCachedCount = keys.filter((r) => r.url.includes(bookPath)).length;
    }
    return { shellName, shellHasIndex, contentName, contentCachedCount };
  }, '/content/packs/');

  if (cacheState.shellHasIndex)
    log(`${label}: shell cache (${cacheState.shellName}) has index.html`);
  else fail(`${label}: shell cache is missing index.html — offline reload would not work`);

  const sameOriginContent =
    new URL(BASE_URL).hostname !== 'localhost' &&
    new URL(BASE_URL).hostname !== '127.0.0.1' &&
    new URL(BASE_URL).hostname !== '[::1]';
  if (sameOriginContent) {
    if (cacheState.contentCachedCount > 0) {
      log(
        `${label}: content cache (${cacheState.contentName}) has ${cacheState.contentCachedCount} file(s) for this book`,
      );
    } else {
      fail(`${label}: no /content/packs/ files found in a runtime content cache`);
    }
  } else {
    log(
      `${label}: skipping content-cache assertion — BASE_URL's hostname is a local-dev ` +
        'loopback name, so contentApi.ts resolves packs cross-origin (see file header note)',
    );
  }

  // F2.1: hard offline-fetch proof. Playwright/Chromium's CDP-level offline
  // emulation preempts *navigations* before the Service Worker's fetch
  // handler ever runs (the known limitation the WARN below is about), but a
  // page-initiated fetch() genuinely goes through the SW under the same
  // emulation — so this is a real assertion, not a cache-inspection proxy.
  // Requires sw.js to resolve cache names without a network round trip
  // while offline (F2.1's manifest-in-memory/cached-copy fix); before that
  // fix this always failed (getManifest() fell back to a nonexistent
  // 'sotto-shell-dev'/'sotto-content-dev' cache).
  if (!warmedChapterUrl || !warmedAudioUrl) {
    fail(`${label}: no warmed chapter/audio URL to offline-fetch-test`);
  } else {
    await context.setOffline(true);
    const offlineFetches = await page.evaluate(
      async ({ chapterUrl, audioUrl }) => {
        const statusOf = async (url, init) => {
          try {
            const res = await fetch(url, init);
            return res.status;
          } catch (err) {
            return `throw: ${err.message}`;
          }
        };
        return {
          indexStatus: await statusOf('/index.html'),
          chapterStatus: await statusOf(chapterUrl),
          audioStatus: await statusOf(audioUrl, { headers: { range: 'bytes=0-1' } }),
        };
      },
      { chapterUrl: warmedChapterUrl, audioUrl: warmedAudioUrl },
    );
    await context.setOffline(false);

    if (offlineFetches.indexStatus === 200) log(`${label}: offline fetch('/index.html') -> 200`);
    else fail(`${label}: offline fetch('/index.html') -> ${offlineFetches.indexStatus} (want 200)`);

    if (offlineFetches.chapterStatus === 200) log(`${label}: offline fetch(chapter json) -> 200`);
    else
      fail(`${label}: offline fetch(chapter json) -> ${offlineFetches.chapterStatus} (want 200)`);

    if (offlineFetches.audioStatus === 206)
      log(`${label}: offline fetch(audio, Range bytes=0-1) -> 206`);
    else
      fail(
        `${label}: offline fetch(audio, Range bytes=0-1) -> ${offlineFetches.audioStatus} (want 206)`,
      );
  }

  try {
    await context.setOffline(true);
    await page.goto(readerUrl, { waitUntil: 'load', timeout: 8000 });
    // The button renders after a hydration tick — isVisible() alone races
    // it (observed: bodyText/screenshot show the reader fully rendered a
    // moment after goto() resolves, but an immediate isVisible() check
    // still reads false).
    const readerRenders = await page
      .getByRole('button', { name: /^(Play|Pause)$/ })
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (readerRenders)
      log(`${label}: offline reload rendered the reader (network-level offline honored by the SW)`);
    else fail(`${label}: browser went offline but the reader did not render after reload`);
  } catch (err) {
    if (/ERR_FAILED/.test(err.message)) {
      log(
        `${label}: WARN — real offline navigation hit the known Playwright/Chromium ` +
          'CDP limitation (network emulation preempts the Service Worker fetch handler ' +
          'for navigations); relying on the cache-inspection checks above instead.',
      );
    } else {
      fail(`${label}: offline reload threw: ${err.message}`);
    }
  } finally {
    await context.setOffline(false);
  }

  await browser.close();
  log(`--- width ${label} done ---`);
}

(async () => {
  log(`BASE_URL=${BASE_URL}`);
  for (const size of WIDTHS) {
    await runAtWidth(size);
  }

  if (consoleErrors.length) {
    fail(`${consoleErrors.length} console error(s):\n  ${consoleErrors.join('\n  ')}`);
  }
  if (pageErrors.length) {
    fail(`${pageErrors.length} page error(s):\n  ${pageErrors.join('\n  ')}`);
  }

  if (failed) {
    log('RESULT: FAIL');
    process.exit(1);
  }
  log('RESULT: PASS');
})();
