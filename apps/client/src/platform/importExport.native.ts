/**
 * Native export/import: write to the cache dir and hand off to
 * expo-sharing / expo-document-picker (TASK §A, profile "Exporter"/
 * "Importer" rows). Not exercised in a prebuilt dev client this session
 * (see the WS-4 report) — wrapped so a failure surfaces as a rejected
 * promise rather than a crash.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

export async function exportJson(filename: string, json: string): Promise<void> {
  const dir = new Directory(Paths.cache, 'sotto-export');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
  } else {
    throw new Error('sharing unavailable on this device');
  }
}

export async function importJson(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const file = new File(result.assets[0].uri);
  return file.text();
}
