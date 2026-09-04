import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** packages/content/ */
export const CONTENT_ROOT = path.join(__dirname, '..');
export const SOURCE_DIR = path.join(CONTENT_ROOT, 'source');
export const PACKS_DIR = path.join(CONTENT_ROOT, 'packs');
export const MESSAGES_DIR = path.join(CONTENT_ROOT, 'messages');
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
