/**
 * `trialOffer.ts` — the free build's Discuss gate quotes the live plan.
 *
 * React is replaced here by a ~40-line hook runtime (this repo has no
 * react-test-renderer or testing-library, and adding one was out of scope),
 * so `useTrialOffer` itself is exercised — first render and post-resolve —
 * rather than only the plain functions underneath it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanOffer, PlansResponse } from './types';

const h = vi.hoisted(() => {
  const state: unknown[] = [];
  const memo: { deps: readonly unknown[]; value: unknown }[] = [];
  const effect: { deps: readonly unknown[] | undefined }[] = [];
  const queued: (() => void)[] = [];
  let stateIndex = 0;
  let memoIndex = 0;
  let effectIndex = 0;

  const sameDeps = (a?: readonly unknown[], b?: readonly unknown[]): boolean =>
    !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

  const react = {
    useState(init: unknown) {
      const i = stateIndex++;
      if (state.length <= i) {
        state[i] = typeof init === 'function' ? (init as () => unknown)() : init;
      }
      const set = (next: unknown) => {
        state[i] =
          typeof next === 'function' ? (next as (prev: unknown) => unknown)(state[i]) : next;
      };
      return [state[i], set];
    },
    useEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
      const i = effectIndex++;
      const previous = effect[i];
      const skip = !!previous && sameDeps(previous.deps, deps);
      effect[i] = { deps };
      if (!skip) queued.push(() => void fn());
    },
    useMemo(fn: () => unknown, deps: readonly unknown[]) {
      const i = memoIndex++;
      const previous = memo[i];
      if (!previous || !sameDeps(previous.deps, deps)) memo[i] = { deps, value: fn() };
      return memo[i].value;
    },
  };

  return {
    react,
    reset() {
      state.length = 0;
      memo.length = 0;
      effect.length = 0;
      queued.length = 0;
    },
    /** One render pass: hook slots rewind, then queued effects flush. */
    render<T>(hook: () => T): T {
      stateIndex = 0;
      memoIndex = 0;
      effectIndex = 0;
      const value = hook();
      while (queued.length) queued.shift()?.();
      return value;
    },
  };
});

vi.mock('react', () => h.react);
vi.mock('../i18n/useT', () => ({ getUiCatalog: () => 'en' }));

const STANDARD: PlanOffer = {
  id: 'standard',
  name: 'Standard',
  priceUsd: 9.99,
  yearlyPriceUsd: 79,
  tutorMinutesCap: 300,
  importBooksCap: 3,
  provider: 'cascade-openai',
  appleProductId: 'app.sotto.standard.monthly',
  stripePriceId: 'price_standard_month',
};

const FREE: PlanOffer = {
  ...STANDARD,
  id: 'free',
  name: 'Free',
  priceUsd: 0,
  yearlyPriceUsd: 0,
};

function plansResponse(over: Partial<PlansResponse> = {}): PlansResponse {
  return { plans: [FREE, STANDARD], billing: 'stripe', ...over };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Fresh module graph per test: the plans fetch is cached for the whole app
 * session on purpose, so the cache has to be thrown away between cases. */
async function freshModule() {
  vi.resetModules();
  h.reset();
  return import('./trialOffer');
}

let consoleSpies: { mockRestore(): void }[] = [];

beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => {}),
  );
});

