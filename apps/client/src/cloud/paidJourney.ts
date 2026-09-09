import { CloudError, type Plan } from './types';
import { PAID_ORIGIN } from './paidOrigin';
import { safeReturnPath } from './returnTo';

const LEVELS = new Set(['A0', 'A1', 'A2', 'B1', 'B2', 'C1']);
const LEARNING_LOCALES = new Set([
  'en-US',
  'en-GB',
  'es-419',
  'es-ES',
  'fr-FR',
  'pt-BR',
  'pt-PT',
  'it-IT',
  'zh-CN',
  'zh-TW',
  'ro-RO',
  'ca-ES',
]);
const INTERFACE_LOCALES = new Set(['en', 'es', 'fr', 'pt', 'it', 'zh-Hans', 'zh-Hant', 'ro', 'ca']);
const EXPLANATION_LOCALES = new Set(['en', 'fr', 'es']);
const PUBLIC_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PASSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const TOKEN_ID = /^b[0-9]+\.s[0-9]+\.t[0-9]+$/;

export type PaidJourneyState =
  'pending' | 'sign-in' | 'unreachable' | 'available' | 'subscribed' | 'unavailable';

/** Stripe's 409 answer is stronger evidence than a briefly stale /me row. */
export function billingConfirmsSubscription(error: unknown): boolean {
  return error instanceof CloudError && error.code === 'subscription_exists';
}

/** The paywall may sell only after `/me` has positively identified a free
 * account. A standard/plus entitlement includes both trials and active paid
 * subscriptions, so neither can ever reach checkout again. */
export function paidJourneyState(
  status: 'no-cloud' | 'loading' | 'signed-out' | 'signed-in',
  plan?: Plan,
  signedOutReason?: 'unreachable',
  billingConfirmed = false,
): PaidJourneyState {
  if (billingConfirmed) return 'subscribed';
  if (status === 'no-cloud') return 'unavailable';
  if (status === 'loading') return 'pending';
  if (status === 'signed-out') return signedOutReason === 'unreachable' ? 'unreachable' : 'sign-in';
  return plan === 'free' ? 'available' : 'subscribed';
}

export function shouldPollCheckoutConfirmation(
  paidParam: string | undefined,
  confirmedPlan: Plan | null,
): boolean {
  return paidParam === '1' && (!confirmedPlan || confirmedPlan === 'free');
}

/** Resolves the account/paywall's reading CTA. Only an app-local path can
 * win, and a paywall destination is rejected to prevent a self-loop. */
