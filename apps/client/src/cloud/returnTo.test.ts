import { describe, expect, it } from 'vitest';
import { safeReturnPath, signInReturnTo } from './returnTo';

/**
 * Run 7 lane C. The client half of sotto-cloud's `src/auth/returnTo.ts`: the
 * screen that asks for a sign-in link decides where the link should land, and
 * a destination that could leave this origin must never be sent at all. The
 * server refuses one anyway (400) — this is the same rule applied before the
 * request, so a stray `?returnTo=` in the address bar degrades to the default
 * instead of failing the send.
 */
describe('safeReturnPath', () => {
  it('keeps a path on this origin', () => {
    expect(safeReturnPath('/onboarding')).toBe('/onboarding');
    expect(safeReturnPath('/reader/en-oz-cyclone')).toBe('/reader/en-oz-cyclone');
    expect(safeReturnPath('/account?intent=start')).toBe('/account?intent=start');
  });

  it('refuses anything that could leave this origin', () => {
    for (const raw of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'sotto://account',
      'library',
      '',
      '/%2f%2fevil.example',
      '/path with spaces',
    ]) {
      expect(safeReturnPath(raw), raw).toBeNull();
    }
  });

  it('accepts the first value of a repeated query param and rejects other shapes', () => {
    expect(safeReturnPath(['/library', '/onboarding'])).toBe('/library');
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath(42 as unknown as string)).toBeNull();
  });
});

describe('signInReturnTo', () => {
  it('uses an explicit destination when the caller was sent here from somewhere', () => {
    expect(signInReturnTo('/reader/en-oz-cyclone')).toBe('/reader/en-oz-cyclone');
  });

  /**
   * With nothing explicit, the link lands on the completion screen rather than
   * on /account: only the client knows whether this learner has onboarded, so
   * that screen is where the choice between /onboarding and home is made.
   */
  it('defaults to the completion screen, which then decides', () => {
    expect(signInReturnTo(undefined)).toBe('/account/magic');
    expect(signInReturnTo('')).toBe('/account/magic');
  });

  it('falls back to the default rather than forwarding an off-origin destination', () => {
    expect(signInReturnTo('https://evil.example')).toBe('/account/magic');
    expect(signInReturnTo('//evil.example')).toBe('/account/magic');
  });
});
