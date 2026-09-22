import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The landing page is the one Sotto page meant to rank (scripts/seo.mjs).
 * These pin the head tags that keep it that way.
 */
describe('the landing page as search engines read it', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));

  it('names the apex as canonical, so www and the vercel.app alias collapse onto it', () => {
    expect(head).toMatch(/<link\s+rel="canonical"\s+href="https:\/\/readsotto\.app\/"\s*\/>/);
  });

  it('is indexable itself: the noindex the app shell carries is never here', () => {
    expect(head).not.toMatch(/name="robots"/);
  });

  it('describes the app to search engines as structured data', () => {
    const match = head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1]!);
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('WebApplication');
    expect(data.name).toBe('Sotto');
    expect(data.url).toBe('https://readsotto.app/');
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.sameAs).toContain('https://github.com/nturl/sotto');
  });

  it('keeps the share card and the page describing the same thing', () => {
    const description = head.match(/name="description"\s+content="([^"]+)"/)?.[1];
    const ogDescription = head.match(/property="og:description"\s+content="([^"]+)"/)?.[1];
    const twitterDescription = head.match(/name="twitter:description"\s+content="([^"]+)"/)?.[1];
    expect(description).toBeTruthy();
    expect(ogDescription).toBeTruthy();
    expect(twitterDescription).toBe(ogDescription);
  });
});
