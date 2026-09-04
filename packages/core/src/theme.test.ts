import { describe, expect, it } from 'vitest';
import { colors, type, radius, space, shadow, motion, theme } from './theme.ts';

describe('@sotto/core theme', () => {
  it('exports the full token set', () => {
    expect(colors).toBeDefined();
    expect(colors.canvas).toBe('#F4ECDF');
    expect(colors.accent).toBe('#E4572E');

    expect(type).toBeDefined();
    expect(type.display.face).toBe('Fraunces');
    expect(type.ui.face).toBe('Inter');

    expect(radius).toBeDefined();
    expect(radius.full).toBe(9999);

    expect(space).toBeDefined();
    expect(space.tapTarget).toBe(44);

    expect(shadow).toBeDefined();
    expect(shadow.cutoutPeach.color).toBe(colors.peach);

    expect(motion).toBeDefined();
    expect(motion.speechFillStaggerMs).toBe(60);

    expect(theme.colors).toBe(colors);
  });
});
