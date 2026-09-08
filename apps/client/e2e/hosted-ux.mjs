import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// Pair SOTTO_UX_REAL_IMPORT=1 with the cloud UX fixture's real local model mode.
const verifyNarration = process.env.SOTTO_UX_REAL_IMPORT === '1';
const base = 'http://localhost:8090',
  api = 'http://localhost:8091';
const fixtureDir = mkdtempSync(path.join(tmpdir(), 'sotto-ux-import-'));
writeFileSync(path.join(fixtureDir, 'story.txt'), 'The little cat sleeps. The cat dreams of fish.');
writeFileSync(
  path.join(fixtureDir, 'story.md'),
  '# The cat\n\nThe little cat sleeps. The cat dreams of fish.' +
    (verifyNarration ? '\n\n## Morning\n\nThe cat wakes up. The sun is warm.' : ''),
);
writeFileSync(
  path.join(fixtureDir, 'story.epub'),
  Buffer.from(
    'UEsDBBQAAAAAABNeJ11vYassFAAAABQAAAAIAAAAbWltZXR5cGVhcHBsaWNhdGlvbi9lcHViK3ppcFBLAwQUAAAAAAATXiddx+yk6VcAAABXAAAAFgAAAE1FVEEtSU5GL2NvbnRhaW5lci54bWw8Y29udGFpbmVyPjxyb290ZmlsZXM+PHJvb3RmaWxlIGZ1bGwtcGF0aD0iT0VCUFMvY29udGVudC5vcGYiLz48L3Jvb3RmaWxlcz48L2NvbnRhaW5lcj5QSwMEFAAAAAAAE14nXc5TKpLrAAAA6wAAABEAAABPRUJQUy9jb250ZW50Lm9wZjxwYWNrYWdlIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyI+PG1ldGFkYXRhPjxkYzp0aXRsZT5UaGUgY2F0PC9kYzp0aXRsZT48L21ldGFkYXRhPjxtYW5pZmVzdD48aXRlbSBpZD0iY2giIGhyZWY9ImNoLnhodG1sIiBtZWRpYS10eXBlPSJhcHBsaWNhdGlvbi94aHRtbCt4bWwiLz48L21hbmlmZXN0PjxzcGluZT48aXRlbXJlZiBpZHJlZj0iY2giLz48L3NwaW5lPjwvcGFja2FnZT5QSwMEFAAAAAAAE14nXQHsRf9fAAAAXwAAAA4AAABPRUJQUy9jaC54aHRtbDxodG1sPjxib2R5PjxoMT5UaGUgY2F0PC9oMT48cD5UaGUgbGl0dGxlIGNhdCBzbGVlcHMuIFRoZSBjYXQgZHJlYW1zIG9mIGZpc2guPC9wPjwvYm9keT48L2h0bWw+UEsBAhQDFAAAAAAAE14nXW9hqywUAAAAFAAAAAgAAAAAAAAAAAAAAIABAAAAAG1pbWV0eXBlUEsBAhQDFAAAAAAAE14nXcfspOlXAAAAVwAAABYAAAAAAAAAAAAAAIABOgAAAE1FVEEtSU5GL2NvbnRhaW5lci54bWxQSwECFAMUAAAAAAATXiddzlMqkusAAADrAAAAEQAAAAAAAAAAAAAAgAHFAAAAT0VCUFMvY29udGVudC5vcGZQSwECFAMUAAAAAAATXiddAexF/18AAABfAAAADgAAAAAAAAAAAAAAgAHfAQAAT0VCUFMvY2gueGh0bWxQSwUGAAAAAAQABAD1AAAAagIAAAAA',
    'base64',
  ),
);
const browser = await chromium.launch();
try {
  for (const format of ['txt', 'md', 'epub']) {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    if (verifyNarration) {
      await ctx.addInitScript(() => {
        window.__sottoAudio = [];
        window.Audio = new Proxy(window.Audio, {
          construct(target, args) {
            const audio = Reflect.construct(target, args);
            window.__sottoAudio.push(audio);
            return audio;
          },
        });
      });
    }
    const page = await ctx.newPage();
    page.setDefaultTimeout(12000);
    await page.goto(`${base}/account?intent=start`);
    await page.getByRole('textbox').fill(`${format}-${Date.now()}@example.invalid`);
    await page.getByRole('button', { name: 'Send me a link', exact: true }).click();
    await page
      .getByText(/Check your email/)
      .first()
      .waitFor();
    const { url } = await (await ctx.request.get(`${api}/fixture/link`)).json();
    await page.goto(url);
    await page.waitForURL('**/onboarding');
    await page.goto(`${base}/paywall`);
    const yearly = page.getByRole('radio', { name: /Yearly/ });
    await yearly.click();
    assert.equal(await yearly.getAttribute('aria-checked'), 'true');
    await page.getByRole('radio', { name: /Monthly/ }).click();
    const nextPage = ctx.waitForEvent('page');
    await page.getByRole('button', { name: /^Subscribe/ }).click();
    const checkout = await nextPage;
    await checkout.getByRole('button', { name: 'Complete test subscription' }).click();
    await checkout.waitForURL('**/account**');
    await checkout.getByRole('button', { name: /Manage subscription/ }).waitFor();
    console.log(
      `PASS ${format}: isolated account sign-in, checked interval, test checkout handoff, entitlement return`,
    );
    await checkout.goto(`${base}/voice/en-aesop-fables?mode=discuss`);
    await checkout
      .getByText(/Cloud · uses your included/)
      .waitFor({ timeout: 5000 })
      .catch(async (e) => {
        console.log(await checkout.locator('body').innerText());
        throw e;
      });
    await checkout.goto(`${base}/import`);
    const choose = checkout.waitForEvent('filechooser');
    await checkout.getByText('TXT', { exact: true }).click();
    await (await choose).setFiles(path.join(fixtureDir, `story.${format}`));
    const accepted = checkout.waitForResponse(
      (r) => r.url() === `${api}/import` && r.request().method() === 'POST',
    );
    await checkout.getByRole('button', { name: 'Import', exact: true }).click();
    const { jobId } = await (await accepted).json();
    await checkout
      .getByText('Book imported', { exact: true })
      .waitFor({ timeout: verifyNarration ? 300000 : 30000 });
    await checkout.getByRole('button', { name: 'Open the book', exact: true }).click();
    if (checkout.url().includes('/book/'))
      await checkout.goto(checkout.url().replace('/book/', '/reader/'));
    await checkout.getByRole('button', { name: 'Look up cat', exact: true }).first().waitFor();
    const me = await (await ctx.request.get(`${api}/me`)).json();
    assert.equal(me.entitlement.importsUsed, 1);
    console.log(
      `PASS ${format}: uploaded, parsed, translated, persisted readable book, one import counted`,
    );
    if (verifyNarration) {
      const result = await (await ctx.request.get(`${api}/import/${jobId}/result`)).json();
      const chapter = result.book.chapters[0];
      assert.ok(chapter.audio && chapter.durationMs > 1000);
      const response = await ctx.request.get(`${api}/import/${jobId}/${chapter.audio}`);
      assert.equal(response.status(), 200);
      assert.ok((await response.body()).length > 1000);
      const playAndPause = async () => {
        await checkout.getByRole('button', { name: 'Play', exact: true }).click();
        await checkout.waitForFunction(() =>
          window.__sottoAudio.some(
            (a) => a.src.startsWith('blob:') && a.currentTime > 0.3 && !a.paused,
          ),
        );
        await checkout.getByRole('button', { name: 'Pause', exact: true }).click();
        assert.ok(await checkout.evaluate(() => window.__sottoAudio.every((a) => a.paused)));
      };
      await playAndPause();
      await checkout.reload();
      await checkout.getByRole('button', { name: 'Play', exact: true }).waitFor();
      await ctx.setOffline(true);
      await playAndPause();
      await ctx.setOffline(false);
      console.log(
        `PASS ${format}: generated narration plays from device storage after reload and offline`,
      );
      if (format === 'md') {
        assert.equal(result.book.chapters.length, 2);
        assert.equal(result.book.chapters[1].audio, undefined);
        const narrated = checkout.waitForResponse(
          (r) => r.url() === `${api}/import/${jobId}/narrate/1` && r.request().method() === 'POST',
          { timeout: 120000 },
        );
        await checkout.getByRole('button', { name: 'Next chapter', exact: true }).click();
        assert.equal((await narrated).status(), 200);
        await playAndPause();
        const updated = await (await ctx.request.get(`${api}/import/${jobId}/result`)).json();
        assert.ok(updated.book.chapters[1].audio && updated.book.chapters[1].durationMs > 1000);
        console.log('PASS md: later chapter generated and played after reopening the app');
      }
    }
    await checkout.goto(`${base}/account`);
    const portalPromise = ctx.waitForEvent('page');
    await checkout.getByRole('button', { name: /Manage subscription/ }).click();
    const portal = await portalPromise;
    await portal.getByRole('button', { name: 'Cancel test subscription' }).click();
    assert.equal((await (await ctx.request.get(`${api}/me`)).json()).entitlement.plan, 'free');
    console.log(`PASS ${format}: test portal cancellation ends hosted access`);
    await ctx.close();
  }
} finally {
  await browser.close();
  rmSync(fixtureDir, { recursive: true, force: true });
}
