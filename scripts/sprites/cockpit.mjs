#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Space Shooter scenery: turns the two source images (kept out of the repo
 * in `.sprite-source/raw/space-shooter/`) into the shipped game art.
 *
 *   cockpit.png  cockpit interior with a see-through window → sprites/hero/cockpit.webp
 *   cosmos.png   the view out of the window (has a transparent margin,
 *                trimmed here)                              → sprites/bg/space-cosmos.webp
 *   (both)       the menu backdrop: cosmos behind the cockpit, dimmed
 *                ×0.6 like the other menu backdrops        → sprites/bg/space-shooter.webp
 *
 * Also prints the window opening in the 1280×720 design canvas: its
 * bounding box, and its left / right edge every `EDGE_STEP` px of height in
 * the exact format of `config.spaceShooter.windowEdge` (paste it in after
 * re-rendering the cockpit; `spaceShooterAssets.test.ts` checks the table
 * against the shipped image).
 *
 * Usage:
 *   pnpm sprite:cockpit             # write the three WebPs
 *   pnpm sprite:cockpit --measure   # just print the window opening
 *   pnpm sprite:cockpit --force     # re-render over shipped files
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = resolve(ROOT, '.sprite-source/raw/space-shooter');
const W = 1280;
const H = 720;
/** The cockpit ships at 1.5× the design canvas so it stays crisp on large phones. */
const COCKPIT_SCALE = 1.5;
/** Row spacing of the measured window edge (`config.spaceShooter.windowEdge`). */
const EDGE_STEP = 20;

async function cockpitAt(w, h) {
  // The source is 1960×1080 (≈1.81:1); a fill to 16:9 squeezes it ~2%, invisible here.
  return sharp(resolve(SRC, 'cockpit.png')).resize(w, h, { fit: 'fill' }).png().toBuffer();
}

/**
 * The window opening: the see-through region connected to the canvas
 * centre (stray transparent pixels at the image edges don't count).
 * Returns its bounding box and, at a few heights, its left / right edge.
 */
async function measureWindow() {
  const { data, info } = await sharp(await cockpitAt(W, H)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const clear = (x, y) => data[(y * info.width + x) * 4 + 3] < 8;
  const seen = new Uint8Array(W * H);
  const stack = [[W >> 1, H >> 1]];
  let left = W;
  let right = 0;
  let top = H;
  let bottom = 0;
  const rowL = new Int32Array(H).fill(-1);
  const rowR = new Int32Array(H).fill(-1);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H || seen[y * W + x] || !clear(x, y)) continue;
    seen[y * W + x] = 1;
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
    rowL[y] = rowL[y] < 0 ? x : Math.min(rowL[y], x);
    rowR[y] = Math.max(rowR[y], x);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const rows = [];
  for (let y = Math.ceil(top / EDGE_STEP) * EDGE_STEP; y <= bottom; y += EDGE_STEP) {
    if (rowL[y] >= 0) rows.push([y, rowL[y], rowR[y]]);
  }
  return { left, right, top, bottom, rows };
}

function refuseOverwrite(paths, force) {
  const existing = paths.filter((p) => existsSync(p));
  if (existing.length === 0 || force) return;
  console.error('Refusing to overwrite shipped assets (pass --force to re-render in place):');
  for (const p of existing) console.error(`  ${p}`);
  console.error('A visible change should ship under a new filename (week-long cache).');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const win = await measureWindow();
  console.log('window opening (design px):', JSON.stringify({ left: win.left, right: win.right, top: win.top, bottom: win.bottom }));
  console.log('windowEdge (paste into config.spaceShooter.windowEdge):');
  console.log(win.rows.map((r) => `[${r.join(', ')}]`).join(', '));
  if (args.includes('--measure')) return;

  const outCockpit = resolve(ROOT, 'public/assets/sprites/hero/cockpit.webp');
  const outCosmos = resolve(ROOT, 'public/assets/sprites/bg/space-cosmos.webp');
  const outMenu = resolve(ROOT, 'public/assets/sprites/bg/space-shooter.webp');
  refuseOverwrite([outCockpit, outCosmos, outMenu], args.includes('--force'));
  mkdirSync(dirname(outCockpit), { recursive: true });

  const cosmos = await sharp(resolve(SRC, 'cosmos.png')).trim().resize(W, H, { fit: 'cover' }).png().toBuffer();
  await sharp(cosmos).webp({ quality: 85, effort: 6 }).toFile(outCosmos);
  console.log(`wrote ${outCosmos}`);

  const cockpitHi = await cockpitAt(Math.round(W * COCKPIT_SCALE), Math.round(H * COCKPIT_SCALE));
  await sharp(cockpitHi).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(outCockpit);
  console.log(`wrote ${outCockpit}`);

  const menu = await sharp(cosmos).composite([{ input: await cockpitAt(W, H) }]).png().toBuffer();
  await sharp(menu).modulate({ brightness: 0.6 }).webp({ quality: 85, effort: 6 }).toFile(outMenu);
  console.log(`wrote ${outMenu}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
