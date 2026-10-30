#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Game Select tile pictures (sprint 2.13.1): one small picture per math game,
 * cut from the art each game already ships and packed into a single sheet,
 * `public/assets/sprites/hero/game-icons.webp` (ORDER.length frames of
 * FRAME² px, one row). The game sheets themselves load only when their game
 * starts, so Game Select can't draw them; this sheet is small and loads at
 * boot. Each picture is trimmed to its art and fitted inside FIT px, centred.
 *
 * Re-run after a game's art changes:
 *   node scripts/sprites/game-icons.mjs                  # writes the sheet
 *   node scripts/sprites/game-icons.mjs --preview <png>  # also a 2× review sheet on the tile colour
 *   node scripts/sprites/game-icons.mjs --force          # re-render over the shipped sheet
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPRITES = resolve(ROOT, 'public/assets/sprites');
const OUT = resolve(SPRITES, 'hero/game-icons.webp');

export const FRAME = 96;
/** The picture's longest side inside its frame (a little margin all round). */
const FIT = 90;
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Frame order — must match `GAME_ICON_SHEET.frames` in `src/core/spriteKeys.ts`
 * (a test checks). Most pictures are one frame cut from a game's sheet
 * (left, top, width, height in sheet px, under `public/assets/sprites/`);
 * Balance Scale's is put together from its pieces (`balanceScale()`).
 */
export const ORDER = [
  'alien-shoot',
  'asteroid-field',
  'number-climb',
  'math-a-lotl',
  'frog-splash',
  'space-shooter',
  'penguin-slide',
  'bunny-garden',
  'balance-scale',
];
const SOURCES = {
  // The big-headed green alien, first animation frame (192 px tier).
  'alien-shoot': { file: 'aliens/192/alien4-r0c0.webp', left: 0, top: 0, width: 192, height: 192 },
  'asteroid-field': { file: 'asteroids/asteroid-2.webp', left: 0, top: 0, width: 192, height: 192 },
  'number-climb': { file: 'hero/space-robot.webp', left: 0, top: 0, width: 128, height: 128 },
  // The happy (catch) frame.
  'math-a-lotl': { file: 'hero/axolotl-pink.webp', left: 6 * 340, top: 0, width: 340, height: 224 },
  'frog-splash': { file: 'hero/frog-green.webp', left: 0, top: 0, width: 220, height: 220 },
  'space-shooter': { file: 'hero/alien-ships.webp', left: 0, top: 0, width: 240, height: 240 },
  // The cheer frame.
  'penguin-slide': { file: 'hero/penguin-classic.webp', left: 5 * 220, top: 0, width: 220, height: 220 },
  // The happy frame.
  'bunny-garden': { file: 'hero/bunny-snowball.webp', left: 3 * 220, top: 0, width: 220, height: 220 },
};

