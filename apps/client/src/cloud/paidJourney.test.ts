import { describe, expect, it } from 'vitest';
import { CloudError } from './types';
import {
  billingConfirmsSubscription,
  buildHostedPaywallUrl,
  buildPaidAccountUrl,
  buildPaidTrialUrl,
  mergeReaderHandoffPreferences,
  parseReaderHandoff,
  paidJourneyState,
  readingDestination,
  shouldPollCheckoutConfirmation,
} from './paidJourney';

it('recognises the server response that confirms an existing subscription', () => {
  expect(
    billingConfirmsSubscription(
      new CloudError('subscription_exists', 'You already have a subscription.', 409),
    ),
  ).toBe(true);
  expect(billingConfirmsSubscription(new CloudError('checkout_pending', 'Wait.', 409))).toBe(false);
  expect(billingConfirmsSubscription(new Error('subscription_exists'))).toBe(false);
});

describe('paidJourneyState', () => {
  it('recognises every non-free entitlement before offering checkout', () => {
    expect(paidJourneyState('signed-in', 'standard')).toBe('subscribed');
    expect(paidJourneyState('signed-in', 'plus')).toBe('subscribed');
  });

  it('only offers checkout after a confirmed free entitlement', () => {
    expect(paidJourneyState('signed-in', 'free')).toBe('available');
    expect(paidJourneyState('loading')).toBe('pending');
    expect(paidJourneyState('signed-out')).toBe('sign-in');
    expect(paidJourneyState('signed-out', undefined, 'unreachable')).toBe('unreachable');
    expect(paidJourneyState('no-cloud')).toBe('unavailable');
  });

  it('trusts an authoritative already-subscribed billing response over a stale free /me', () => {
    expect(paidJourneyState('signed-in', 'free', undefined, true)).toBe('subscribed');
  });
});

it('stops checkout-return polling as soon as a paid plan is confirmed', () => {
  expect(shouldPollCheckoutConfirmation('1', null)).toBe(true);
  expect(shouldPollCheckoutConfirmation('1', 'free')).toBe(true);
  expect(shouldPollCheckoutConfirmation('1', 'standard')).toBe(false);
  expect(shouldPollCheckoutConfirmation('1', 'plus')).toBe(false);
  expect(shouldPollCheckoutConfirmation(undefined, null)).toBe(false);
});

describe('readingDestination', () => {
  it('continues to the carried reader destination', () => {
    expect(readingDestination('/read/es-palma-tradiciones', false)).toBe(
      '/read/es-palma-tradiciones',
    );
  });

  it('falls back to setup or home when checkout carried no reader', () => {
    expect(readingDestination(null, false)).toBe('/onboarding');
    expect(readingDestination(null, true)).toBe('/(tabs)/home');
  });

  it('never follows an off-origin or paywall-loop destination', () => {
    expect(readingDestination('https://evil.example', true)).toBe('/(tabs)/home');
    expect(readingDestination('/paywall', true)).toBe('/(tabs)/home');
    expect(readingDestination('/paywall?returnTo=%2Fpaywall', false)).toBe('/onboarding');
    expect(readingDestination('/account', true)).toBe('/(tabs)/home');
    expect(readingDestination('/account/magic', false)).toBe('/onboarding');
    expect(readingDestination('/usage', true)).toBe('/(tabs)/home');
  });
});

