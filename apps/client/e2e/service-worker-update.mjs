/** Verify two exports update an already-installed offline shell, without clearing browser data. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const dist = path.resolve('apps/client/dist');
const manifest = JSON.parse(readFileSync(path.join(dist, 'sw-manifest.json'), 'utf8'));
const worker = readFileSync(path.join(dist, 'sw.js'), 'utf8');
let revision = '100';
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  if (pathname === '/sw-manifest.json') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ...manifest, version: revision }));
    return;
  }
  if (pathname === '/sw.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(worker.replace(`// Sotto build: ${manifest.version}`, `// Sotto build: ${revision}`));
    return;
  }
  let file = path.join(dist, pathname);
  if (!existsSync(file) || pathname === '/') file = path.join(dist, 'app.html');
  const types = {
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
  };
  res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/settings`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  async function waitForShell(version) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const names = await page.evaluate(() => caches.keys());
      if (
        names.includes('sotto-shell-' + version) &&
        !names.some((n) => n.startsWith('sotto-shell-') && n !== 'sotto-shell-' + version)
      )
        return;
      await page.waitForTimeout(100);
    }
    throw new Error('Offline shell did not update to build ' + version);
  }
  await waitForShell('100');
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
  revision = '200';
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    await r.update();
  });
  await waitForShell('200');
  assert.equal(
    await page.evaluate(async () => (await caches.keys()).includes('sotto-shell-100')),
    false,
  );
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /Narration speed/ }).waitFor();
  console.log(
    'PASS installed worker moves from build 100 to 200, drops old shell, and reloads offline without clearing user data',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
