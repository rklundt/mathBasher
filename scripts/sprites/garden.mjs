#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Bunny Garden backdrop generator (sprint 2.8).
 *
 * Original vector art drawn in code: a 1280 × 720 spring garden. Sky with a
 * smiling sun and soft clouds, rolling hills, a picket fence with flowers,
 * a tilled vegetable patch (where the scene puts the holes; the holes are
 * NOT drawn here, because their number changes with the difficulty) and
 * a grassy front edge where the bunny hops. This file IS the source of the
 * art: edit and re-run, never hand-edit the shipped images.
 *
 * Two outputs: `bunny-garden-patch.webp` (full brightness, the game scene)
 * and `bunny-garden.webp` (darkened, the backdrop behind Difficulty /
 * Loading / Game Over, so their light text reads on it).
 *
 * Usage:
 *   pnpm sprite:garden                       # writes public/assets/sprites/bg/bunny-garden{,-patch}.webp
 *   pnpm sprite:garden --preview <png> --dry # review image only, ships nothing
 *   pnpm sprite:garden --force               # re-render over the shipped images
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PATCH_OUT = resolve(ROOT, 'public/assets/sprites/bg/bunny-garden-patch.webp');
const MENU_OUT = resolve(ROOT, 'public/assets/sprites/bg/bunny-garden.webp');
/** Menu backdrop brightness: white menu text must read on it. */
export const MENU_BRIGHTNESS = 0.45;

export const W = 1280;
export const H = 720;
/** The tilled patch's top and bottom edges (the scene's holes sit between them). */
export const PATCH_TOP = 400;
export const PATCH_BOTTOM = 560;

const INK = '#3a2420';
const f = (n) => n.toFixed(1);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function flower(x, y, r, petal, centre) {
  const petals = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return `<circle cx="${f(x + Math.cos(a) * r)}" cy="${f(y + Math.sin(a) * r)}" r="${f(r * 0.78)}" fill="${petal}" stroke="${INK}" stroke-width="2"/>`;
  }).join('');
  return `<path d="M${f(x)},${f(y + r)} L${f(x)},${f(y + r * 3.6)}" stroke="#4f9a45" stroke-width="3" stroke-linecap="round"/>
    ${petals}<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.62)}" fill="${centre}" stroke="${INK}" stroke-width="2"/>`;
}

