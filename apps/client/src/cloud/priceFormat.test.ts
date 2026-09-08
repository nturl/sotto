/**
 * The currency formatter the paywall's `priceLabel` and the free build's
 * trial gate now share.
 */
import { describe, expect, it } from 'vitest';
import { formatUsd, formatUsdCompact } from './priceFormat';

describe('formatUsd', () => {
  it('keeps the paywall exactly as it reads today: always two decimals', () => {
    expect(formatUsd(9.99, 'en')).toBe('$9.99');
    expect(formatUsd(79, 'en')).toBe('$79.00');
  });

  it('formats for the interface locale', () => {
    expect(formatUsd(9.99, 'fr')).toBe('9,99\u00a0$US');
    expect(formatUsd(9.99, 'zh-Hans')).toBe('US$9.99');
  });

  it('falls back to en for a locale ICU cannot parse', () => {
    expect(formatUsd(9.99, 'not a locale')).toBe('$9.99');
  });
});

describe('formatUsdCompact', () => {
  it('drops the cents on a whole-dollar price, keeps them otherwise', () => {
    expect(formatUsdCompact(79, 'en')).toBe('$79');
    expect(formatUsdCompact(99, 'en')).toBe('$99');
    expect(formatUsdCompact(9.99, 'en')).toBe('$9.99');
    expect(formatUsdCompact(12.5, 'en')).toBe('$12.50');
  });

  it('formats for the interface locale', () => {
    expect(formatUsdCompact(79, 'fr')).toBe('79\u00a0$US');
  });
});