/** One frame of a shipped sheet, optionally scaled. */
async function cut(file, left, top, width, height, scale = 1) {
  return sharp(resolve(SPRITES, file))
    .extract({ left, top, width, height })
    .resize(Math.round(width * scale), Math.round(height * scale), { kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

/**
 * A small balanced scale from the game's own pieces (geometry from
 * `BALANCE_SHEETS` and `BalanceScaleScene.layoutScale`): the happy pillar,
 * the beam and badge on top, a pan on strings at each end with a weight in it.
 * Drawn narrower than in the game so the picture isn't a thin strip.
 */
async function balanceScale() {
  const beamW = 420; // the 600 px beam, squeezed
  const reach = beamW / 2 - 20; // pivot to hook
  const panScale = 0.55; // the 380 × 74 pan (rim 12 px down)
  const weightScale = 0.55; // the 130 × 140 weight (bottom 132 px down)
  const hang = 110; // hook to rim
  const W = 640;
  const H = 420;
  const px = W / 2;
  const py = 40;
  const panW = Math.round(380 * panScale);
  const rimY = py + hang;
  const halfRim = panW / 2 - 10;
  const hooks = [px - reach, px + reach];

  const strings = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      hooks
        .map(
          (hx) =>
            `<line x1="${hx}" y1="${py}" x2="${hx - halfRim}" y2="${rimY}" stroke="#8a6d3b" stroke-width="5" stroke-linecap="round"/>` +
            `<line x1="${hx}" y1="${py}" x2="${hx + halfRim}" y2="${rimY}" stroke="#8a6d3b" stroke-width="5" stroke-linecap="round"/>`,
        )
        .join('') +
      '</svg>',
  );
  const pillar = await cut('hero/balance-pillar.webp', 260, 0, 260, 340);
  const beam = await sharp(await cut('hero/balance-beam.webp', 0, 0, 600, 44))
    .resize(beamW, 44, { fit: 'fill' })
    .png()
    .toBuffer();
  const badge = await cut('hero/balance-badge.webp', 0, 0, 96, 96, 0.8);
  const pan = await cut('hero/balance-pan.webp', 0, 0, 380, 74, panScale);
  const weights = [
    await cut('hero/balance-weights.webp', 0, 0, 130, 140, weightScale),
    await cut('hero/balance-weights.webp', 2 * 130, 0, 130, 140, weightScale),
  ];
  const weightW = Math.round(130 * weightScale);

  const layers = [
    { input: pillar, left: px - 130, top: py },
    { input: strings, left: 0, top: 0 },
    ...hooks.flatMap((hx, i) => [
      { input: weights[i], left: Math.round(hx - weightW / 2), top: Math.round(rimY - 132 * weightScale) },
      { input: pan, left: Math.round(hx - panW / 2), top: Math.round(rimY - 12 * panScale) },
    ]),
    { input: beam, left: px - beamW / 2, top: py - 22 },
    { input: badge, left: Math.round(px - 38), top: Math.round(py - 38) },
  ];
  return sharp({ create: { width: W, height: H, channels: 4, background: CLEAR } })
    .composite(layers)
    .png()
    .toBuffer();
}

/** One picture: cut, trimmed to its art, fitted inside FIT, centred in a FRAME² cell. */
async function icon(id) {
  const s = SOURCES[id];
  const source = s ? await cut(s.file, s.left, s.top, s.width, s.height) : await balanceScale();
  const art = await sharp(await sharp(source).trim({ threshold: 1 }).png().toBuffer())
    .resize(FIT, FIT, { fit: 'contain', background: CLEAR, kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const pad = (FRAME - FIT) / 2;
  return { input: art, left: ORDER.indexOf(id) * FRAME + pad, top: pad };
}

function refuseOverwrite(path, force) {
  if (!existsSync(path) || force) return;
  console.error('Refusing to overwrite the shipped sheet (pass --force to re-render in place):');
  console.error(`  ${path}`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  refuseOverwrite(OUT, args.includes('--force'));
  const pieces = await Promise.all(ORDER.map(icon));
  const sheet = await sharp({
    create: { width: FRAME * ORDER.length, height: FRAME, channels: 4, background: CLEAR },
  })
    .composite(pieces)
    .png()
    .toBuffer();
  mkdirSync(dirname(OUT), { recursive: true });
  await sharp(sheet).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(OUT);
  console.log(`wrote ${OUT}`);

  const previewAt = args.indexOf('--preview');
  if (previewAt >= 0 && args[previewAt + 1]) {
    const previewPath = resolve(args[previewAt + 1]);
    // On the tile colour (`SLATE_BG` in `src/game/ui/uiPalette.ts`), at 2× to check the edges.
    const onSlate = await sharp({
      create: { width: FRAME * ORDER.length, height: FRAME, channels: 4, background: '#1f2740' },
    })
      .composite([{ input: sheet }])
      .png()
      .toBuffer();
    await sharp(onSlate)
      .resize(FRAME * ORDER.length * 2, FRAME * 2, { kernel: 'nearest' })
      .png()
      .toFile(previewPath);
    console.log(`wrote ${previewPath}`);
  }
}

await main();