export function readingDestination(
  raw: string | string[] | null | undefined,
  onboarded: boolean,
): string {
  const explicit = safeReturnPath(raw);
  const pathname = explicit?.split(/[?#]/, 1)[0];
  if (pathname && /^\/(?:read|reader|voice)\/[^/]+$/.test(pathname)) return explicit!;
  return onboarded ? '/(tabs)/home' : '/onboarding';
}

function readerPath(bookId: string): string | null {
  return PUBLIC_ID.test(bookId) && !bookId.startsWith('private-') ? `/read/${bookId}` : null;
}

export interface PaidReaderHandoff {
  bookId: string;
  learningLocale?: string;
  interfaceLocale?: string;
  explanationLocale?: string;
  level?: string;
  chapterId?: string;
  tokenId?: string;
  openTutor?: boolean;
}

export interface ParsedReaderHandoff {
  learningLocale?: string;
  interfaceLocale?: string;
  explanationLocale?: string;
  level?: 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  chapterId?: string;
  tokenId?: string;
  openTutor: boolean;
}

type ReaderLevel = NonNullable<ParsedReaderHandoff['level']>;

interface ReaderPreferenceFields {
  learningLocale: string;
  interfaceLocale: string;
  explanationLocale: string;
  level: ReaderLevel;
}

interface MergeReaderHandoffPreferencesInput {
  current: ReaderPreferenceFields & { onboarded: boolean };
  defaults: ReaderPreferenceFields;
  handoff: ParsedReaderHandoff;
  bookLocale: string;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the small, non-sensitive state carried across origins. Unsupported
 * locales/levels and passage ids that do not belong to this public book are
 * ignored rather than persisted. */
export function parseReaderHandoff(bookId: string, params: RawParams): ParsedReaderHandoff {
  if (!PUBLIC_ID.test(bookId) || bookId.startsWith('private-')) return { openTutor: false };
  const learning = first(params.learning);
  const interfaceLocale = first(params.interface);
  const explanation = first(params.explain);
  const level = first(params.level);
  const chapter = first(params.chapter);
  const token = first(params.token);
  const chapterId =
    chapter && PASSAGE_ID.test(chapter) && chapter.startsWith(`${bookId}-`) ? chapter : undefined;
  const tokenId = chapterId && token && TOKEN_ID.test(token) ? token : undefined;
  return {
    ...(learning && LEARNING_LOCALES.has(learning) ? { learningLocale: learning } : {}),
    ...(interfaceLocale && INTERFACE_LOCALES.has(interfaceLocale) ? { interfaceLocale } : {}),
    ...(explanation && EXPLANATION_LOCALES.has(explanation)
      ? { explanationLocale: explanation }
      : {}),
    ...(level && LEVELS.has(level) ? { level: level as ParsedReaderHandoff['level'] } : {}),
    ...(chapterId ? { chapterId } : {}),
    ...(tokenId ? { tokenId } : {}),
    openTutor: first(params.to) === 'tutor',
  };
}

/** A partial handoff updates only the values it carries. Browser-derived
 * defaults are for cold-start readers; they must not reset an onboarded
 * learner's language or level. */
export function mergeReaderHandoffPreferences({
  current,
  defaults,
  handoff,
  bookLocale,
}: MergeReaderHandoffPreferencesInput): ReaderPreferenceFields {
  const baseline = current.onboarded ? current : defaults;
  return {
    learningLocale: handoff.learningLocale === bookLocale ? handoff.learningLocale : bookLocale,
    interfaceLocale: handoff.interfaceLocale ?? baseline.interfaceLocale,
    explanationLocale: handoff.explanationLocale ?? baseline.explanationLocale,
    level: handoff.level ?? baseline.level,
  };
}

function normalizeHandoff(input: string | PaidReaderHandoff): PaidReaderHandoff {
  return typeof input === 'string' ? { bookId: input } : input;
}

function readerHandoffPath(input: string | PaidReaderHandoff): string | null {
  const handoff = normalizeHandoff(input);
  const path = readerPath(handoff.bookId);
  if (!path) return null;
  const url = new URL(path, PAID_ORIGIN);
  if (handoff.learningLocale && LEARNING_LOCALES.has(handoff.learningLocale))
    url.searchParams.set('learning', handoff.learningLocale);
  if (handoff.interfaceLocale && INTERFACE_LOCALES.has(handoff.interfaceLocale))
    url.searchParams.set('interface', handoff.interfaceLocale);
  if (handoff.explanationLocale && EXPLANATION_LOCALES.has(handoff.explanationLocale))
    url.searchParams.set('explain', handoff.explanationLocale);
  if (handoff.level && LEVELS.has(handoff.level)) url.searchParams.set('level', handoff.level);
  if (
    handoff.chapterId &&
    PASSAGE_ID.test(handoff.chapterId) &&
    handoff.chapterId.startsWith(`${handoff.bookId}-`)
  ) {
    url.searchParams.set('chapter', handoff.chapterId);
    if (handoff.tokenId && TOKEN_ID.test(handoff.tokenId))
      url.searchParams.set('token', handoff.tokenId);
  }
  if (handoff.openTutor) url.searchParams.set('to', 'tutor');
  return `${url.pathname}${url.search}`;
}

/** Existing subscribers arriving from the free origin can sign in and
 * continue the same bundled book. `/read` also selects that book's content
 * locale on a fresh paid-origin install. */
export function buildPaidAccountUrl(input: string | PaidReaderHandoff): string {
  const url = new URL('/account', PAID_ORIGIN);
  const destination = readerHandoffPath(input);
  if (destination) url.searchParams.set('returnTo', destination);
  return url.toString();
}

/** New subscribers carry the book through both nested handoffs:
 * account/magic-link -> paywall -> checkout/account. */
export function buildPaidTrialUrl(input: string | PaidReaderHandoff): string {
  const account = new URL('/account', PAID_ORIGIN);
  account.searchParams.set('intent', 'start');
  const destination = readerHandoffPath(input);
  if (destination) {
    const paywall = new URL('/paywall', PAID_ORIGIN);
    paywall.searchParams.set('returnTo', destination);
    account.searchParams.set('returnTo', `${paywall.pathname}${paywall.search}`);
  } else {
    account.searchParams.set('returnTo', '/paywall');
  }
  return account.toString();
}

/** Native's web-price link opens the hosted paywall while retaining the
 * same validated reader destination used by checkout. */
export function buildHostedPaywallUrl(plan: string, returnTo?: string | string[] | null): string {
  const url = new URL('/paywall', PAID_ORIGIN);
  url.searchParams.set('plan', plan);
  const destination = safeReturnPath(returnTo ?? null);
  if (destination) url.searchParams.set('returnTo', destination);
  return url.toString();
}
