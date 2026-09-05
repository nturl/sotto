import { describe, expect, it } from 'vitest';
import { canImportLocally, isLoopbackServerUrl } from './canImportLocally.ts';

describe('isLoopbackServerUrl', () => {
  it('accepts localhost, 127.0.0.1 and [::1]', () => {
    expect(isLoopbackServerUrl('http://localhost:8790')).toBe(true);
    expect(isLoopbackServerUrl('http://127.0.0.1:8790')).toBe(true);
    expect(isLoopbackServerUrl('http://[::1]:8790')).toBe(true);
  });

  it('rejects a public/static-deploy host', () => {
    expect(isLoopbackServerUrl('https://sotto-steel.vercel.app')).toBe(false);
    expect(isLoopbackServerUrl('https://example.com')).toBe(false);
  });

  it('rejects a malformed URL rather than throwing', () => {
    expect(isLoopbackServerUrl('not a url')).toBe(false);
  });
});

describe('canImportLocally (finding 5)', () => {
  it('allows a loopback server URL regardless of explicit configuration', () => {
    expect(canImportLocally('http://localhost:8790', false)).toBe(true);
    expect(canImportLocally('http://127.0.0.1:8790', true)).toBe(true);
  });

  it('allows a non-loopback URL only when explicitly configured', () => {
    expect(canImportLocally('http://192.168.1.20:8790', true)).toBe(true);
  });

  it('refuses a non-loopback URL that was not explicitly configured (the static-deploy case)', () => {
    // This is exactly serverUrl()'s static-web fallback: __SOTTO_STATIC__
    // resolves to the page's own origin with no EXPO_PUBLIC_SERVER_URL set.
    expect(canImportLocally('https://sotto-steel.vercel.app', false)).toBe(false);
  });
});
