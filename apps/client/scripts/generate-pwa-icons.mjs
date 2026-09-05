#!/usr/bin/env node
/**
 * Rasterizes assets/icon.png into the PWA icon set (A3, OVERNIGHT-2.md Lane
 * A): 192/512 any-purpose, a padded 512 maskable icon, and an
 * apple-touch-icon. Mirrors assets/build_icon.py's "run manually if the
 * icon changes" pattern — output lives in public/icons/ and is committed,
 * build-web.mjs does not regenerate it.
 *
 * Uses Pillow (already available on this machine, see assets/build_icon.py)
 * for the maskable icon's safe-zone padding, which sips can't composite;
 * falls back to sips (no padding, so the maskable icon is just a plain
 * square in that path) if Pillow/python3 isn't available.
 *
 * Run manually: node apps/client/scripts/generate-pwa-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors } from '@sotto/core/theme';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcIcon = path.join(clientDir, 'assets', 'icon.png');
const outDir = path.join(clientDir, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const PILLOW_SCRIPT = `
import sys
from PIL import Image

src = Image.open(sys.argv[1]).convert('RGBA')
out_dir = sys.argv[2]
bg = sys.argv[3]
bg_rgba = tuple(int(bg[i:i+2], 16) for i in (1, 3, 5)) + (255,)

def square(size):
    return src.resize((size, size), Image.LANCZOS)

square(192).save(f"{out_dir}/icon-192.png")
square(512).save(f"{out_dir}/icon-512.png")
square(180).save(f"{out_dir}/apple-touch-icon.png")

# Maskable: Android/PWA masks (circle, squircle, ...) can clip up to ~20% of
# the edges, so pad the artwork onto a canvas-colored square inside a ~10%
# safe margin on each side.
size = 512
pad = int(size * 0.1)
canvas = Image.new('RGBA', (size, size), bg_rgba)
inner = src.resize((size - 2 * pad, size - 2 * pad), Image.LANCZOS)
canvas.paste(inner, (pad, pad), inner)
canvas.save(f"{out_dir}/icon-512-maskable.png")
print('generate-pwa-icons: wrote icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png (Pillow)')
`;

try {
  execFileSync('python3', ['-c', PILLOW_SCRIPT, srcIcon, outDir, colors.canvas], {
    stdio: 'inherit',
  });
} catch (err) {
  console.warn(
    `generate-pwa-icons: Pillow path failed (${err.message}); falling back to sips ` +
      '(no safe-zone padding on the maskable icon)',
  );
  const targets = {
    'icon-192.png': 192,
    'icon-512.png': 512,
    'icon-512-maskable.png': 512,
    'apple-touch-icon.png': 180,
  };
  for (const [name, size] of Object.entries(targets)) {
    execFileSync(
      'sips',
      ['-z', String(size), String(size), srcIcon, '--out', path.join(outDir, name)],
      { stdio: 'inherit' },
    );
  }
}
