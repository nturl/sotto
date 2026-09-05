#!/usr/bin/env node
/**
 * Minimal static server for the exported web build (dist/), mirroring the
 * two vercel.json rewrites so `pnpm e2e:hosted` and manual checks can run
 * against a local export exactly as the hosted site behaves:
 *   /content/packs  -> /content/packs/index.json
 *   anything else that is not a file -> /app.html (SPA fallback; the
 *     landing page owns / and is served directly as dist/index.html)
 * Usage: node scripts/serve-static.mjs [port=8090] [dir=dist]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] ?? 8090);
const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  process.argv[3] ?? 'dist',
);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, filePath, status = 200) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(status, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(filePath).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/content/packs' || pathname === '/content/packs/') {
    pathname = '/content/packs/index.json';
  }
  if (pathname === '/') {
    pathname = '/index.html';
  }
  const filePath = path.join(dist, pathname);
  if (filePath.startsWith(dist) && existsSync(filePath) && statSync(filePath).isFile()) {
    send(res, filePath);
    return;
  }
  // Paths that look like files (have an extension) 404 instead of falling
  // back to the shell, so a wrong asset URL is visible rather than cached as HTML.
  if (path.extname(pathname)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  // Extension-less path that isn't a real file: SPA fallback into the app
  // shell (not the landing page, which only owns exactly "/").
  send(res, path.join(dist, 'app.html'));
}).listen(port, () => {
  console.log(`serve-static: ${dist} on http://localhost:${port}`);
});