afterEach(() => {
  consoleSpies.forEach((spy) => spy.mockRestore());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function expectQuiet() {
  consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
}

describe('pickTrialOffer', () => {
  it('quotes the first plan priced above zero, skipping free', async () => {
    const { pickTrialOffer } = await freshModule();
    expect(pickTrialOffer(plansResponse({ trialDays: 7 }), 'en')).toEqual({
      monthly: '$9.99',
      yearly: '$79',
      days: 7,
    });
  });

  it('formats 9.99 as $9.99 and 79 as $79 (whole dollars lose the cents)', async () => {
    const { pickTrialOffer } = await freshModule();
    const offer = pickTrialOffer(plansResponse(), 'en');
    expect(offer.monthly).toBe('$9.99');
    expect(offer.yearly).toBe('$79');
  });

  it('formats a half-dollar price with both cents', async () => {
    const { pickTrialOffer } = await freshModule();
    const offer = pickTrialOffer(
      plansResponse({ plans: [{ ...STANDARD, priceUsd: 12.5, yearlyPriceUsd: 99 }] }),
      'en',
    );
    expect(offer).toEqual({ monthly: '$12.50', yearly: '$99', days: 3 });
  });

  it('formats for the interface locale, like the paywall does', async () => {
    const { pickTrialOffer } = await freshModule();
    expect(pickTrialOffer(plansResponse(), 'fr').monthly).toBe('9,99\u00a0$US');
  });

  it('falls back to 3 days when the server sends no trialDays', async () => {
    const { pickTrialOffer } = await freshModule();
    expect(pickTrialOffer(plansResponse(), 'en').days).toBe(3);
  });

  it('falls back to 3 days when trialDays is not a positive number', async () => {
    const { pickTrialOffer } = await freshModule();
    expect(pickTrialOffer(plansResponse({ trialDays: 0 }), 'en').days).toBe(3);
    expect(pickTrialOffer(plansResponse({ trialDays: -1 as unknown as number }), 'en').days).toBe(
      3,
    );
  });

  it('returns the whole fallback when no plan is priced', async () => {
    const { pickTrialOffer, FALLBACK_TRIAL_OFFER } = await freshModule();
    expect(pickTrialOffer(plansResponse({ plans: [] }), 'en')).toEqual(FALLBACK_TRIAL_OFFER);
    expect(pickTrialOffer(plansResponse({ plans: [FREE] }), 'en')).toEqual(FALLBACK_TRIAL_OFFER);
    expect(pickTrialOffer(null, 'en')).toEqual(FALLBACK_TRIAL_OFFER);
  });

  it('keeps the fallback yearly price when the priced plan has no annual price', async () => {
    const { pickTrialOffer, FALLBACK_TRIAL_OFFER } = await freshModule();
    const offer = pickTrialOffer(
      plansResponse({ plans: [{ ...STANDARD, yearlyPriceUsd: 0 }] }),
      'en',
    );
    expect(offer.yearly).toBe(FALLBACK_TRIAL_OFFER.yearly);
    expect(offer.monthly).toBe('$9.99');
  });

  it('FALLBACK_TRIAL_OFFER is the copy the catalogs shipped with', async () => {
    const { FALLBACK_TRIAL_OFFER } = await freshModule();
    expect(FALLBACK_TRIAL_OFFER).toEqual({ monthly: '$9.99', yearly: '$79', days: 3 });
  });
});

describe('resolveTrialOffer', () => {
  it('reads the live plan off /billing/plans with credentials omitted', async () => {
    const { resolveTrialOffer } = await freshModule();
    const fetchMock = vi.fn(async () => jsonResponse(200, plansResponse({ trialDays: 7 })));
    await expect(resolveTrialOffer('en', fetchMock as unknown as typeof fetch)).resolves.toEqual({
      monthly: '$9.99',
      yearly: '$79',
      days: 7,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://app.readsotto.app/billing/plans');
    expect(init.credentials).toBe('omit');
    expectQuiet();
  });

  it('falls back when the fetch rejects, and stays silent', async () => {
    const { resolveTrialOffer, FALLBACK_TRIAL_OFFER } = await freshModule();
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    await expect(resolveTrialOffer('en', fetchMock as unknown as typeof fetch)).resolves.toEqual(
      FALLBACK_TRIAL_OFFER,
    );
    expectQuiet();
  });

  it('falls back on a 500', async () => {
    const { resolveTrialOffer, FALLBACK_TRIAL_OFFER } = await freshModule();
    const fetchMock = vi.fn(async () => jsonResponse(500, { error: 'server_error' }));
    await expect(resolveTrialOffer('en', fetchMock as unknown as typeof fetch)).resolves.toEqual(
      FALLBACK_TRIAL_OFFER,
    );
    expectQuiet();
  });

  it('falls back on a body that is not a plans response', async () => {
    const { resolveTrialOffer, FALLBACK_TRIAL_OFFER } = await freshModule();
    const fetchMock = vi.fn(async () => jsonResponse(200, { nope: true }));
    await expect(resolveTrialOffer('en', fetchMock as unknown as typeof fetch)).resolves.toEqual(
      FALLBACK_TRIAL_OFFER,
    );
    expectQuiet();
  });

  it('aborts after 4 s and falls back', async () => {
    const { resolveTrialOffer, FALLBACK_TRIAL_OFFER } = await freshModule();
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pending = resolveTrialOffer('en', fetchMock as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(pending).resolves.toEqual(FALLBACK_TRIAL_OFFER);
    expect(fetchMock.mock.calls[0]?.[1].signal?.aborted).toBe(true);
    expectQuiet();
  });

  it('fetches once per app session, however many callers ask', async () => {
    const { resolveTrialOffer } = await freshModule();
    const fetchMock = vi.fn(async () => jsonResponse(200, plansResponse({ trialDays: 5 })));
    const first = await resolveTrialOffer('en', fetchMock as unknown as typeof fetch);
    const second = await resolveTrialOffer('en', fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second.days).toBe(5);
  });
});

describe('useTrialOffer', () => {
  it('returns the fallback on first render, then the live values', async () => {
    const mod = await freshModule();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          200,
          plansResponse({
            plans: [{ ...STANDARD, priceUsd: 12.5, yearlyPriceUsd: 99 }],
            trialDays: 7,
          }),
        ),
      ),
    );
    function Probe() {
      return mod.useTrialOffer();
    }
    expect(h.render(Probe)).toEqual(mod.FALLBACK_TRIAL_OFFER);
    await vi.waitFor(() =>
      expect(h.render(Probe)).toEqual({ monthly: '$12.50', yearly: '$99', days: 7 }),
    );
    expectQuiet();
  });

  it('keeps the fallback when the request fails', async () => {
    const mod = await freshModule();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    function Probe() {
      return mod.useTrialOffer();
    }
    expect(h.render(Probe)).toEqual(mod.FALLBACK_TRIAL_OFFER);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.render(Probe)).toEqual(mod.FALLBACK_TRIAL_OFFER);
    expectQuiet();
  });

  it('renders the live values straight away for a later mount in the same session', async () => {
    const mod = await freshModule();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, plansResponse({ trialDays: 7 }))),
    );
    function Probe() {
      return mod.useTrialOffer();
    }
    h.render(Probe);
    await vi.waitFor(() => expect(h.render(Probe).days).toBe(7));
    h.reset();
    expect(h.render(Probe)).toEqual({ monthly: '$9.99', yearly: '$79', days: 7 });
  });
});
