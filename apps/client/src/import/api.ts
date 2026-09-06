/**
 * Client for apps/server's `/import` routes (planning/LEDGER.md
 * "R3-I Importer"): mirrors state/contentApi.ts's `serverUrl()` pattern.
 */
import { serverUrl } from '../state/contentApi';
import type { PickedFile } from './pickFile';
import type { BookLevel } from '../ui/dev/fixtures';

export interface StartImportOptions {
  locale: string;
  narrate: 'none' | 'first' | 'all';
  level?: BookLevel;
}

export interface StartImportResult {
  jobId?: string;
  error?: string;
  message?: string;
}

export async function startImportJob(
  file: PickedFile,
  opts: StartImportOptions,
): Promise<StartImportResult> {
  const form = new FormData();
  form.append('locale', opts.locale);
  form.append('narrate', opts.narrate);
  if (opts.level) form.append('level', opts.level);
  // Cast: TS's DOM lib types BlobPart as ArrayBufferView<ArrayBuffer>, but
  // Uint8Array is generic over ArrayBufferLike (can back a SharedArrayBuffer)
  // as of recent @types/node — a plain Uint8Array from file bytes always
  // has a real ArrayBuffer at runtime, so this is a type-system mismatch,
  // not a real behavior difference.
  const blob = new Blob([file.bytes as unknown as BlobPart]);
  form.append('file', blob, file.filename);

  const res = await fetch(`${serverUrl()}/import`, { method: 'POST', body: form });
  const body = (await res.json().catch(() => ({}))) as StartImportResult;
  if (!res.ok) return { error: body.error ?? `http_${res.status}`, message: body.message };
  return body;
}

export interface ImportJobEvent {
  stage: 'parsing' | 'detecting' | 'glossing' | 'translating' | 'narrating' | 'done';
  chapter?: number;
  totalChapters?: number;
  done: number;
  total: number;
  status?: 'running' | 'done' | 'error';
  error?: string;
}

/** Subscribes to a job's SSE progress stream (web: native EventSource).
 * Returns an unsubscribe function. On a platform without EventSource
 * (some native RN environments), falls back to short-interval polling of
 * the result endpoint so the progress screen still eventually resolves,
 * just without per-stage granularity. */
export function subscribeImportEvents(
  jobId: string,
  onEvent: (event: ImportJobEvent) => void,
): () => void {
  const EventSourceCtor = (globalThis as { EventSource?: typeof EventSource }).EventSource;
  if (EventSourceCtor) {
    const source = new EventSourceCtor(`${serverUrl()}/import/${jobId}/events`);
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data) as ImportJobEvent);
      } catch {
        // malformed event — ignore, the stream continues
      }
    };
    return () => source.close();
  }

  let cancelled = false;
  const poll = async (): Promise<void> => {
    if (cancelled) return;
    const res = await fetch(`${serverUrl()}/import/${jobId}/result`).catch(() => undefined);
    if (res?.status === 200) {
      onEvent({ stage: 'done', status: 'done', done: 1, total: 1 });
      return;
    }
    if (res?.status === 422) {
      onEvent({ stage: 'done', status: 'error', done: 0, total: 1 });
      return;
    }
    setTimeout(() => void poll(), 1500);
  };
  void poll();
  return () => {
    cancelled = true;
  };
}

export interface ImportJobResult {
  book: unknown;
  chapters: unknown[];
}

export async function fetchImportResult(jobId: string): Promise<ImportJobResult | null> {
  const res = await fetch(`${serverUrl()}/import/${jobId}/result`);
  if (!res.ok) return null;
  return (await res.json()) as ImportJobResult;
}

export async function fetchImportAudio(jobId: string, file: string): Promise<Uint8Array | null> {
  const res = await fetch(`${serverUrl()}/import/${jobId}/audio/${file}`);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function requestLazyNarration(jobId: string, chapterIndex: number): Promise<boolean> {
  const res = await fetch(`${serverUrl()}/import/${jobId}/narrate/${chapterIndex}`, {
    method: 'POST',
  });
  if (!res.ok) return false;
  const body = (await res.json().catch(() => ({}))) as { narrated?: boolean };
  return Boolean(body.narrated);
}
