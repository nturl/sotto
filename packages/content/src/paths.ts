import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** packages/content/ */
export const CONTENT_ROOT = path.join(__dirname, '..');
export const SOURCE_DIR = path.join(CONTENT_ROOT, 'source');
export const PACKS_DIR = path.join(CONTENT_ROOT, 'packs');
/** apps/client/src/i18n/*.json — the client's UI message catalogs
 * (CONTRACTS §1: en, es, fr, pt, it, zh-Hans, zh-Hant, ro, ca), validated
 * for key completeness against en.json. */
export const CLIENT_I18N_DIR = path.join(CONTENT_ROOT, '..', '..', 'apps', 'client', 'src', 'i18n');
export const CACHE_DIR = path.join(CONTENT_ROOT, '.cache');
export const TEST_FIXTURES_DIR = path.join(CONTENT_ROOT, 'test', 'fixtures');

export function packDir(locale: string): string {
  return path.join(PACKS_DIR, locale);
}

export function bookDir(locale: string, bookId: string): string {
  return path.join(packDir(locale), 'books', bookId);
}

export function chapterFileName(order: number): string {
  return `${String(order).padStart(2, '0')}.json`;
}
