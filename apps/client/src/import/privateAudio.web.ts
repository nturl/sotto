/**
 * Web private-audio storage (planning/LEDGER.md "R3-I Importer"): stores
 * each chapter's audio as a `Blob` directly in IndexedDB via idb-keyval
 * (not the shared string-only `Persistence` adapter — base64-encoding a
 * 3 MB mp3 into a JSON string for that adapter would be wasteful, per the
 * task brief). Object URLs are created lazily and cached per session; they
 * are revoked when a book's audio is deleted.
 */
import { del, get, set } from 'idb-keyval';
import { privateAudioKey } from './privateKeys';

const objectUrlCache = new Map<string, string>();

export async function storeAudioAsset(
  bookId: string,
  file: string,
  bytes: Uint8Array,
): Promise<void> {
  // See api.ts's startImportJob for why this cast is needed and safe.
  const blob = new Blob([bytes as unknown as BlobPart]);
  await set(privateAudioKey(bookId, file), blob);
}

export async function getAudioAssetUrl(bookId: string, file: string): Promise<string | undefined> {
  const key = privateAudioKey(bookId, file);
  const cached = objectUrlCache.get(key);
  if (cached) return cached;
  const blob = await get<Blob>(key);
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(key, url);
  return url;
}

export async function deleteAudioAssets(bookId: string, files: string[]): Promise<void> {
  for (const file of files) {
    const key = privateAudioKey(bookId, file);
    const cached = objectUrlCache.get(key);
    if (cached) {
      URL.revokeObjectURL(cached);
      objectUrlCache.delete(key);
    }
    await del(key);
  }
}
