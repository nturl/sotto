/**
 * Web file picker for the import flow (planning/design/IMPORT.md §2): a
 * hidden `<input type="file">`, same pattern as platform/importExport.web.ts's
 * `importJson`, filtered to the three supported formats.
 */
export interface PickedFile {
  bytes: Uint8Array;
  filename: string;
}

export function pickImportFile(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.epub,.txt,.md,.markdown';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (result instanceof ArrayBuffer) {
          resolve({ bytes: new Uint8Array(result), filename: file.name });
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    };
    input.click();
  });
}
