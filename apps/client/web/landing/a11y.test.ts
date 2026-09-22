import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Two keyboard and screen-reader contracts the landing page kept breaking
 * silently, because nothing here renders in a browser during the test run
 * (2026-09-21).
 */
describe('the landing page for a keyboard', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

  it('lets the page-wide focus ring reach the sign-in link', () => {
    expect(html).toMatch(/\n\s*:focus-visible \{[^}]*outline: 1\.5px solid var\(--ink\);/);
    const signin = html.match(/\.signin:hover,\s*\.signin:focus-visible \{([^}]*)\}/)?.[1];
    expect(signin).toBeDefined();
    expect(signin).not.toContain('outline');
  });

  it('keeps the sign-in label legible on the coral it lands on', () => {
    // --surface on --accent is 3.42:1, under the 4.5:1 of WCAG 1.4.3 AA, and the
    // hover rule also fires on :focus-visible — so the link was least legible
    // exactly when a keyboard user was on it. No colour override here means the
    // resting --on-accent applies, which is 4.88:1 (2026-09-21).
    const signin = html.match(/\.signin:hover,\s*\.signin:focus-visible \{([^}]*)\}/)?.[1];
    expect(signin).toBeDefined();
    expect(signin).not.toMatch(/(^|[;\s])color:/);
    const base = html.match(/\n\s*\.signin \{([^}]*)\}/)?.[1];
    expect(base).toContain('color: var(--on-accent);');
  });
});

describe('the scene tab strip as a screen reader reads it', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const open = html.indexOf('<ul class="tabs"');
  const tablist = html.slice(open, html.indexOf('</ul>', open));
  const scenes = ['read', 'tap', 'listen', 'speak', 'power'];

  it('owns its tabs directly: the listitems in between are presentational', () => {
    expect(tablist).toContain('role="tablist"');
    expect(tablist.match(/role="tab"/g)).toHaveLength(scenes.length);
    expect(tablist.match(/<li role="presentation">/g)).toHaveLength(scenes.length);
    expect(tablist).not.toMatch(/<li>/);
  });

  it.each(scenes)('points the %s tab at the panel it swaps', (scene) => {
    // Per tab, not per strip: a whole-strip match would still pass with one tab
    // having lost its aria-controls.
    const tag = tablist
      .split('<a')
      .map((chunk) => chunk.slice(0, chunk.indexOf('>')))
      .find((attrs) => attrs.includes(`id="tab-${scene}"`));
    expect(tag).toBeDefined();
    expect(tag).toContain('aria-controls="book"');
  });

  it('names the panel after whichever tab is selected', () => {
    expect(html).toMatch(/<div\s+class="book"\s+id="book"[^>]*role="tabpanel"/);
    expect(html).toContain('aria-labelledby="tab-read"');
    // setState re-points it, so the name follows the selection rather than the markup.
    expect(html).toContain("book.setAttribute('aria-labelledby', 'tab-' + st);");
  });

  it('moves between tabs with the arrow keys, as the tabs pattern expects', () => {
    expect(html).toContain("t.addEventListener('keydown'");
    expect(html).toContain("e.key === 'ArrowRight'");
    expect(html).toContain("e.key === 'ArrowLeft'");
    expect(html).toContain("e.key === 'Home'");
    expect(html).toContain("e.key === 'End'");
    // The pattern wraps: ArrowRight off the last tab lands on the first, not nowhere.
    expect(html).toContain('next = (next + tabs.length) % tabs.length;');
  });
});
