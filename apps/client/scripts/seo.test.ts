import { describe, expect, it } from 'vitest';
import { NOINDEX_META, injectNoindex, isPaidClientBuild, robotsTxt, sitemapXml } from './seo.mjs';

describe('search-engine files of the web export', () => {
  it('recognises the paid client build by the cloud URL the Dockerfile bakes in', () => {
    expect(isPaidClientBuild({})).toBe(false);
    expect(isPaidClientBuild({ EXPO_PUBLIC_CLOUD_URL: '' })).toBe(false);
    expect(isPaidClientBuild({ EXPO_PUBLIC_CLOUD_URL: 'https://app.readsotto.app' })).toBe(true);
  });

  it('marks the app shell noindex once, never twice', () => {
    const shell = '<!doctype html><html><head><title>Sotto</title>\n  </head><body></body></html>';
    const once = injectNoindex(shell);
    expect(once).toContain(NOINDEX_META);
    expect(once.indexOf('</head>')).toBeGreaterThan(once.indexOf(NOINDEX_META));
    expect(injectNoindex(once)).toBe(once);
  });

  it('lets crawlers at the landing page on the free origin and points them at the sitemap', () => {
    const txt = robotsTxt({ paid: false });
    expect(txt.startsWith('User-agent: *\nAllow: /\n')).toBe(true);
    expect(txt).toContain('Disallow: /content/');
    expect(txt).toContain('Disallow: /_expo/');
    expect(txt).toContain('Sitemap: https://readsotto.app/sitemap.xml');
    expect(txt).not.toContain('Disallow: /\n');
  });

  it('closes the paid origin to crawlers entirely', () => {
    expect(robotsTxt({ paid: true })).toBe('User-agent: *\nDisallow: /\n');
  });

  it('lists only the landing page in the sitemap, with the build date', () => {
    const xml = sitemapXml({ lastmod: '2026-09-21' });
    expect(xml).toContain('<loc>https://readsotto.app/</loc>');
    expect(xml).toContain('<lastmod>2026-09-21</lastmod>');
    expect(xml.match(/<url>/g)).toHaveLength(1);
  });
});
