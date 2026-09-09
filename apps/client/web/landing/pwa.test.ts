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

describe('returning subscribers on the landing page', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const script = html.match(/<script id="subscriber-handoff">([\s\S]*?)<\/script>/)?.[1];

  function element(text: string, href: string) {
    return {
      textContent: text,
      href,
      getAttribute(name: string) {
        return name === 'href' ? this.href : null;
      },
      setAttribute(name: string, value: string) {
        if (name === 'href') this.href = value;
      },
    };
  }

  async function run(fetchImpl: ReturnType<typeof vi.fn>) {
    const signin = element('Sign in', 'https://app.readsotto.app/account');
    const offer = element(
      'Try the tutor free for 3 days',
      'https://app.readsotto.app/account?intent=start&returnTo=%2Fpaywall',
    );
    const listeners: Record<string, () => void> = {};
    const sandbox = {
      AbortController,
      clearTimeout,
      setTimeout,
      window: {
        fetch: fetchImpl,
        addEventListener: (name: string, listener: () => void) => {
          listeners[name] = listener;
        },
      },
      document: {
        hidden: false,
        querySelector: () => signin,
        querySelectorAll: () => [offer],
        addEventListener: (name: string, listener: () => void) => {
          listeners[name] = listener;
        },
      },
    };
    vm.runInNewContext(script!, sandbox);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { signin, offer, listeners };
  }

  it('uses the paid origin cookie to replace checkout offers for a subscriber', async () => {
    expect(script).toBeDefined();
    const fetchMock = vi.fn(async () => Response.json({ entitlement: { plan: 'standard' } }));
    const { signin, offer } = await run(fetchMock);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.readsotto.app/me',
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
    expect(signin).toMatchObject({
      textContent: 'Continue reading',
      href: 'https://app.readsotto.app/home',
    });
    expect(offer).toMatchObject({
      textContent: 'Continue reading',
      href: 'https://app.readsotto.app/home',
    });
  });

  it('keeps the visitor and sign-in routes for a browser with no paid session', async () => {
    const { signin, offer } = await run(vi.fn(async () => new Response(null, { status: 401 })));
    expect(signin).toMatchObject({
      textContent: 'Sign in',
      href: 'https://app.readsotto.app/account',
    });
    expect(offer.textContent).toContain('Try the tutor');
  });

  it('rechecks on focus and ignores an older response that settles last', async () => {
    let settleFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => {
      settleFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce(Response.json({ entitlement: { plan: 'standard' } }));
    const { signin, listeners } = await run(fetchMock);
    listeners.focus();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signin.textContent).toBe('Continue reading');
    settleFirst(Response.json({ entitlement: { plan: 'free' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signin.textContent).toBe('Continue reading');
  });

  it('restores visitor routes after a recognized subscriber signs out elsewhere', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ entitlement: { plan: 'standard' } }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const { signin, offer, listeners } = await run(fetchMock);
    expect(signin.textContent).toBe('Continue reading');
    listeners.focus();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signin.textContent).toBe('Sign in');
    expect(offer.textContent).toContain('Try the tutor');
  });
});