function gardenSvg() {
  const r = rng(8);

  const sky = `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#9fd6f7"/><stop offset="1" stop-color="#d9f1fd"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${PATCH_TOP}" fill="url(#sky)"/>`;

  // A smiling sun, top right (under the HUD's right side, clear of the question).
  const sx = 1110;
  const sy = 150;
  const rays = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return `<path d="M${f(sx + Math.cos(a) * 58)},${f(sy + Math.sin(a) * 58)} L${f(sx + Math.cos(a) * 76)},${f(sy + Math.sin(a) * 76)}" stroke="#ffc53d" stroke-width="8" stroke-linecap="round"/>`;
  }).join('');
  const sun = `${rays}<circle cx="${sx}" cy="${sy}" r="48" fill="#ffd95a" stroke="${INK}" stroke-width="4"/>
    <path d="M${sx - 20},${sy - 4} q6,-8 12,0 M${sx + 8},${sy - 4} q6,-8 12,0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="${sx - 26}" cy="${sy + 10}" rx="8" ry="5" fill="#f7a08f" opacity="0.9"/>
    <ellipse cx="${sx + 26}" cy="${sy + 10}" rx="8" ry="5" fill="#f7a08f" opacity="0.9"/>
    <path d="M${sx - 10},${sy + 12} q10,10 20,0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;

  const cloud = (x, y, k) =>
    `<g fill="#ffffff" stroke="#bfe2f5" stroke-width="3"><ellipse cx="${x}" cy="${y}" rx="${f(64 * k)}" ry="${f(22 * k)}"/><circle cx="${f(x - 26 * k)}" cy="${f(y - 14 * k)}" r="${f(24 * k)}"/><circle cx="${f(x + 18 * k)}" cy="${f(y - 20 * k)}" r="${f(30 * k)}"/></g>`;
  const clouds = cloud(170, 170, 1) + cloud(520, 120, 0.8) + cloud(820, 200, 0.9);

  // Rolling hills behind the fence.
  const hills = `<path d="M0,300 Q200,230 420,290 Q640,340 860,270 Q1080,210 ${W},280 L${W},${PATCH_TOP} L0,${PATCH_TOP} Z" fill="#9fd67a" stroke="#86c264" stroke-width="3"/>
    <path d="M0,340 Q260,290 520,330 Q780,370 1040,320 Q1180,296 ${W},320 L${W},${PATCH_TOP} L0,${PATCH_TOP} Z" fill="#86c95f"/>`;

  // Picket fence with a rail, along the back of the patch.
  const fenceY = 336;
  const pickets = [];
  for (let x = 6; x < W; x += 44) {
    pickets.push(
      `<path d="M${x},${fenceY + 50} L${x},${fenceY + 9} L${x + 14},${fenceY} L${x + 28},${fenceY + 9} L${x + 28},${fenceY + 50} Z" fill="#ede6d6" stroke="#6b5444" stroke-width="2" stroke-linejoin="round"/>`,
    );
  }
  const fence = `${pickets.join('')}
    <rect x="0" y="${fenceY + 20}" width="${W}" height="9" fill="#ede6d6" stroke="#6b5444" stroke-width="2"/>`;

  // Flowers along the fence foot.
  const colours = [
    ['#f7a1c4', '#ffd95a'],
    ['#ffffff', '#ffd95a'],
    ['#c8a6f2', '#fff2a8'],
    ['#ffcf66', '#f08a4b'],
  ];
  const flowers = [];
  for (let x = 30; x < W; x += 58 + r() * 30) {
    const [p, c] = colours[Math.floor(r() * colours.length)];
    flowers.push(`<g opacity="0.85">${flower(x, 374 + r() * 8, 6 + r() * 2.5, p, c)}</g>`);
  }

  // Grass strip between the fence and the patch.
  const grassBack = `<rect y="380" width="${W}" height="${PATCH_BOTTOM - 380 + 10}" fill="#7cc45a"/>`;

  // The tilled patch: soft brown with furrows.
  // A rounded bed with a softly wavy top edge and short furrow dashes (never through a hole).
  const waves = Array.from({ length: 12 }, (_, i) => {
    const x0 = 40 + ((W - 80) / 12) * i;
    const x1 = x0 + (W - 80) / 12;
    return `Q${f((x0 + x1) / 2)},${f(PATCH_TOP - 8 + (i % 2) * 4)} ${f(x1)},${PATCH_TOP}`;
  }).join(' ');
  const patch = `<path d="M80,${PATCH_TOP} ${waves.replace(/^Q[^ ]+ [^ ]+/, (m) => m)} L${W - 40},${PATCH_TOP} Q${W - 30},${PATCH_TOP} ${W - 30},${PATCH_TOP + 40} L${W - 30},${PATCH_BOTTOM - 40} Q${W - 30},${PATCH_BOTTOM} ${W - 70},${PATCH_BOTTOM} L70,${PATCH_BOTTOM} Q30,${PATCH_BOTTOM} 30,${PATCH_BOTTOM - 40} L30,${PATCH_TOP + 40} Q30,${PATCH_TOP} 80,${PATCH_TOP} Z" fill="#b98055" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    ${Array.from({ length: 22 }, () => {
      const x = 60 + r() * (W - 120);
      const y = PATCH_TOP + 18 + r() * (PATCH_BOTTOM - PATCH_TOP - 36);
      return `<path d="M${f(x)},${f(y)} q9,3 18,0" fill="none" stroke="#a46d45" stroke-width="4" stroke-linecap="round"/>`;
    }).join('')}`;

  // Front grass where the bunny hops, with tufts and a few clover flowers.
  const front = `<rect y="${PATCH_BOTTOM - 4}" width="${W}" height="${H - PATCH_BOTTOM + 4}" fill="#8fd166"/>
    <path d="M0,${PATCH_BOTTOM + 6} Q${W / 2},${PATCH_BOTTOM - 10} ${W},${PATCH_BOTTOM + 6}" fill="none" stroke="#7cc45a" stroke-width="6"/>`;
  const tufts = [];
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const y = PATCH_BOTTOM + 30 + r() * (H - PATCH_BOTTOM - 40);
    tufts.push(
      `<path d="M${f(x - 8)},${f(y)} l4,-12 l4,10 l4,-14 l4,16" fill="none" stroke="#6fb84d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  const clovers = [];
  for (let i = 0; i < 7; i++) {
    clovers.push(flower(80 + r() * (W - 160), PATCH_BOTTOM + 60 + r() * 100, 5, '#ffffff', '#ffe27a'));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${sky}${clouds}${sun}${hills}${grassBack}${fence}${flowers.join('')}${patch}${front}${tufts.join('')}${clovers.join('')}
  </svg>`;
}

async function main() {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;
  const dry = args.includes('--dry');
  const buf = await sharp(Buffer.from(gardenSvg())).png().toBuffer();
  if (!dry) {
    const existing = [PATCH_OUT, MENU_OUT].filter((o) => existsSync(o));
    if (existing.length && !args.includes('--force')) {
      console.error(
        `Refusing to overwrite ${existing.join(', ')} (pass --force). A visible change should ship under a new filename (week-long cache).`,
      );
      process.exit(1);
    }
    mkdirSync(dirname(PATCH_OUT), { recursive: true });
    await sharp(buf).webp({ quality: 88, effort: 6 }).toFile(PATCH_OUT);
    await sharp(buf).modulate({ brightness: MENU_BRIGHTNESS }).webp({ quality: 88, effort: 6 }).toFile(MENU_OUT);
    console.log(`wrote ${PATCH_OUT}\nwrote ${MENU_OUT}`);
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
