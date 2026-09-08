import { beforeEach, expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => new Map<string, string>());
vi.mock('../platform/persistence', () => ({
  persistence: {
    getItem: async (key: string) => saved.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      saved.set(key, value);
    },
  },
}));
beforeEach(() => {
  saved.clear();
  vi.resetModules();
});

it('can request later chapters after the app reloads', async () => {
  const firstSession = await import('./lazyNarrationRegistry');
  await firstSession.registerImportJob('private-story', 'hosted-job');
  vi.resetModules();
  const reopened = await import('./lazyNarrationRegistry');
  expect(await reopened.getImportJobId('private-story')).toBe('hosted-job');
});

it('does not retain a job after its saved mapping is removed', async () => {
  const registry = await import('./lazyNarrationRegistry');
  await registry.registerImportJob('private-story', 'hosted-job');
  saved.clear();
  expect(await registry.getImportJobId('private-story')).toBeUndefined();
});
