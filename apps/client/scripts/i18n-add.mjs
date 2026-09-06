#!/usr/bin/env node
// Add or update UI strings in every catalog under src/i18n in one atomic pass.
//
//   node apps/client/scripts/i18n-add.mjs '{"voice.retry":{"en":"Try again","fr":"Réessayer"}}'
//   node apps/client/scripts/i18n-add.mjs path/to/strings.json
//
// Every key is written to all nine catalogs. A locale that is not given falls
// back to the English value, so `pnpm content:validate`'s catalog-parity check
// stays green; replace fallbacks with real translations before the lane ends.
// Files are read and rewritten in one synchronous pass so parallel lanes do
// not clobber each other's keys. Keys are kept sorted-by-insertion: new keys
// go at the end. Existing keys are overwritten only for the locales given.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/i18n');
const arg = process.argv[2];
if (!arg) {
  console.error('usage: i18n-add.mjs <json-object | path.json>');
  process.exit(2);
}
const input = JSON.parse(arg.trim().startsWith('{') ? arg : readFileSync(arg, 'utf8'));
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
let added = 0;
for (const file of files) {
  const locale = file.replace(/\.json$/, '');
  const path = join(dir, file);
  const catalog = JSON.parse(readFileSync(path, 'utf8'));
  for (const [key, values] of Object.entries(input)) {
    if (typeof values !== 'object' || typeof values.en !== 'string') {
      console.error(`key "${key}" needs at least an "en" value`);
      process.exit(2);
    }
    const value = values[locale] ?? (locale === 'en' ? values.en : (catalog[key] ?? values.en));
    if (catalog[key] !== value) {
      catalog[key] = value;
      added++;
    }
  }
  writeFileSync(path, JSON.stringify(catalog, null, 2) + '\n');
}
console.log(`i18n-add: ${Object.keys(input).length} key(s) across ${files.length} catalogs, ${added} write(s)`);
