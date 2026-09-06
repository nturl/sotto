import { describe, expect, it } from 'vitest';
import { NAV_ROWS, SETTINGS_ROW } from './navRows';

describe('Sidebar nav rows', () => {
  it('lists Home, Library, Vocabulary as the scrolling rows', () => {
    expect(NAV_ROWS.map((r) => r.segment)).toEqual(['home', 'library', 'vocabulary']);
  });

  it('has a pinned Settings row targeting /settings', () => {
    expect(SETTINGS_ROW.segment).toBe('settings');
    expect(SETTINGS_ROW.href).toBe('/settings');
    expect(SETTINGS_ROW.labelKey).toBe('tabs.settings');
  });

  it('does not duplicate the settings row inside the scrolling rows', () => {
    expect(NAV_ROWS.some((r) => r.segment === 'settings')).toBe(false);
  });
});
