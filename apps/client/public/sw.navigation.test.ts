import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const stored = new Map<string, Response>();
  const key = (request: string | { url: string }) =>
    new URL(typeof request === 'string' ? request : request.url, 'https://sotto.test').href;
  let online = true;
  let requests = 0;
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
    },
    caches: { keys: async () => ['sotto-shell-100'], open: async () => cache },
    fetch: async () => {
      requests++;
      if (!online) throw new Error('offline');
      return new Response('current app');
    },
    URL,
    Response,
    Headers,
    console,
  });
  vm.runInContext(readFileSync(new URL('./sw.js', import.meta.url), 'utf8'), context);
  return {
    stored,
    offline: () => {
      online = false;
    },
    requests: () => requests,
    load: (pathname: string, mode = 'navigate') => {
      let result: Promise<Response> | undefined;
      handlers.get('fetch')!({
        request: {
          url: `https://sotto.test${pathname}`,
          method: 'GET',
          mode,
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
