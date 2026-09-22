import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

function worker(respond: () => Response = () => new Response('current app')) {
  const handlers = new Map<string, (event: unknown) => void>();
  const stored = new Map<string, Response>();
  const key = (request: string | { url: string }) =>
    new URL(typeof request === 'string' ? request : request.url, 'https://sotto.test').href;
  let online = true;
  let requests = 0;
  const cacheNames = new Set(['sotto-shell-100']);
  const opened: string[] = [];
  const cache = {
    match: async (request: string | { url: string }) => stored.get(key(request))?.clone(),
    put: async (request: string | { url: string }, response: Response) => {
      stored.set(key(request), response);
    },
  };
  stored.set('https://sotto.test/sw-manifest.json', Response.json({ version: '100' }));
  const context = vm.createContext({
    self: {
      location: { origin: 'https://sotto.test' },
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        handlers.set(name, handler);
      },
      clients: { claim: async () => {} },
    },
    caches: {
      keys: async () => [...cacheNames],
      open: async (name: string) => {
        cacheNames.add(name);
        opened.push(name);
        return cache;
      },
      delete: async (name: string) => cacheNames.delete(name),
    },
    fetch: async () => {
      requests++;
      if (!online) throw new Error('offline');
      return respond();
    },
    URL,
    Response,
    Headers,
    console,
  });
  vm.runInContext(readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8'), context);
  const drain = async (name: string, event: Record<string, unknown>) => {
    const waited: Promise<unknown>[] = [];
    handlers.get(name)!({ ...event, waitUntil: (p: Promise<unknown>) => waited.push(p) });
    await Promise.all(waited);
  };
  return {
    stored,
    offline: () => {
      online = false;
    },
    requests: () => requests,
    cacheNames: () => [...cacheNames].sort(),
    opened: () => opened,
    seed: (name: string) => cacheNames.add(name),
    activate: () => drain('activate', {}),
    cacheBook: (urls: string[]) => drain('message', { data: { type: 'cache-book', urls } }),
    load: (pathname: string, mode = 'navigate') => {
      let result: Promise<Response> | undefined;
      handlers.get('fetch')!({
        request: {
          url: `https://sotto.test${pathname}`,
          method: 'GET',
          mode,
          // A real navigation's destination is 'document' and a subresource's
          // is not; sw.js's cacheable() reads it, so the fake must carry it.
          destination: mode === 'navigate' ? 'document' : '',
          headers: new Headers(),
        },
        respondWith: (response: Promise<Response>) => {
          result = response;
        },
      });
      return result;
    },
  };
}

describe('installed app navigation', () => {
  it('loads the current online screen instead of an older saved checkout screen', async () => {
    const sw = worker();
    sw.stored.set('https://sotto.test/account?paid=1', new Response('old app'));
    expect(await (await sw.load('/account?paid=1'))!.text()).toBe('current app');
    expect(sw.requests()).toBe(1);
    sw.offline();
    expect(await (await sw.load('/account?paid=1'))!.text()).toBe('current app');
  });

  it('opens an unvisited reader route from the saved app shell offline', async () => {
    const sw = worker();
    sw.stored.set('https://sotto.test/app.html', new Response('offline app'));
    sw.offline();
    expect(await (await sw.load('/reader/es-palma-tradiciones'))!.text()).toBe('offline app');
  });

  it('keeps hashed assets cache-first and account API requests out of the shell cache', async () => {
    const sw = worker();
    sw.stored.set('https://sotto.test/_expo/static/app-123.js', new Response('saved script'));
    expect(await (await sw.load('/_expo/static/app-123.js', 'cors'))!.text()).toBe('saved script');
    expect(sw.requests()).toBe(0);
    expect(sw.load('/me', 'cors')).toBeUndefined();
  });
});

// vercel.json rewrites every unmatched path onto /app.html, so a file that is
// really missing answers 200 text/html instead of 404 and the cache-first
// handlers would freeze that HTML under the asset's own URL (C39, 2026-09-21).
describe('a missing file answered with the app shell', () => {
  const missing = () =>
    new Response('<!DOCTYPE html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });

  it('is not saved under the hashed asset URL that asked for it', async () => {
    const sw = worker(missing);
    const body = await (await sw.load('/_expo/static/app-999.js', 'cors'))!.text();
    expect(body).toContain('<!DOCTYPE html>');
    expect(sw.stored.has('https://sotto.test/_expo/static/app-999.js')).toBe(false);
  });

  it('is not saved under the chapter URL that asked for it', async () => {
    const sw = worker(missing);
    const chapter = '/content/packs/fr-FR/books/fr-chat-botte/chapters/99.json';
    await sw.load(chapter, 'cors');
    expect(sw.stored.has(`https://sotto.test${chapter}`)).toBe(false);
  });

  it('is not saved when the origin does answer a real 404', async () => {
    const sw = worker(() => new Response('gone', { status: 404 }));
    await sw.load('/_expo/static/app-999.js', 'cors');
    expect(sw.stored.has('https://sotto.test/_expo/static/app-999.js')).toBe(false);
  });

  it('leaves a real content response cached as before', async () => {
    const sw = worker(
      () =>
        new Response('{"id":"fr-chat-botte"}', { headers: { 'content-type': 'application/json' } }),
    );
    const book = '/content/packs/fr-FR/books/fr-chat-botte/book.json';
    await sw.load(book, 'cors');
    expect(sw.stored.has(`https://sotto.test${book}`)).toBe(true);
  });

  // A pack URL pasted into the address bar is a navigation, so it carries
  // destination 'document' — but the fetch handler routes /content/packs/**
  // to cacheFirst before it ever looks at the mode, so the exemption would
  // have frozen the app shell under that pack's own URL.
  it('is not saved when a pack URL is opened in the address bar', async () => {
    const sw = worker(missing);
    const chapter = '/content/packs/fr-FR/books/fr-chat-botte/chapters/01.json';
    await sw.load(chapter);
    expect(sw.stored.has(`https://sotto.test${chapter}`)).toBe(false);
  });

  it('still saves the shell a navigation returns, which is HTML by definition', async () => {
    const sw = worker(missing);
    await sw.load('/library');
    expect(sw.stored.has('https://sotto.test/library')).toBe(true);
  });
});

// The content cache was named with the SHELL build version, so a deploy that
// touched no book still evicted every chapter and mp3 a reader had available
// offline (C40, 2026-09-21).
describe('a deploy that changes no content', () => {
  const manifest = (version: string, contentVersion: number) => () =>
    Response.json({ version, contentVersion });

  it('keeps the content cache when only the shell version moved', async () => {
    const sw = worker(manifest('200', 7));
    sw.seed('sotto-content-7');
    await sw.activate();
    expect(sw.cacheNames()).toEqual(['sotto-content-7']);
  });

  it('drops the old content cache once the packs themselves change', async () => {
    const sw = worker(manifest('200', 9));
    sw.seed('sotto-content-7');
    await sw.activate();
    expect(sw.cacheNames()).toEqual([]);
  });

  it('caches a book under the content version, not the shell one', async () => {
    const sw = worker();
    sw.stored.set(
      'https://sotto.test/sw-manifest.json',
      Response.json({ version: '100', contentVersion: 7 }),
    );
    await sw.load('/content/packs/fr-FR/books/fr-chat-botte/book.json', 'cors');
    await sw.cacheBook(['/content/packs/fr-FR/books/fr-chat-botte/chapters/01.json']);
    expect(sw.opened()).toContain('sotto-content-7');
    expect(sw.opened()).not.toContain('sotto-content-100');
  });
});
