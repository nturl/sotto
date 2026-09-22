import { describe, expect, it, vi } from 'vitest';
import { goBackOr } from './goBackOr';

describe('goBackOr', () => {
  it('pops the stack when the screen was pushed', () => {
    const router = { canGoBack: () => true, back: vi.fn(), replace: vi.fn() };
    goBackOr(router, '/(tabs)/home');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces with the fallback on a cold load, where back() would no-op', () => {
    const router = { canGoBack: () => false, back: vi.fn(), replace: vi.fn() };
    goBackOr(router, '/(tabs)/vocabulary');
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/vocabulary');
    expect(router.back).not.toHaveBeenCalled();
  });
});
