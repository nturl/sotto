/**
 * The trial length and the prices the free build's Discuss gate quotes
 * (`FreeTutorChoices` in app/voice/[bookId].tsx).
 *
 * readsotto.app has no CloudAdapter, so the gate cannot ask `useCloud()` what
 * a subscription costs — but the paid service answers `GET /billing/plans`
 * to anyone, no auth, and that is the same row Stripe charges against. So the
 * gate reads it directly: a price change becomes a server change and nothing
 * else, instead of a copy edit in nine catalogs that someone will forget.
 *
 * The network is never load-bearing here. Every failure — offline, a 500, a
 * body that isn't a plans response, a request still open after four seconds —
 * resolves to `FALLBACK_TRIAL_OFFER`, silently: a stranger reading the gate
 * must not see a blank price, a spinner, or a console error, and the fallback
 * is today's real price, not a placeholder.
 */
import { useEffect, useMemo, useState } from 'react';
import { getUiCatalog } from '../i18n/useT';
import { PAID_ORIGIN } from './paidOrigin';
import { formatUsdCompact } from './priceFormat';
import type { PlansResponse } from './types';

export interface TrialOffer {
  /** Locale-formatted monthly price, e.g. "$9.99". */
  monthly: string;
  /** Locale-formatted yearly price, e.g. "$79". */
  yearly: string;
  /** Free-trial length in days. */
  days: number;
}

/**
 * The only hard-coded price left in the client: what the catalogs said in
 * words before this module existed, and what every failure path returns.
 * Update it when the real price changes, so an offline visitor is not quoted
 * a number the checkout will not honour.
 */
export const FALLBACK_TRIAL_OFFER: TrialOffer = { monthly: '$9.99', yearly: '$79', days: 3 };

const PLANS_URL = `${PAID_ORIGIN}/billing/plans`;
const TIMEOUT_MS = 4000;

/**
 * The offer a plans response describes, formatted for `locale`.
 *
 * Picks the first plan priced above zero — the same rule the paywall uses to
 * choose the card it shows (app/paywall/index.tsx), so the gate and the
 * paywall can never quote different plans.
 */
export function pickTrialOffer(
  response: PlansResponse | null | undefined,
  locale: string,
): TrialOffer {
  const plan = response?.plans?.find?.((p) => typeof p?.priceUsd === 'number' && p.priceUsd > 0);
  if (!plan) return FALLBACK_TRIAL_OFFER;
  const yearly =
    typeof plan.yearlyPriceUsd === 'number' && plan.yearlyPriceUsd > 0
      ? formatUsdCompact(plan.yearlyPriceUsd, locale)
      : FALLBACK_TRIAL_OFFER.yearly;
  return {
    monthly: formatUsdCompact(plan.priceUsd, locale),
    yearly,
    days: trialDaysOf(response),
  };
}

function trialDaysOf(response: PlansResponse | null | undefined): number {
  const days = response?.trialDays;
  return typeof days === 'number' && Number.isFinite(days) && days > 0
    ? Math.round(days)
    : FALLBACK_TRIAL_OFFER.days;
}

/** Resolved plans for this app session, once `/billing/plans` has answered. */
let loadedPlans: PlansResponse | null = null;
/** In-flight or settled request. Non-null means: never ask again this session. */
let plansRequest: Promise<PlansResponse | null> | null = null;

function currentPlans(): PlansResponse | null {
  return loadedPlans;
}

/**
 * Fetches `/billing/plans` at most once per app session. Resolves to null on
 * any failure; never rejects, never logs.
 */
export function loadTrialPlans(fetchImpl?: typeof fetch): Promise<PlansResponse | null> {
  plansRequest ??= requestPlans(fetchImpl).then((plans) => {
    loadedPlans = plans;
    return plans;
  });
  return plansRequest;
}

async function requestPlans(fetchImpl?: typeof fetch): Promise<PlansResponse | null> {
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // `credentials: 'omit'` — this is public price data read cross-origin
    // from the free build; it must not carry the paid client's session.
    const res = await doFetch(PLANS_URL, {
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isPlansResponse(body) ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isPlansResponse(body: unknown): body is PlansResponse {
  return (
    typeof body === 'object' && body !== null && Array.isArray((body as { plans?: unknown }).plans)
  );
}

/** `pickTrialOffer` over the live plans, for callers outside React. */
export async function resolveTrialOffer(
  locale: string,
  fetchImpl?: typeof fetch,
): Promise<TrialOffer> {
  return pickTrialOffer(await loadTrialPlans(fetchImpl), locale);
}

/**
 * The trial offer to print right now: the fallback on the first render of the
 * session, the live plan as soon as it lands, and re-formatted in place if
 * the interface language changes (the plans themselves are fetched once).
 */
export function useTrialOffer(): TrialOffer {
  const locale = getUiCatalog();
  const [plans, setPlans] = useState<PlansResponse | null>(currentPlans);
  useEffect(() => {
    let cancelled = false;
    void loadTrialPlans().then((next) => {
      if (!cancelled) setPlans(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(() => pickTrialOffer(plans, locale), [plans, locale]);
}
