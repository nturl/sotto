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

  it('gives visitors a visible, accessible header route to add Sotto', () => {
    expect(html).toMatch(
      /<header>[\s\S]*?class="signin"[\s\S]*?class="install-action" href="#install" aria-label="Add to Home Screen"/,
    );
    expect(html).toMatch(/\.install-action\s*\{[\s\S]*?min-height:\s*44px;/);
    expect(html).toMatch(/@media \(display-mode: standalone\)[\s\S]*?\.install-action/);
  });

  it.each([
    {
      name: 'an iPhone',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      visible: 'ios',
    },
    {
      name: 'an iPad using a desktop user agent',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      maxTouchPoints: 5,
      visible: 'ios',
    },
    {
      name: 'a non-iOS browser',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
      maxTouchPoints: 0,
      visible: 'generic',
    },
  ])('shows $visible guidance for $name', ({ userAgent, maxTouchPoints, visible }) => {
    const script = html.match(/<script id="install-guidance">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    const blocks = Object.fromEntries(
      ['generic', 'ios', 'android', 'desktop'].map((name) => [
        name,
        { hidden: name !== 'generic' },
      ]),
    );
    vm.runInNewContext(script!, {
      navigator: { userAgent, maxTouchPoints },
      window: {},
      document: {
        getElementById: (id: string) =>
          blocks[id.replace('steps', '').toLowerCase() as keyof typeof blocks],
      },
    });
    Object.entries(blocks).forEach(([name, block]) => {
      expect(block.hidden).toBe(name !== visible);
    });
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
