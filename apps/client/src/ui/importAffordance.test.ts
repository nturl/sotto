import { describe, expect, it } from 'vitest';
import { showImportAffordance } from './importAffordance';

describe('showImportAffordance', () => {
  it('shows the affordance once the local server has answered', () => {
    expect(showImportAffordance(true, false)).toBe(true);
  });

  it('shows nothing while the health check is still in flight', () => {
    expect(showImportAffordance(undefined, false)).toBe(false);
  });

  it('shows nothing on the free web app, where the server is never reachable', () => {
    expect(showImportAffordance(false, false)).toBe(false);
  });

  it('shows the affordance on the paid build, which imports without a local server', () => {
    expect(showImportAffordance(false, true)).toBe(true);
    expect(showImportAffordance(undefined, true)).toBe(true);
  });
});
