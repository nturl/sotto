/**
 * Native file picker for the import flow (planning/design/IMPORT.md §2):
 * expo-document-picker, same dependency platform/importExport.native.ts's
 * `importJson` already uses.
 */
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

export interface PickedFile {
  bytes: Uint8Array;
  filename: string;
}

export async function pickImportFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/epub+zip', 'text/plain', 'text/markdown', 'text/x-markdown'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const file = new File(asset.uri);
  const buffer = await file.arrayBuffer();
  return { bytes: new Uint8Array(buffer), filename: asset.name };
}
