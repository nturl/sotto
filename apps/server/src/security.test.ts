import { describe, expect, it } from 'vitest';
import { RateLimiter, isBasicAuthValid, isOriginAllowed, parseAllowedOrigins } from './security.js';

describe('parseAllowedOrigins', () => {
  it('splits a comma-separated env value into trimmed origins', () => {
    expect(parseAllowedOrigins('http://a, http://b ,http://c', 'fallback')).toEqual([
      'http://a',
      'http://b',
      'http://c',
    ]);
  });

  it('falls back when the env value is unset or blank', () => {
    expect(parseAllowedOrigins(undefined, 'http://fallback')).toEqual(['http://fallback']);
    expect(parseAllowedOrigins('   ', 'http://fallback')).toEqual(['http://fallback']);
  });
});

describe('isOriginAllowed', () => {
  const allowed = ['http://localhost:8081', 'http://127.0.0.1:8081', 'http://localhost:8082'];

  it('allows an absent origin (native clients send none)', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
    expect(isOriginAllowed(null, allowed)).toBe(true);
  });

  it('allows an origin on the explicit allowlist', () => {
    expect(isOriginAllowed('http://localhost:8081', allowed)).toBe(true);
  });

  it('allows any localhost/127.0.0.1 origin regardless of port', () => {
    expect(isOriginAllowed('http://localhost:19006', allowed)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3000', allowed)).toBe(true);
  });

  it('rejects a browser origin that is neither allowlisted nor localhost', () => {
    expect(isOriginAllowed('http://evil.example', allowed)).toBe(false);
    expect(isOriginAllowed('https://sotto.app', allowed)).toBe(false);
  });

  it('rejects a host that merely contains "localhost" as a substring', () => {
    expect(isOriginAllowed('http://localhost.evil.example', allowed)).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('allows up to maxPerWindow calls per key, then rejects', () => {
    const now = 0;
    const limiter = new RateLimiter(3, 60_000, () => now);
    expect(limiter.allow('1.2.3.4')).toBe(true);
    expect(limiter.allow('1.2.3.4')).toBe(true);
    expect(limiter.allow('1.2.3.4')).toBe(true);
    expect(limiter.allow('1.2.3.4')).toBe(false);
  });

  it('tracks separate budgets per key', () => {
    const limiter = new RateLimiter(1);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('b')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
  });

  it('resets once the window has passed', () => {
    let now = 0;
    const limiter = new RateLimiter(1, 1000, () => now);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
    now = 1001;
    expect(limiter.allow('a')).toBe(true);
  });
});

describe('isBasicAuthValid', () => {
  const encode = (creds: string) => `Basic ${Buffer.from(creds).toString('base64')}`;

  it('accepts a matching Basic header', () => {
    expect(isBasicAuthValid(encode('sotto:demo-only'), 'sotto:demo-only')).toBe(true);
  });

  it('rejects a mismatched credential', () => {
    expect(isBasicAuthValid(encode('sotto:wrong'), 'sotto:demo-only')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isBasicAuthValid(undefined, 'sotto:demo-only')).toBe(false);
  });

  it('rejects a non-Basic scheme', () => {
    expect(isBasicAuthValid('Bearer sometoken', 'sotto:demo-only')).toBe(false);
  });

  it('rejects malformed base64 without throwing', () => {
    expect(isBasicAuthValid('Basic ***not-base64***', 'sotto:demo-only')).toBe(false);
  });
});
