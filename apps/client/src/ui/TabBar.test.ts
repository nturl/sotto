import { describe, expect, it } from 'vitest';
import { buildTabRows } from './navRows';

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
