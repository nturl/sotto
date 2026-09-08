#!/usr/bin/env node
/* global console, process, URL */
// Re-embed the two product screenshots in the landing page.
//
//   node planning/run10/embed-shots.mjs <reader.jpg> <library.jpg>
//
// The first <img> inside #preview is the reader shot, the second is the library
// shelf. Only the two src attributes change; nothing else in the file moves.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE = resolve(
  new URL('../../apps/client/web/landing/index.html', import.meta.url).pathname,
);

function usage(message) {
  console.error(message);
  console.error('usage: node planning/run10/embed-shots.mjs <reader.jpg> <library.jpg>');
  process.exit(1);
}

const [readerPath, libraryPath] = process.argv.slice(2);
if (!readerPath || !libraryPath) usage('Two JPEG paths are required.');

function dataUri(path) {
  const bytes = readFileSync(resolve(path));
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) usage(`Not a JPEG: ${path}`);
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

const html = readFileSync(PAGE, 'utf8');

const start = html.indexOf('<section id="preview">');
if (start === -1) usage('No #preview section in the landing page.');
const end = html.indexOf('</section>', start);
if (end === -1) usage('The #preview section is not closed.');

const head = html.slice(0, start);
const tail = html.slice(end);
let preview = html.slice(start, end);

const replacements = [dataUri(readerPath), dataUri(libraryPath)];
let seen = 0;
preview = preview.replace(/(\bsrc=")data:image\/jpeg;base64,[A-Za-z0-9+/=\s]*(")/g, (match, open, close) => {
  const next = replacements[seen];
  seen += 1;
  return next ? `${open}${next}${close}` : match;
});

if (seen !== 2) usage(`Expected 2 embedded JPEGs in #preview, found ${seen}.`);

writeFileSync(PAGE, head + preview + tail);

const kb = (path) => Math.round(readFileSync(resolve(path)).length / 1024);
console.log(`reader  ${readerPath} (${kb(readerPath)} KB)`);
console.log(`library ${libraryPath} (${kb(libraryPath)} KB)`);
console.log(`wrote   ${PAGE} (${Math.round(readFileSync(PAGE).length / 1024)} KB)`);
