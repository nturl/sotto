import { describe, expect, it } from 'vitest';
import { resolveAccountLanding } from './destination';
import { buildPaidTrialUrl } from './paidJourney';

/** Expo Router 57's inspected route parser reads search params with the URL
 * API. Preserve repeated values to match its string/string[] route shape. */
function parseQueryParams(path: string): Record<string, string | string[]> {
  const search = new URL(path, 'https://app.readsotto.app').searchParams;
  return Object.fromEntries(
    [...new Set(search.keys())].map((key) => {
      const values = search.getAll(key);
      return [key, values.length === 1 ? values[0]! : values];
    }),
  );
}

describe('nested reader destination through Account and Paywall', () => {
  const handoff = {
    bookId: 'es-palma-tradiciones',
    learningLocale: 'es-419',
    interfaceLocale: 'en',
    explanationLocale: 'fr',
    level: 'B1',
    chapterId: 'es-palma-tradiciones-03',
    tokenId: 'b2.s1.t1',
    openTutor: true,
  } as const;

  it('keeps every reader parameter after each installed-router parse', () => {
    const accountUrl = new URL(buildPaidTrialUrl(handoff));
    const accountParams = parseQueryParams(`${accountUrl.pathname}${accountUrl.search}`);
    const accountReturn = accountParams.returnTo as string;

    // Expo Router 57's local hook decodes this already-parsed value again.
    // That exposes the inner ampersands before navigation and loses fields.
    const overDecoded = decodeURIComponent(accountReturn);
    expect(parseQueryParams(overDecoded)).toMatchObject({
      interface: 'en',
      explain: 'fr',
      level: 'B1',
    });

    const paywallPath = resolveAccountLanding({
      me: 'signed-in',
      returnTo: accountReturn,
    });
    const paywallParams = parseQueryParams(paywallPath!);
    expect(paywallParams.returnTo).toBe(
      '/read/es-palma-tradiciones?learning=es-419&interface=en&explain=fr&level=B1&chapter=es-palma-tradiciones-03&token=b2.s1.t1&to=tutor',
    );
  });
});
