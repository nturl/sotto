/**
 * Content server client (CONTRACTS.md §2b, §5d): fetches packs/books/
 * chapters from `EXPO_PUBLIC_SERVER_URL` (apps/server's static
 * `/content/packs/**` route). Used only by the library slice.
 */
import type { Book, Chapter, License, Pack } from '@sotto/core';

/** `books/<bookId>/attribution.json` — per-book provenance for the four
 * independently-licensed pieces (CONTRACTS §2b, docs/attribution.md). */
export interface Attribution {
  schemaVersion: 1;
  bookId: string;
  text: {
    author: string;
    sourceEdition: string;
    sourceUrl: string;
    sourceJurisdiction: string;
    adaptationEditor: string;
    license: License;
  };
  glosses: { editor: string; license: License };
  cover: { generator: string; license: License };
  /** Absent for locales with no Kokoro voice (ro-RO, ca-ES) — those packs ship without narration audio. */
  audio?: { engine: string; license: License };
}

export function serverUrl(): string {
  const configured = process.env.EXPO_PUBLIC_SERVER_URL;
  if (configured) return configured;
  const loc = (globalThis as { location?: { hostname: string; origin: string } }).location;
  // Static web hosting (scripts/build-web.mjs -> Vercel, or anything else
  // serving dist/ as-is): build-web.mjs stamps this flag into dist/index.html,
  // so any static export resolves to its own origin regardless of hostname —
  // including `localhost`, which `npx serve dist`/`python -m http.server`
  // happily use and which the old hostname-only check mistook for the dev
  // server (docs/verification.md row 34's false "zero content cache" finding).
  if ((globalThis as { window?: { __SOTTO_STATIC__?: boolean } }).window?.__SOTTO_STATIC__) {
    if (loc) return loc.origin;
  }
  // Fallback for anyone loading the bundle without build-web.mjs (e.g.
  // `expo start --web`, which never stamps the flag above): the packs are
  // served from the page's own origin whenever the hostname isn't loopback.
  if (loc && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname)) return loc.origin;
  return 'http://localhost:8790';
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${serverUrl()}${path}`);
  if (!res.ok) throw new Error(`content fetch failed: ${path} (${res.status})`);
  return (await res.json()) as T;
}

export function fetchPacks(): Promise<Pack[]> {
  return fetchJson<Pack[]>('/content/packs');
}

export function fetchBook(locale: string, bookId: string): Promise<Book> {
  return fetchJson<Book>(`/content/packs/${locale}/books/${bookId}/book.json`);
}

export function fetchChapter(locale: string, bookId: string, file: string): Promise<Chapter> {
  return fetchJson<Chapter>(`/content/packs/${locale}/books/${bookId}/${file}`);
}

export function fetchAttribution(locale: string, bookId: string): Promise<Attribution> {
  return fetchJson<Attribution>(`/content/packs/${locale}/books/${bookId}/attribution.json`);
}

/** Resolves an asset path (cover.svg, audio/01.mp3) relative to a book's
 * pack directory into an absolute URL the client can fetch/play. */
export function assetUrl(locale: string, bookId: string, relativePath: string): string {
  return `${serverUrl()}/content/packs/${locale}/books/${bookId}/${relativePath}`;
}

/** Mirrors the server's `GET /health` response (apps/server/src/app.ts):
 * `ok` is always true when the request succeeds, `stt`/`llm`/`tts` are
 * per-service reachability booleans (each probed with a 2s timeout
 * server-side), and `vad` names the active VAD backend. */
export interface Health {
  ok: boolean;
  stt: boolean;
  llm: boolean;
  tts: boolean;
  vad: string;
}

/** Probes the server's `/health` endpoint so the voice screen can decide
 * whether to start a tutor session at all, rather than attempting one that
 * silently fails. Never throws — any network error, timeout, non-2xx
 * status, or unparsable body resolves to `null`. */
export async function fetchHealth(timeoutMs = 4000): Promise<Health | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${serverUrl()}/health`, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as Health;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
