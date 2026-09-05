/**
 * Static web build for hosting (Vercel): exports the Expo web bundle into
 * dist/, then copies the content packs alongside it so the client's
 * `/content/packs/**` fetches (contentApi.ts) resolve on the same origin
 * with no server. `index.json` mirrors apps/server's `GET /content/packs`
 * listing; vercel.json rewrites the extension-less path onto it.
 *
 * The voice tutor needs apps/server + local models, so on a static host
 * `/health` 404s and the voice screen degrades to "unavailable" by design.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = path.resolve(clientDir, '../../packages/content/packs');
const dist = path.join(clientDir, 'dist');

execSync('npx expo export --platform web --output-dir dist', {
  cwd: clientDir,
  stdio: 'inherit',
  // Empty string => contentApi.serverUrl() resolves to the page's own origin.
  env: { ...process.env, EXPO_PUBLIC_SERVER_URL: '' },
});

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
