/**
 * Cooperative lock for anything that writes into packages/content/packs/,
 * so Lane D's concurrent pack rebuilds and this lane's align/translate
 * commands don't clobber each other's in-flight writes (OVERNIGHT-2.md
 * Lane C ownership note: "take a lock with `mkdir .build.lock` ... before
 * ANY command that writes packs").
 */
import { existsSync, mkdirSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './paths.ts';

const LOCK_PATH = path.join(CONTENT_ROOT, '.build.lock');
const RETRY_MS = 30_000;
const MAX_WAIT_MS = 20 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withBuildLock<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(LOCK_PATH);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (Date.now() - start > MAX_WAIT_MS) {
        throw new Error(
          `sotto-content: gave up waiting for ${LOCK_PATH} after ${MAX_WAIT_MS / 60000} minutes`,
        );
      }
      console.log(`sotto-content: ${LOCK_PATH} is held, retrying in 30s...`);
      await sleep(RETRY_MS);
    }
  }
  try {
    return await fn();
  } finally {
    if (existsSync(LOCK_PATH)) rmdirSync(LOCK_PATH);
  }
}
