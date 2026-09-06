import { describe, expect, it } from 'vitest';
import { resolveRootDestination, resolveSignedInDestination } from './destination';

/**
 * Run 7 lane C, ground truth 4: the paid origin's root redirected on a local
 * `onboarded` flag alone, so "Sign in" from the landing page dropped a
 * stranger straight into onboarding with no account in sight. The account
 * state has to be part of the decision — but only where accounts exist, so
 * the free origin (NullCloud) keeps behaving exactly as it does today.
 */
describe('resolveRootDestination', () => {
  describe('with no cloud configured (the free origin, and every OSS build)', () => {
    it('is unchanged: onboarding, then home', () => {
      expect(
        resolveRootDestination({ cloudEnabled: false, me: 'no-cloud', onboarded: false }),
      ).toBe('/onboarding');
      expect(resolveRootDestination({ cloudEnabled: false, me: 'no-cloud', onboarded: true })).toBe(
        '/(tabs)/home',
      );
    });
  });

  describe('on the paid origin', () => {
    it('waits rather than guessing while the account state is still loading', () => {
      expect(resolveRootDestination({ cloudEnabled: true, me: 'loading', onboarded: false })).toBe(
        null,
      );
    });

    /**
     * A returning reader never waits on `/me`: they have already set the app
     * up, so home is right whatever the account state turns out to be, and
     * blocking on a network call here would put a spinner in front of the one
     * person who just wants to carry on reading.
     */
    it('does not wait when the learner has already onboarded', () => {
      expect(resolveRootDestination({ cloudEnabled: true, me: 'loading', onboarded: true })).toBe(
        '/(tabs)/home',
      );
    });

    it('sends a signed-out stranger to create an account, not into onboarding', () => {
      expect(
        resolveRootDestination({ cloudEnabled: true, me: 'signed-out', onboarded: false }),
      ).toBe('/account?intent=start');
    });

    it('leaves a guest who already onboarded alone', () => {
      expect(
        resolveRootDestination({ cloudEnabled: true, me: 'signed-out', onboarded: true }),
      ).toBe('/(tabs)/home');
    });

    it('sends a signed-in learner to onboarding, then to home', () => {
      expect(
        resolveRootDestination({ cloudEnabled: true, me: 'signed-in', onboarded: false }),
      ).toBe('/onboarding');
      expect(resolveRootDestination({ cloudEnabled: true, me: 'signed-in', onboarded: true })).toBe(
        '/(tabs)/home',
      );
    });
  });
});

/**
 * Where the magic link's completion screen goes. The server cannot decide
 * this: "onboarded" is a local preference, not an account fact.
 */
describe('resolveSignedInDestination', () => {
  it('finishes setup first when the learner has not onboarded', () => {
    expect(resolveSignedInDestination({ onboarded: false })).toBe('/onboarding');
  });

  it('otherwise goes home', () => {
    expect(resolveSignedInDestination({ onboarded: true })).toBe('/(tabs)/home');
  });

  it('prefers an explicit same-origin destination over both', () => {
    expect(resolveSignedInDestination({ onboarded: false, returnTo: '/library' })).toBe('/library');
    expect(resolveSignedInDestination({ onboarded: true, returnTo: '/reader/x' })).toBe(
      '/reader/x',
    );
  });

  it('ignores a destination that would leave this origin', () => {
    expect(resolveSignedInDestination({ onboarded: true, returnTo: 'https://evil.example' })).toBe(
      '/(tabs)/home',
    );
  });

  /** A link back to the completion screen would loop it forever. */
  it('never sends the completion screen back to itself', () => {
    expect(resolveSignedInDestination({ onboarded: true, returnTo: '/account/magic' })).toBe(
      '/(tabs)/home',
    );
  });
});
