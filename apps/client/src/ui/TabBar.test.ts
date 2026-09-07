import { describe, expect, it } from 'vitest';
import { buildTabRows, NAV_GLYPH_NAMES, NAV_ROWS, SETTINGS_ROW } from './navRows';

describe('buildTabRows', () => {
  const baseRoutes = [
    { key: 'home', name: 'home' },
    { key: 'library', name: 'library' },
    { key: 'vocabulary', name: 'vocabulary' },
  ];

  it('appends a Settings row after the tab-navigator routes', () => {
    const rows = buildTabRows(baseRoutes);
    expect(rows.map((r) => r.name)).toEqual(['home', 'library', 'vocabulary', 'settings']);
  });

  it('marks only the appended row as the settings row', () => {
    const rows = buildTabRows(baseRoutes);
    expect(rows.filter((r) => r.isSettings).map((r) => r.name)).toEqual(['settings']);
  });
});

describe('tab glyph pairing', () => {
  const baseRoutes = [
    { key: 'home', name: 'home' },
    { key: 'library', name: 'library' },
    { key: 'vocabulary', name: 'vocabulary' },
  ];

  it('pairs each tab route with the mockup glyph for that tab', () => {
    const rows = buildTabRows(baseRoutes);
    expect(rows.map((r) => [r.name, r.glyph])).toEqual([
      ['home', 'bookOpen'],
      ['library', 'shelves'],
      ['vocabulary', 'bookmark'],
      ['settings', 'gear'],
    ]);
  });

  it('gives every sidebar nav row the same glyph name as its tab', () => {
    expect(NAV_ROWS.map((r) => r.glyph)).toEqual(['bookOpen', 'shelves', 'bookmark']);
    expect(SETTINGS_ROW.glyph).toBe('gear');
  });

  it('exposes the four glyph names in tab order', () => {
    expect(NAV_GLYPH_NAMES).toEqual(['bookOpen', 'shelves', 'bookmark', 'gear']);
  });

  it('leaves an unknown route without a glyph rather than guessing', () => {
    const rows = buildTabRows([{ key: 'mystery', name: 'mystery' }]);
    expect(rows[0].glyph).toBeUndefined();
  });
});
