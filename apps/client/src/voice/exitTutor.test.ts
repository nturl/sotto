import { describe, expect, it, vi } from 'vitest';
import { exitTutor } from './exitTutor';

describe('exitTutor', () => {
  it.each([true, false])('ends capture before navigating (history: %s)', (history) => {
    const calls: string[] = [];
    const router = {
      canGoBack: () => history,
      back: () => calls.push('back'),
      replace: (path: string) => calls.push(path),
    };
    exitTutor(() => calls.push('end'), router, 'fr-chat-botte');
    expect(calls).toEqual(['end', history ? 'back' : '/reader/fr-chat-botte']);
  });

  it('returns home if a direct route has no book', () => {
    const router = { canGoBack: () => false, back: vi.fn(), replace: vi.fn() };
    exitTutor(vi.fn(), router);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/home');
    expect(router.back).not.toHaveBeenCalled();
  });
});
