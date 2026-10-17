#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Penguin Slide snowy-hill backdrop generator (sprint 2.7).
 *
 * Original vector art drawn in code: a 1280 × 720 view from just behind the
 * penguin, looking down a long snowy hill. Sky and soft mountains at the
 * top, the igloo far away where the hill meets the horizon, pines down both
 * sides, and gentle snow ridges. The lane marks are NOT drawn here: the
 * scene draws them, because the lane count changes with the difficulty.
 * This file IS the source of the art: edit and re-run, never hand-edit the
 * shipped image.
 *
 * Two outputs: `penguin-slide-hill.webp` (full brightness, the game scene)
 * and `penguin-slide.webp` (darkened, the menu backdrop behind Difficulty /
 * Loading / Game Over, so their light text reads on it; snow is much
 * brighter than water, so it is darkened more than the other backdrops).
 *
 * Usage:
 *   pnpm sprite:snowhill                       # writes public/assets/sprites/bg/penguin-slide{,-hill}.webp
 *   pnpm sprite:snowhill --preview <png> --dry # review image only, ships nothing
 *   pnpm sprite:snowhill --force               # re-render over the shipped images
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HILL_OUT = resolve(ROOT, 'public/assets/sprites/bg/penguin-slide-hill.webp');
const MENU_OUT = resolve(ROOT, 'public/assets/sprites/bg/penguin-slide.webp');
/** Menu backdrop brightness: white menu text must read on it (about 5:1 or better on the snow). */
export const MENU_BRIGHTNESS = 0.42;

export const W = 1280;
export const H = 720;
/** Where the hill meets the sky (the scene's row starts just below it). */
export const HORIZON_Y = 228;

const INK = '#3a2420';
const f = (n) => n.toFixed(1);

