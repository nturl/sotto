import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Keyboard contracts the landing page kept breaking silently, because nothing
 * here renders in a browser during the test run (2026-09-21).
 */
describe('the landing page for a keyboard', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

  it('lets the page-wide focus ring reach the sign-in link', () => {
    expect(html).toMatch(/\n\s*:focus-visible \{[^}]*outline: 1\.5px solid var\(--ink\);/);
    const signin = html.match(/\.signin:hover,\s*\.signin:focus-visible \{([^}]*)\}/)?.[1];
    expect(signin).toBeDefined();
    expect(signin).not.toContain('outline');
  });
});
