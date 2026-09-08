import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://localhost:8090';
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({ permissions: ['microphone'], serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
let transcriptions = 0;
await page.route('https://api.openai.com/**', async (route) => {
  const url = route.request().url();
  if (url.endsWith('/audio/transcriptions')) {
    transcriptions++;
    return route.fulfill({
      contentType: 'application/json',
      body: '{"text":"Controlled fixture speech"}',
    });
  }
  if (url.endsWith('/audio/speech'))
    return route.fulfill({ contentType: 'application/octet-stream', body: Buffer.alloc(4800) });
  if (url.endsWith('/models'))
    return route.fulfill({ contentType: 'application/json', body: '{"data":[]}' });
  return route.fulfill({
    contentType: 'text/event-stream',
    body: 'data: {"choices":[{"delta":{"content":"A fixture reply."}}]}\n\ndata: [DONE]\n\n',
  });
});
await page.addInitScript(() => {
  window.__mic = { calls: 0, tracks: [] };
  const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    window.__mic.calls++;
    const stream = await get(constraints);
    window.__mic.tracks.push(...stream.getTracks());
    return stream;
  };
  localStorage.setItem('sotto.byok.openaiKey', 'sk-fixture-not-a-real-key');
});
const live = () =>
  page.evaluate(() => window.__mic.tracks.filter((t) => t.readyState === 'live').length);
try {
  await page.goto(`${base}/settings`);
  await page.evaluate(async () => {
    const request = indexedDB.open('keyval-store', 1);
    const db = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction('keyval', 'readwrite');
    tx.objectStore('keyval').put(
      JSON.stringify({
        interfaceLocale: 'en',
        explanationLocale: 'en',
        learningLocale: 'en-US',
        level: 'A0',
        defaultTutorMode: 'discuss',
        captionsEnabled: true,
        turnDetection: 'push',
        correctionFrequency: 'normal',
        speakingPace: 'normal',
        narrationSpeed: 1,
        onboarded: true,
      }),
      'sotto.preferences',
    );
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
    db.close();
  });
  await page.goto(`${base}/settings/openai-key`);
  await page.getByRole('button', { name: 'Test the tutor', exact: true }).click();
  await page.waitForTimeout(1500);
  await page
    .getByText(
      'Your OpenAI key · billed directly by OpenAI. A saved key is not proof that tutoring works.',
      { exact: true },
    )
    .waitFor();
  assert.ok(page.url().includes('provider=byok'));
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForTimeout(1200);
  assert.equal(await live(), 0);
  assert.equal(transcriptions, 0);
  const hold = page.getByRole('button', { name: 'Hold to talk', exact: true });
  await hold.focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(900);
  assert.equal(await live(), 1);
  await page.keyboard.up('Space');
  await page.waitForTimeout(500);
  assert.equal(await live(), 0);
  assert.equal(transcriptions, 1);
  await page.waitForTimeout(800);
  assert.equal(transcriptions, 1);
  console.log(
    'PASS real browser synthetic microphone: push Start idle=0 tracks/0 STT; keyboard hold=1 track; release=0 tracks/one STT; silence outside hold=no new STT',
  );
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  const field = page.getByRole('textbox');
  await field.fill('Typed while muted');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForTimeout(700);
  assert.equal(await live(), 0);
  assert.equal(transcriptions, 1);
  await page.getByRole('button', { name: 'Unmute', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.waitForTimeout(200);
  assert.equal(await live(), 0);
  console.log('PASS explicit mute survives typed reply and replay without capture');
  await page.getByRole('button', { name: 'Unmute', exact: true }).click();
  await hold.focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(500);
  assert.equal(await live(), 1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(100);
  assert.equal(await live(), 0);
  await page.keyboard.up('Space');
  await hold.focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.waitForTimeout(100);
  assert.equal(await live(), 0);
  console.log('PASS blur and Close stop real MediaStream tracks');
} finally {
  await browser.close();
}