/** Deterministic pseudo-random numbers, so a re-render gives the same picture. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pine(x, y, h, shade) {
  const w = h * 0.55;
  const tiers = [0, 0.3, 0.58]
    .map((t, i) => {
      const ty = y - h + t * h;
      const tw = w * (0.55 + i * 0.22);
      return `<path d="M${f(x)},${f(ty)} L${f(x + tw / 2)},${f(ty + h * 0.42)} L${f(x - tw / 2)},${f(ty + h * 0.42)} Z" fill="${shade}" stroke="${INK}" stroke-width="${f(Math.max(1.5, h * 0.03))}" stroke-linejoin="round"/>
        <path d="M${f(x)},${f(ty)} L${f(x + tw * 0.22)},${f(ty + h * 0.16)} Q${f(x)},${f(ty + h * 0.12)} ${f(x - tw * 0.22)},${f(ty + h * 0.16)} Z" fill="#ffffff"/>`;
    })
    .join('');
  return `<rect x="${f(x - h * 0.05)}" y="${f(y - h * 0.06)}" width="${f(h * 0.1)}" height="${f(h * 0.1)}" fill="#8a6a50" stroke="${INK}" stroke-width="${f(Math.max(1.2, h * 0.02))}"/>${tiers}`;
}

function snowhillSvg() {
  const r = rng(27);
  const cx = W / 2;

  // Sky + sun + soft clouds.
  const sky = `<rect width="${W}" height="${HORIZON_Y + 40}" fill="#cfe9fb"/>
    <circle cx="1040" cy="92" r="40" fill="#fff6c9"/>
    ${[
      [180, 96, 1.0],
      [520, 70, 0.8],
      [840, 120, 0.9],
    ]
      .map(
        ([x, y, k]) =>
          `<g opacity="0.9"><ellipse cx="${x}" cy="${y}" rx="${f(54 * k)}" ry="${f(18 * k)}" fill="#ffffff"/><ellipse cx="${f(x - 26 * k)}" cy="${f(y - 10 * k)}" rx="${f(26 * k)}" ry="${f(18 * k)}" fill="#ffffff"/><ellipse cx="${f(x + 20 * k)}" cy="${f(y - 14 * k)}" rx="${f(30 * k)}" ry="${f(20 * k)}" fill="#ffffff"/></g>`,
      )
      .join('')}`;

  // Two layers of mountains with snow caps.
  const far = `<path d="M0,${HORIZON_Y - 30} L130,150 L240,196 L380,120 L520,190 L640,140 L760,192 L900,118 L1040,184 L1160,140 L${W},180 L${W},${HORIZON_Y + 10} L0,${HORIZON_Y + 10} Z" fill="#b7d3ec"/>
    <path d="M130,150 L162,170 L144,168 L120,176 Z M380,120 L414,142 L392,140 L366,150 Z M900,118 L936,140 L912,138 L886,148 Z" fill="#ffffff"/>`;
  const near = `<path d="M0,${HORIZON_Y - 4} L90,186 L210,${HORIZON_Y - 10} L330,178 L470,${HORIZON_Y - 6} L560,196 L720,${HORIZON_Y - 8} L840,184 L980,${HORIZON_Y - 2} L1110,176 L${W},${HORIZON_Y - 12} L${W},${HORIZON_Y + 12} L0,${HORIZON_Y + 12} Z" fill="#a3c4e2"/>`;

  // The hill: fills everything below the horizon, a touch brighter in the middle (the run).
  const hill = `<rect y="${HORIZON_Y}" width="${W}" height="${H - HORIZON_Y}" fill="#eef7ff"/>
    <path d="M${cx - 120},${HORIZON_Y} L${cx + 120},${HORIZON_Y} L${W - 40},${H} L40,${H} Z" fill="#e2f1fd"/>`;

  // Gentle snow ridges, getting wider toward the viewer.
  const ridges = Array.from({ length: 9 }, (_, i) => {
    const t = (i + 1) / 10;
    const y = HORIZON_Y + (H - HORIZON_Y) * t * t + 6;
    const half = 160 + 520 * t;
    return `<path d="M${f(cx - half)},${f(y)} Q${f(cx)},${f(y - 10 - 16 * t)} ${f(cx + half)},${f(y)}" fill="none" stroke="#d3e7f7" stroke-width="${f(1.5 + 3 * t)}" stroke-linecap="round"/>`;
  }).join('');

  // The igloo far away, where the hill meets the horizon.
  const ig = (x, y, k) => `<g>
    <path d="M${f(x - 46 * k)},${f(y)} Q${f(x - 46 * k)},${f(y - 50 * k)} ${x},${f(y - 50 * k)} Q${f(x + 46 * k)},${f(y - 50 * k)} ${f(x + 46 * k)},${f(y)} Z" fill="#ffffff" stroke="${INK}" stroke-width="${f(2.5 * k)}" stroke-linejoin="round"/>
    <path d="M${f(x - 40 * k)},${f(y - 18 * k)} L${f(x + 40 * k)},${f(y - 18 * k)} M${f(x - 30 * k)},${f(y - 34 * k)} L${f(x + 30 * k)},${f(y - 34 * k)} M${f(x - 10 * k)},${f(y - 50 * k)} L${f(x - 14 * k)},${f(y - 34 * k)} M${f(x + 16 * k)},${f(y - 34 * k)} L${f(x + 20 * k)},${f(y - 18 * k)} M${f(x - 24 * k)},${f(y - 18 * k)} L${f(x - 22 * k)},${f(y)}" stroke="#c9dceb" stroke-width="${f(1.6 * k)}"/>
    <path d="M${f(x - 14 * k)},${f(y)} Q${f(x - 14 * k)},${f(y - 20 * k)} ${x},${f(y - 20 * k)} Q${f(x + 14 * k)},${f(y - 20 * k)} ${f(x + 14 * k)},${f(y)} Z" fill="#6b5a3e" stroke="${INK}" stroke-width="${f(2 * k)}"/>
  </g>`;
  const igloo = ig(cx, HORIZON_Y + 16, 1);

  // Pines down both sides, smaller toward the horizon.
  const pines = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const y = HORIZON_Y + 30 + (H - HORIZON_Y - 10) * t * t;
    const h = 40 + 120 * t;
    const offset = 200 + 420 * t + r() * 30;
    for (const side of [-1, 1]) {
      const x = cx + side * (offset + h * 0.4);
      if (x < -60 || x > W + 60) continue;
      pines.push({ y, svg: pine(x, y, h, side < 0 ? '#5b8f6a' : '#4f8460') });
    }
  }
  pines.sort((a, b) => a.y - b.y);

  // A few drifting snowflakes in the sky.
  const flakes = Array.from({ length: 26 }, () => {
    const x = r() * W;
    const y = 70 + r() * (H - 120);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.5 + r() * 2)}" fill="#ffffff" opacity="0.9"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${sky}${far}${near}${hill}${ridges}${igloo}${pines.map((p) => p.svg).join('')}${flakes}
  </svg>`;
}

async function main() {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;
  const dry = args.includes('--dry');
  const buf = await sharp(Buffer.from(snowhillSvg())).png().toBuffer();
  if (!dry) {
    const existing = [HILL_OUT, MENU_OUT].filter((o) => existsSync(o));
    if (existing.length && !args.includes('--force')) {
      console.error(
        `Refusing to overwrite ${existing.join(', ')} (pass --force). A visible change should ship under a new filename (week-long cache).`,
      );
      process.exit(1);
    }
    mkdirSync(dirname(HILL_OUT), { recursive: true });
    await sharp(buf).webp({ quality: 88, effort: 6 }).toFile(HILL_OUT);
    await sharp(buf).modulate({ brightness: MENU_BRIGHTNESS }).webp({ quality: 88, effort: 6 }).toFile(MENU_OUT);
    console.log(`wrote ${HILL_OUT}\nwrote ${MENU_OUT}`);
  }
  if (previewPath) {
    await sharp(buf).png().toFile(previewPath);
    console.log(`wrote preview ${previewPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
