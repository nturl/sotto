#!/usr/bin/env node
/* global process, document, console */
/**
 * Renders the Open Graph link card (apps/client/public/og.png, 1200 x 630) from a
 * real cover on the shelf: the card is direction A of planning/design/og-icon-directions.html
 * with the book the app actually draws (the raster cover, title band printed the way
 * src/ui/Cover.tsx prints it), and a headline that names the language, the named word
 * sitting on the reader's saved-word marker (the landing's .mark). Run from the repo root:
 *
 *   node planning/design/og-card.mjs                        # renders the shipped card (Le Chat botté, "Read a page of French.")
 *   node planning/design/og-card.mjs fr-cendrillon          # any bookId with a cover in packages/content/covers
 *   node planning/design/og-card.mjs fr-chat-botte generic  # an alternate headline; see HEADLINES
 *
 * Writes planning/design/og-<bookId>[-<variant>].png always, and apps/client/public/og.png
 * only for the default variant. Titles, authors and levels come from the pack's book.json.
 * Band ink follows the band's luminance, as the app does. Spec: OG-CARD-V2-SPEC.md.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const W = process.cwd();
const bookId = process.argv[2] || 'fr-chat-botte';
const DEFAULT_VARIANT = 'french-page';
const variant = process.argv[3] || DEFAULT_VARIANT;
// Lines of the headline; <m>word</m> puts the word on the marker. `size` is the px size at 1200 wide.
const HEADLINES = {
  'french-page': { size: 88, top: 104, lines: ['Read a page', 'of <m>French</m>.', 'Then talk', 'about it.'] },
  'french-short': { size: 96, top: 120, lines: ['Read <m>French</m>.', 'Then talk', 'about it.'] },
  'generic': { size: 84, top: 104, lines: ['Learn a <m>language</m>', 'by reading it.', 'Then talk', 'about it.'] },
};
const head = HEADLINES[variant];
if (!head) throw new Error(`unknown variant ${variant}; one of ${Object.keys(HEADLINES).join(', ')}`);
// The same face the app bundles (the landing serves it from /fonts/ at build time).
const requireFromClient = createRequire(`${W}/apps/client/package.json`);
const fontsTtf = readFileSync(
  requireFromClient.resolve('@expo-google-fonts/fraunces/300Light/Fraunces_300Light.ttf'),
).toString('base64');
const fonts = `@font-face{font-family:Fraunces;font-weight:300;src:url(data:font/ttf;base64,${fontsTtf}) format("truetype")}`;
const packJson = execSync(`git ls-files 'packages/content/packs/*/books/${bookId}/book.json'`, { cwd: W }).toString().trim().split('\n')[0];
if (!packJson) throw new Error(`no book.json for ${bookId}`);
const meta = JSON.parse(readFileSync(`${W}/${packJson}`, 'utf8'));
const b = { id: bookId, title: meta.title, author: meta.author, level: meta.level };
const webp = `${W}/packages/content/covers/${bookId}.webp`;
if (!existsSync(webp)) throw new Error(`no raster cover at ${webp}`);
const headline = head.lines.map((l) => l.replace('<m>', '<span class="m">').replace('</m>', '</span>')).join('<br>');
const page = (b, svg, ink) => `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
html,body{margin:0}
.card{width:1200px;height:630px;position:relative;overflow:hidden;background:#F4ECDF;color:#221E1B;font-family:'Fraunces','Iowan Old Style',Palatino,Georgia,serif;font-weight:300}
.cover{position:absolute;left:96px;top:90px;width:300px;height:450px;box-shadow:12px 12px 0 #F2C8B4;overflow:hidden}
.cover svg{display:block;width:300px;height:450px}
.band{position:absolute;left:0;right:0;bottom:0;height:134px;padding:0 25px 22px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end}
.t{font-size:32px;line-height:1.15;color:var(--bi)}
.a{margin-top:6px;font:400 20px/1.3 -apple-system,'Inter','Helvetica Neue',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--bi);padding-right:64px}
.lv{position:absolute;right:25px;bottom:22px;font:400 22px/1.15 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:var(--bi);border:2px solid var(--bi);padding:0 7px}
.head{position:absolute;left:468px;top:${head.top}px;width:660px;font-size:${head.size}px;line-height:1.02;letter-spacing:-0.02em;isolation:isolate}
/* The reader's saved-word marker, as the landing draws it (.mark): behind the word, skewed, 0.55em tall. */
.m{position:relative;white-space:nowrap}
.m::after{content:'';position:absolute;left:-2px;right:0;bottom:1px;height:.55em;background:#FFD8A8;z-index:-1;transform:skew(-6deg)}
.url{position:absolute;left:468px;bottom:100px;font:400 22px/1 ui-monospace,'SF Mono',Menlo,monospace;letter-spacing:.06em;color:#6E6459}
</style></head><body><div class="card">
<div class="cover" style="--bi:${ink}">${svg}<div class="band"><div class="t">${b.title}</div><div class="a">${b.author}</div><div class="lv">${b.level}</div></div></div>
<div class="head">${headline}</div>
<div class="url">readsotto.app</div>
</div></body></html>`;
const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const img = `<img src="data:image/webp;base64,${readFileSync(webp).toString('base64')}" style="display:block;width:300px;height:450px;object-fit:cover">`;
// Band ink: sample the band once with ink text hidden, then choose.
await p.setContent(page(b, img, 'transparent'));
await p.waitForTimeout(200);
const lum = await p.evaluate(async () => {
  const el = document.querySelector('.cover img');
  const c = document.createElement('canvas'); c.width = 300; c.height = 450;
  c.getContext('2d').drawImage(el, 0, 0, 300, 450);
  const d = c.getContext('2d').getImageData(20, 330, 260, 100).data; let t = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 37) { t += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
  return t / n;
});
const ink = lum < 128 ? '#F4ECDF' : '#221E1B';
await p.setContent(page(b, img, ink)); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
// Geometry report: the headline block and the marked word, so a variant that collides with the URL line is caught here.
const geo = await p.evaluate(() => {
  const r = (el) => { const q = el.getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height) }; };
  return { head: r(document.querySelector('.head')), mark: r(document.querySelector('.m')), url: r(document.querySelector('.url')) };
});
const suffix = variant === DEFAULT_VARIANT ? '' : `-${variant}`;
const out = `${W}/planning/design/og-${bookId}${suffix}.png`;
await p.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
if (variant === DEFAULT_VARIANT) writeFileSync(`${W}/apps/client/public/og.png`, readFileSync(out));
const headRight = geo.head.x + geo.head.w, headBottom = geo.head.y + geo.head.h;
if (headBottom > geo.url.y - 24) console.warn(`og-card: WARNING headline bottom ${headBottom} runs into the URL line at ${geo.url.y}`);
console.log(`og-card: ${bookId} ${variant} "${b.title}" band luminance ${Math.round(lum)} ink ${ink}; head ${JSON.stringify(geo.head)} (right ${headRight}); mark ${JSON.stringify(geo.mark)} -> ${out.replace(W + '/', '')}${suffix ? '' : ' + apps/client/public/og.png'}`);
await br.close();
