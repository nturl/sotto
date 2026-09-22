import { existsSync, readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The two "See it working" screenshots were inlined as base64 while the build only
 * copied index.html (planning/run7/A-report.md). That made loading="lazy" a no-op —
 * a data URI arrives with the document — and put 209 KB of JPEG in every landing
 * request. They are files under public/ now, which the Expo export copies to dist/,
 * so they serve at /landing/*.jpg (2026-09-21).
 */
describe('the landing page screenshots', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const preview = html.slice(
    html.indexOf('<section id="preview">'),
    html.indexOf('<section id="install">'),
  );
  const shots = ['reader.jpg', 'tutor.jpg'];

  it('leaves no image inlined in the document', () => {
    expect(html).not.toContain('data:image/');
  });

  it.each(shots)('ships %s as a file the export copies to /landing/', (name) => {
    const file = new URL(`../../public/landing/${name}`, import.meta.url);
    expect(existsSync(file)).toBe(true);
    // ffd8 opens a JPEG and ffd9 closes it: a whole image, not a truncated decode.
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(bytes.subarray(-2).toString('hex')).toBe('ffd9');
  });

  it.each(shots)('defers %s at its intrinsic size, which a data URI could not do', (name) => {
    const tag = preview
      .split('<img')
      .map((chunk) => chunk.slice(0, chunk.indexOf('>')))
      .find((attrs) => attrs.includes(`src="/landing/${name}"`));
    expect(tag).toBeDefined();
    expect(tag).toContain('loading="lazy"');
    expect(tag).toContain('width="900"');
    expect(tag).toContain('height="560"');
  });
});
