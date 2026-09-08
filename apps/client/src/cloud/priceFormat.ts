/**
 * The one place a USD plan price becomes a string.
 *
 * Extracted from the paywall's `priceLabel` (app/paywall/index.tsx) when the
 * free build's Discuss gate started quoting the live plan too: two screens
 * printing the same number must not each carry their own `Intl.NumberFormat`
 * call, or a currency or rounding decision changes in one and not the other.
 *
 * Two shapes, deliberately:
 *  - `formatUsd` is the paywall's, unchanged — always cents, so the card and
 *    the Stripe/Apple confirmation line agree down to the last digit.
 *  - `formatUsdCompact` is for prose ("$79 a year"), where a whole-dollar
 *    price written "$79.00" reads like a form field. Cents still show when
 *    there are any ($9.99, $12.50).
 */

/** Locale-formatted USD, always with cents: 79 -> "$79.00". */
export function formatUsd(amountUsd: number, locale: string): string {
  return format(amountUsd, locale, 2);
}

/** Locale-formatted USD for prose: 79 -> "$79", 12.5 -> "$12.50". */
export function formatUsdCompact(amountUsd: number, locale: string): string {
  return format(amountUsd, locale, Number.isInteger(amountUsd) ? 0 : 2);
}

function format(amountUsd: number, locale: string, fractionDigits: number): string {
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  };
  try {
    return new Intl.NumberFormat(locale, options).format(amountUsd);
  } catch {
    // A locale tag ICU cannot parse is not a reason to show no price at all.
    return new Intl.NumberFormat('en', options).format(amountUsd);
  }
}