describe('free-to-paid tutor links', () => {
  it('carries the selected book through sign-in and paywall', () => {
    const url = new URL(
      buildPaidTrialUrl({
        bookId: 'es-palma-tradiciones',
        learningLocale: 'es-419',
        interfaceLocale: 'en',
        explanationLocale: 'fr',
        level: 'B1',
        chapterId: 'es-palma-tradiciones-03',
        tokenId: 'b2.s1.t1',
        openTutor: true,
      }),
    );
    expect(url.origin).toBe('https://app.readsotto.app');
    expect(url.pathname).toBe('/account');
    expect(url.searchParams.get('intent')).toBe('start');

    const paywall = new URL(url.searchParams.get('returnTo')!, url.origin);
    expect(paywall.pathname).toBe('/paywall');
    const reader = new URL(paywall.searchParams.get('returnTo')!, url.origin);
    expect(reader.pathname).toBe('/read/es-palma-tradiciones');
    expect(Object.fromEntries(reader.searchParams)).toEqual({
      learning: 'es-419',
      interface: 'en',
      explain: 'fr',
      level: 'B1',
      chapter: 'es-palma-tradiciones-03',
      token: 'b2.s1.t1',
      to: 'tutor',
    });
  });

  it('gives an existing subscriber a direct door to the same book', () => {
    const url = new URL(buildPaidAccountUrl('es-palma-tradiciones'));
    expect(url.pathname).toBe('/account');
    expect(url.searchParams.get('returnTo')).toBe('/read/es-palma-tradiciones');
  });

  it('does not carry unrecognised or private book identifiers', () => {
    const url = new URL(buildPaidAccountUrl('book/with?delimiters'));
    expect(url.searchParams.has('returnTo')).toBe(false);
    expect(new URL(buildPaidTrialUrl('private-my-upload')).searchParams.get('returnTo')).toBe(
      '/paywall',
    );
  });

  it('keeps the reader destination when iOS hands checkout to the web paywall', () => {
    const url = new URL(
      buildHostedPaywallUrl('standard', '/read/es-palma-tradiciones?chapter=chapter-03'),
    );
    expect(url.pathname).toBe('/paywall');
    expect(url.searchParams.get('plan')).toBe('standard');
    expect(url.searchParams.get('returnTo')).toBe('/read/es-palma-tradiciones?chapter=chapter-03');

    expect(
      new URL(buildHostedPaywallUrl('standard', 'https://evil.example/read')).searchParams.has(
        'returnTo',
      ),
    ).toBe(false);
  });
});

describe('parseReaderHandoff', () => {
  it('accepts only the supported preferences and structured passage ids', () => {
    expect(
      parseReaderHandoff('es-palma-tradiciones', {
        learning: 'es-419',
        interface: 'en',
        explain: 'fr',
        level: 'B1',
        chapter: 'es-palma-tradiciones-03',
        token: 'b2.s1.t1',
        to: 'tutor',
      }),
    ).toEqual({
      learningLocale: 'es-419',
      interfaceLocale: 'en',
      explanationLocale: 'fr',
      level: 'B1',
      chapterId: 'es-palma-tradiciones-03',
      tokenId: 'b2.s1.t1',
      openTutor: true,
    });
  });

  it('drops unsupported preferences and passage ids from another book', () => {
    expect(
      parseReaderHandoff('es-palma-tradiciones', {
        learning: 'xx',
        interface: 'not-a-catalog',
        explain: 'de',
        level: 'D9',
        chapter: 'another-book-01',
        token: 'another-book-01.s1.t1',
        to: 'elsewhere',
      }),
    ).toEqual({ openTutor: false });
  });
});

describe('mergeReaderHandoffPreferences', () => {
  const current = {
    onboarded: true,
    learningLocale: 'es-419',
    interfaceLocale: 'es',
    explanationLocale: 'fr',
    level: 'B1' as const,
  };
  const defaults = {
    learningLocale: 'fr-FR',
    interfaceLocale: 'en',
    explanationLocale: 'en',
    level: 'A1' as const,
  };

  it('preserves an onboarded learner’s unspecified preferences on a partial handoff', () => {
    expect(
      mergeReaderHandoffPreferences({
        current,
        defaults,
        handoff: { chapterId: 'es-palma-tradiciones-03', openTutor: true },
        bookLocale: 'es-419',
      }),
    ).toEqual({
      learningLocale: 'es-419',
      interfaceLocale: 'es',
      explanationLocale: 'fr',
      level: 'B1',
    });
  });

  it('uses fast-path defaults only for a learner who has not onboarded', () => {
    expect(
      mergeReaderHandoffPreferences({
        current: { ...current, onboarded: false },
        defaults,
        handoff: { openTutor: false },
        bookLocale: 'es-419',
      }),
    ).toEqual({
      learningLocale: 'es-419',
      interfaceLocale: 'en',
      explanationLocale: 'en',
      level: 'A1',
    });
  });
});
