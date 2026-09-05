/**
 * Static web build for hosting (Vercel): exports the Expo web bundle into
 * dist/, then copies the content packs alongside it so the client's
 * `/content/packs/**` fetches (contentApi.ts) resolve on the same origin
 * with no server. `index.json` mirrors apps/server's `GET /content/packs`
 * listing; vercel.json rewrites the extension-less path onto it.
 *
 * The local-server tutor needs apps/server + local models, so on a static
 * host `/health` 404s. The voice screen no longer just degrades: it offers
 * the in-browser tutor (BrowserCascadeProvider) on a WebGPU browser, whose
 * worker bundle this script builds first.
 *
 * A3 (PWA, OVERNIGHT-2.md Lane A) also happens here, after the export:
 * Expo's web export does not read public/index.html for manifest/meta tags,
 * so dist/index.html (renamed to dist/app.html, see the landing step below)
 * is patched in place; and public/sw.js needs a build-time manifest of the
 * app-shell files to precache (their /_expo/static names are
 * content-hashed and only exist post-export), written to
 * dist/sw-manifest.json.
 *
 * Landing page (Cleo spec, planning/design/LANDING.md): Expo's export
 * produces a single dist/index.html for the app. That gets renamed to
 * dist/app.html (and the manifest/meta/__SOTTO_STATIC__ injections below
 * run against app.html instead), then the static landing source at
 * web/landing/index.html is copied in as the new dist/index.html, along
 * with the four TTFs it references at /fonts/. vercel.json's catch-all
 * rewrite and public/sw.js's offline fallback both point at /app.html so
 * the app keeps serving every other path on the same origin.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors } from '@sotto/core/theme';

const require = createRequire(import.meta.url);

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = path.resolve(clientDir, '../../packages/content/packs');
const dist = path.join(clientDir, 'dist');

// The in-browser tutor's worker bundle must exist in public/ before Expo
// copies public/ into dist (planning/BROWSER-TUTOR.md).
execSync('node scripts/build-tutor-worker.mjs', { cwd: clientDir, stdio: 'inherit' });

execSync('npx expo export --platform web --output-dir dist', {
  cwd: clientDir,
  stdio: 'inherit',
  // Empty string => contentApi.serverUrl() resolves to the page's own origin.
  env: { ...process.env, EXPO_PUBLIC_SERVER_URL: '' },
});

// Landing page takes over dist/index.html; the exported app shell moves to
// dist/app.html, where the rest of this script's injections (below) run.
renameSync(path.join(dist, 'index.html'), path.join(dist, 'app.html'));

const outPacks = path.join(dist, 'content', 'packs');
mkdirSync(outPacks, { recursive: true });
cpSync(packsDir, outPacks, { recursive: true });

const packs = readdirSync(packsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
  .map((d) => path.join(packsDir, d.name, 'pack.json'))
  .filter((p) => existsSync(p))
  .map((p) => JSON.parse(readFileSync(p, 'utf-8')));
writeFileSync(path.join(outPacks, 'index.json'), JSON.stringify(packs));
console.log(`web build: ${packs.length} packs copied to dist/content/packs`);

// --- A3: PWA manifest -------------------------------------------------------
// background/theme colors come from the theme tokens (never hardcoded) so
// the manifest can't drift from the app's actual canvas color.
const manifestWebmanifest = {
  name: 'Sotto',
  short_name: 'Sotto',
  description:
    'A free, local-first graded reader for learning a language by reading and listening.',
  start_url: '/start',
  scope: '/',
  display: 'standalone',
  background_color: colors.canvas,
  theme_color: colors.canvas,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    {
      src: '/icons/icon-512-maskable.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};
writeFileSync(
  path.join(dist, 'manifest.webmanifest'),
  JSON.stringify(manifestWebmanifest, null, 2),
);

// --- A3: app.html meta/link injection ---------------------------------------
const indexPath = path.join(dist, 'app.html');
let html = readFileSync(indexPath, 'utf-8');
const injected = [
  '<link rel="manifest" href="/manifest.webmanifest">',
  `<meta name="theme-color" content="${colors.canvas}">`,
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="apple-mobile-web-app-title" content="Sotto">',
].join('\n    ');
if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', `    ${injected}\n  </head>`);
  writeFileSync(indexPath, html);
}

// --- F2.2: static-export flag ------------------------------------------
// contentApi.ts's serverUrl() needs to tell a static export (this build,
// served by anything — Vercel, `npx serve dist`, serve-static.mjs) apart
// from the Expo dev server. A hostname heuristic can't do that reliably
// (serving `dist/` on localhost looks identical to the dev server), so
// stamp an explicit flag into the exported HTML instead; the hostname
// check remains only as a fallback for anyone loading the bundle without
// this script (e.g. `expo start --web`, which never runs build-web.mjs).
html = readFileSync(indexPath, 'utf-8');
if (!html.includes('__SOTTO_STATIC__')) {
  html = html.replace('</head>', '    <script>window.__SOTTO_STATIC__=true;</script>\n  </head>');
  writeFileSync(indexPath, html);
}

// --- Landing page: copy source to dist/index.html, fonts to dist/fonts/ ----
copyFileSync(path.join(clientDir, 'web/landing/index.html'), path.join(dist, 'index.html'));
const fontsDir = path.join(dist, 'fonts');
mkdirSync(fontsDir, { recursive: true });
const landingFonts = [
  '@expo-google-fonts/fraunces/300Light/Fraunces_300Light.ttf',
  '@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf',
  '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
  '@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
];
for (const specifier of landingFonts) {
  const src = require.resolve(specifier);
  copyFileSync(src, path.join(fontsDir, path.basename(src)));
}
console.log(`web build: landing page + ${landingFonts.length} fonts copied to dist/`);

// --- A3: service-worker precache manifest -----------------------------------
// Every file the export produced outside of dist/content (the packs are
// runtime-cached instead, see public/sw.js) plus index.html itself.
function walk(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, base));
    else files.push('/' + path.relative(base, full).split(path.sep).join('/'));
  }
  return files;
}
// The Expo web export bundles every weight (and italic) of a
// @expo-google-fonts package as a static asset, but apps/client/app/_layout.tsx
// only ever calls useFonts with these four (apps/client/src/ui/fonts.ts is
// the source of truth) — precaching the other ~30 TTFs on first visit is
// pure waste that will never be requested.
const usedFontBasenames = new Set([
  'Fraunces_300Light',
  'Fraunces_400Regular',
  'Inter_400Regular',
  'Inter_500Medium',
]);
function isUnusedFont(f) {
  if (!f.includes('@expo-google-fonts') || !f.endsWith('.ttf')) return false;
  const basename = path.basename(f).split('.')[0];
  return !usedFontBasenames.has(basename);
}
const shellFiles = walk(dist).filter(
  (f) =>
    !f.startsWith('/content/packs/') &&
    !f.startsWith('/tutor/') &&
    f !== '/sw.js' &&
    f !== '/sw-manifest.json' &&
    !isUnusedFont(f),
);
// Version the shell/content caches by the newest mtime among the exported
// files — stable across re-running this script on the same export, but
// changes on every real rebuild (new bundle hash => new mtimes).
const version = String(Math.max(...shellFiles.map((f) => statSync(path.join(dist, f)).mtimeMs)));
writeFileSync(path.join(dist, 'sw-manifest.json'), JSON.stringify({ version, files: shellFiles }));
console.log(
  `web build: PWA manifest + sw-manifest.json written (${shellFiles.length} shell files, v${version})`,
);
