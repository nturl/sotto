import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('installing from the landing page', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

  it('uses the app manifest so the home-screen icon launches the reader entry point', () => {
    expect(html).toMatch(/<link\s+rel="manifest"\s+href="\/manifest.webmanifest"\s*\/?\s*>/);
  });

  it('names the iPhone app Sotto independently of the marketing page title', () => {
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Sotto" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
  });

  it.each([
    { iosStandalone: true, displayStandalone: false, redirect: true },
    { iosStandalone: false, displayStandalone: true, redirect: true },
    { iosStandalone: false, displayStandalone: false, redirect: false },
  ])('opens the app for existing installed shortcuts: %j', (mode) => {
    const script = html.match(/<script id="installed-app-entry">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    const replace = vi.fn();
    vm.runInNewContext(script!, {
      navigator: { standalone: mode.iosStandalone },
      window: { matchMedia: () => ({ matches: mode.displayStandalone }), location: { replace } },
    });
    if (mode.redirect) expect(replace).toHaveBeenCalledWith('/start');
    else expect(replace).not.toHaveBeenCalled();
  });
});
