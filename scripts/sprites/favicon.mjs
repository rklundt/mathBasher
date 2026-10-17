#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Tab-icon generator (sprint 2.5.4). `public/favicon.svg` (a green toy
 * blaster) is the source of truth; this renders the PNG fallbacks from it:
 *
 *   public/favicon-32.png        32×32, transparent — browsers without SVG favicons
 *   public/apple-touch-icon.png  180×180 on the game's dark background — iOS
 *                                home screen (iOS fills transparency with black)
 *
 * Usage: pnpm icon:favicon [--force]   (--force re-renders over existing PNGs)
 */

import sharp from 'sharp';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const svg = readFileSync(resolve(PUBLIC, 'favicon.svg'));
const BG = '#0b1020'; // page background (index.html)

const outputs = [resolve(PUBLIC, 'favicon-32.png'), resolve(PUBLIC, 'apple-touch-icon.png')];
const existing = outputs.filter((p) => existsSync(p));
if (existing.length > 0 && !process.argv.includes('--force')) {
  console.error('Refusing to overwrite existing icons (pass --force):');
  for (const p of existing) console.error(`  ${p}`);
  process.exit(1);
}

await sharp(svg, { density: 600 })
  .resize(32, 32)
  .png({ compressionLevel: 9 })
  .toFile(resolve(PUBLIC, 'favicon-32.png'));

const ICON = 180;
const INSET = 132; // leave a margin so the rounded iOS mask doesn't clip the blaster
const art = await sharp(svg, { density: 600 }).resize(INSET, INSET).png().toBuffer();
await sharp({ create: { width: ICON, height: ICON, channels: 4, background: BG } })
  .composite([{ input: art, left: (ICON - INSET) / 2, top: (ICON - INSET) / 2 }])
  .png({ compressionLevel: 9 })
  .toFile(resolve(PUBLIC, 'apple-touch-icon.png'));

console.log('wrote favicon-32.png, apple-touch-icon.png');
