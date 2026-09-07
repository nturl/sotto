import { describe, expect, it } from 'vitest';
import {
  colors,
  darkColors,
  schemes,
  paper,
  type,
  radius,
  space,
  shadow,
  motion,
  theme,
} from './theme.ts';

/** WCAG relative-luminance contrast ratio between two #RRGGBB colors.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
function contrastRatio(hexA: string, hexB: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
    const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
  };
  const sorted = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  const l1 = sorted[0]!;
  const l2 = sorted[1]!;
  return (l1 + 0.05) / (l2 + 0.05);
}

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
    expect(theme.paper).toBe(paper);
  });

  it('exports the six cover papers and a shelf hairline in both schemes', () => {
    // Run 8 decision 3: the typographic cover system's six grounds. They are
    // artwork (one colourway in both schemes), so they live beside `colors`
    // rather than inside it; only the shelf hairline is a per-scheme token.
    expect(Object.keys(paper).sort()).toEqual(['brick', 'peach', 'sage', 'sand', 'slate', 'teal']);
    expect(paper.sage).toBe('#6E9A7C');
    expect(colors.hairline2).toBe('rgba(34,30,27,0.2)');
    expect(darkColors.hairline2).toBe('rgba(241,234,224,0.2)');
  });

  it('keeps ink legible on the three light papers and canvas on the three dark ones', () => {
    for (const light of [paper.sand, paper.sage, paper.peach]) {
      expect(contrastRatio(colors.ink, light)).toBeGreaterThanOrEqual(4.5);
    }
    for (const dark of [paper.teal, paper.brick, paper.slate]) {
      expect(contrastRatio(colors.canvas, dark)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives every light token a dark counterpart', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(colors).sort());
    expect(schemes.light).toBe(colors);
    expect(schemes.dark).toBe(darkColors);
  });

  it('meets WCAG contrast minimums for dark-scheme text on canvas', () => {
    // Body text (ink) needs AAA-level 7:1; muted/legal text (ink-3) needs
    // the standard AA 4.5:1 (DESIGN.md's own light-mode ink-3 comment cites
    // the same 4.5:1 bar).
    expect(contrastRatio(darkColors.ink, darkColors.canvas)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(darkColors.ink3, darkColors.canvas)).toBeGreaterThanOrEqual(4.5);
  });
});
