/**
 * Native private-audio storage (planning/LEDGER.md "R3-I Importer"): bytes
 * go through the shared `Persistence` adapter (expo-sqlite kv-store) as
 * base64, per the task brief's native storage key list; for playback the
 * bytes are materialized once to a `file://` path under the app's document
 * directory (expo-audio needs a URI, not raw bytes), then reused.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { persistence } from '../platform/persistence';
import { privateAudioKey } from './privateKeys';

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function storeAudioAsset(
  bookId: string,
  file: string,
  bytes: Uint8Array,
): Promise<void> {
  await persistence.setItem(privateAudioKey(bookId, file), bytesToBase64(bytes));
}

function audioDir(): Directory {
  const dir = new Directory(Paths.document, 'sotto-private-audio');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export async function getAudioAssetUrl(bookId: string, file: string): Promise<string | undefined> {
  const base64 = await persistence.getItem(privateAudioKey(bookId, file));
  if (!base64) return undefined;
  const target = new File(audioDir(), `${bookId}-${file}`);
  if (!target.exists) {
    target.create();
    target.write(base64ToBytes(base64));
  }
  return target.uri;
}

export async function deleteAudioAssets(bookId: string, files: string[]): Promise<void> {
  for (const file of files) {
    await persistence.removeItem(privateAudioKey(bookId, file));
    const target = new File(audioDir(), `${bookId}-${file}`);
    if (target.exists) target.delete();
  }
}
