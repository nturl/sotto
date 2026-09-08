import { expect, it } from 'vitest';
import { selectedPath } from './selectedPath';
it('key tests never silently substitute another provider', () => {
  expect(
    selectedPath(
      { status: 'ready', path: 'browser', alternatives: ['browser', 'byok', 'cloud'] },
      'byok',
    ),
  ).toBe('byok');
  expect(selectedPath({ status: 'ready', path: 'cloud' }, 'byok')).toBeUndefined();
});
it('offers included Cloud by default and preserves an intentional free/key choice', () => {
  const available = {
    status: 'ready' as const,
    path: 'browser' as const,
    alternatives: ['browser', 'cloud', 'byok'] as const,
  };
  const state = { ...available, alternatives: [...available.alternatives] };
  expect(selectedPath(state)).toBe('cloud');
  expect(selectedPath(state, 'browser')).toBe('browser');
  expect(selectedPath(state, 'byok')).toBe('byok');
});
