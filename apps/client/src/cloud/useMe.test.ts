/**
 * `useMe` — a failed `GET /me` must not be reported as a logout.
 *
 * A paying subscriber whose /me request fails (offline, DNS, a 502 at the
 * edge) used to land on 'signed-out', which is what makes the voice screen
 * offer "Subscribe" and "Use your own OpenAI key" to someone who already
 * pays. Only a 401 means "no session"; everything else is a connection
 * problem and has to say so — while still failing the cloud gate, since an
 * unknown entitlement is not a usable one.
 *
 * React is replaced here by the same small hook runtime trialOffer.test.ts
 * uses (this repo has no react-test-renderer or testing-library), so the
 * hook itself is exercised rather than a helper underneath it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudPathUsable } from '../voice/availability';
import { CloudError, type Me } from './types';
import { useMe } from './useMe';

const h = vi.hoisted(() => {
  const state: unknown[] = [];
  const effect: { deps: readonly unknown[] | undefined }[] = [];
  const queued: (() => void)[] = [];
  let stateIndex = 0;
  let effectIndex = 0;
  let adapter: { enabled: boolean; me: () => Promise<unknown> } = {
    enabled: true,
    me: () => Promise.resolve(null),
  };

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
  };

  return {
    react,
    provider: { useCloud: () => adapter },
    setAdapter(next: { enabled: boolean; me: () => Promise<unknown> }) {
      adapter = next;
    },
    reset() {
      state.length = 0;
      effect.length = 0;
      queued.length = 0;
    },
    /** One render pass: hook slots rewind, then queued effects flush. */
    render<T>(hook: () => T): T {
      stateIndex = 0;
      effectIndex = 0;
      const value = hook();
      while (queued.length) queued.shift()?.();
      return value;
    },
  };
});

vi.mock('react', () => h.react);
vi.mock('./provider', () => h.provider);

const ME: Me = {
  user: { id: 'u1', email: 'reader@example.com' },
  entitlement: {
    plan: 'standard',
    tutorMinutesCap: 300,
    tutorMinutesUsed: 12,
    tutorMinutesRemaining: 288,
    importBooksCap: 3,
    importsUsed: 0,
    renewsAt: null,
    provider: 'cascade-openai',
  },
};

/** Renders once, lets the `me()` promise settle and its effect run, then
 * renders again to read the state that settled. The module graph is left
 * alone on purpose: `useMe` caches nothing at module scope, and reloading
 * it would hand it a second `CloudError` class that its own `instanceof`
 * check could never match. */
async function settle(me: () => Promise<unknown>) {
  h.reset();
  h.setAdapter({ enabled: true, me });
  h.render(() => useMe());
  await new Promise((resolve) => setTimeout(resolve, 0));
  return h.render(() => useMe());
}

beforeEach(() => {
  h.reset();
});

describe('useMe', () => {
  it('reports a signed-in learner', async () => {
    const state = await settle(() => Promise.resolve(ME));
    expect(state.status).toBe('signed-in');
  });

  it('reports a plain signed-out learner when the adapter answers null', async () => {
    const state = await settle(() => Promise.resolve(null));
    expect(state).toMatchObject({ status: 'signed-out' });
    expect(state).not.toHaveProperty('reason');
  });

  it('reports a thrown 401 as a plain sign-out, with no connection blame', async () => {
    const state = await settle(() =>
      Promise.reject(new CloudError('unauthorized', 'No session.', 401)),
    );
    expect(state).toMatchObject({ status: 'signed-out' });
    expect(state).not.toHaveProperty('reason');
  });

  it('marks a network failure unreachable rather than signed out', async () => {
    const state = await settle(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(state).toMatchObject({ status: 'signed-out', reason: 'unreachable' });
  });

  it('marks a 502 unreachable — a bad gateway is not a logout', async () => {
    const state = await settle(() =>
      Promise.reject(new CloudError('http_502', 'Request failed (502).', 502)),
    );
    expect(state).toMatchObject({ status: 'signed-out', reason: 'unreachable' });
  });

  it('still fails the cloud gate while unreachable: an unknown plan is not a usable one', async () => {
    const state = await settle(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(cloudPathUsable(state)).toBe(false);
  });
});
