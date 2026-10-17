#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Space Shooter alien-ship generator: 20 cartoon alien ships, drawn in code
 * in a bold-outline comic style to sit behind the cockpit window. Each ship
 * has a dark round "porthole" in the middle where the game prints the
 * answer (white text, dark outline), plus a little alien pilot's eyes.
 *
 * 10 hull shapes × 2 looks (colours, eye style, spots) = 20 ships, packed
 * into one sprite sheet (COLS × ROWS frames of FRAME² px). This file IS the
 * source of the art — edit and re-run, never hand-edit the shipped sheet.
 *
 * Usage:
 *   pnpm sprite:alienships                  # writes public/assets/sprites/hero/alien-ships.webp
 *   pnpm sprite:alienships --preview <png>  # also writes a review sheet on a space backdrop
 *   pnpm sprite:alienships --force          # re-render over the shipped sheet
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = resolve(ROOT, 'public/assets/sprites/hero');

export const FRAME = 240;
export const COLS = 5;
export const ROWS = 4;
/** The answer porthole: centre + radius in frame px (the game centres its label here). */
export const BADGE = { x: 120, y: 132, r: 46 };

const C = FRAME / 2;
const INK = '#151a2e';
const f = (n) => n.toFixed(1);
const ink = (w = 5) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/** body / shade / trim (lights, rims) / glass (domes, windows). */
const PALETTES = [
  { body: '#7bd84a', shade: '#3f8f22', trim: '#ffe14d', glass: '#b9f0ff' },
  { body: '#ff5fa2', shade: '#b52a66', trim: '#7ff7ff', glass: '#ffe0f0' },
  { body: '#ff9a2e', shade: '#b8560a', trim: '#7cf28a', glass: '#fff1c2' },
  { body: '#33c9c1', shade: '#147a78', trim: '#ff6b8a', glass: '#d6fff9' },
  { body: '#a46bff', shade: '#5f2fb8', trim: '#ffd23f', glass: '#ecdcff' },
  { body: '#ff4b4b', shade: '#a81e2a', trim: '#ffe98a', glass: '#ffd9d9' },
  { body: '#ffd23f', shade: '#b88a00', trim: '#5ad1ff', glass: '#fffbe0' },
  { body: '#4aa8ff', shade: '#1d5fb3', trim: '#ff9ad6', glass: '#dff0ff' },
  { body: '#b8e04a', shade: '#6d8f16', trim: '#ff7a3d', glass: '#f3ffd0' },
  { body: '#ff7ad9', shade: '#a8338a', trim: '#9cff6b', glass: '#ffe3f7' },
];

// ---------- shared parts ----------

/** Two cartoon eyes (or one big eye) centred at (x, y). */
function eyes(x, y, size, cyclops) {
  const eye = (ex, r) =>
    `<ellipse cx="${f(ex)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 1.15)}" fill="#fff" ${ink(3.5)}/>` +
    `<circle cx="${f(ex + r * 0.15)}" cy="${f(y + r * 0.2)}" r="${f(r * 0.5)}" fill="${INK}"/>` +
    `<circle cx="${f(ex - r * 0.05)}" cy="${f(y - r * 0.05)}" r="${f(r * 0.17)}" fill="#fff"/>`;
  return cyclops ? eye(x, size * 1.45) : eye(x - size * 1.15, size) + eye(x + size * 1.15, size);
}

/** A limb / horn / tail: dark outline under a coloured stroke, so it reads on dark space. */
const limb = (d, color, w = 7) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 6}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Glossy highlight blob (comic shine). */
const shine = (x, y, rx, ry, rot = -25) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity="0.38" transform="rotate(${rot} ${x} ${y})"/>`;

/** A few round spots (second look). */
const spots = (pts, p) =>
  pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${p.shade}" opacity="0.55"/>`).join('');

/** Little blinking lights along a list of points. */
const lights = (pts, p) =>
  pts.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="6" fill="${p.trim}" ${ink(3)}/>`).join('');

/** The answer porthole: dark glass, a coloured rim, a glint. */
function badge(p) {
  const { x, y, r } = BADGE;
  return (
    `<circle cx="${x}" cy="${y}" r="${r + 7}" fill="${p.trim}" ${ink(5)}/>` +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#121a35" ${ink(3)}/>` +
    `<path d="M${x - r * 0.62},${y - r * 0.35} A${r * 0.72},${r * 0.72} 0 0 1 ${x - r * 0.05},${y - r * 0.72}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.35"/>`
  );
}

// ---------- hulls ----------
// Each returns [behind-badge art, in-front-of-badge art]. `alt` = second look.

const HULLS = [
  // 0 classic saucer with a glass dome
  (p, alt) => [
    `<ellipse cx="${C}" cy="186" rx="70" ry="18" fill="${p.shade}" ${ink()}/>` +
      `<path d="M66,112 A54,54 0 0 1 174,112 Z" fill="${p.glass}" ${ink()}/>` +
      eyes(C, 84, 11, alt) +
      `<ellipse cx="${C}" cy="146" rx="114" ry="40" fill="${p.body}" ${ink()}/>` +
      `<ellipse cx="${C}" cy="158" rx="104" ry="24" fill="${p.shade}" opacity="0.35"/>` +
      shine(70, 132, 26, 9, -8) +
      lights(
        [
          [22, 150],
          [218, 150],
        ],
        p,
      ),
    alt
      ? ''
      : lights(
          [
            [52, 170],
            [188, 170],
          ],
          p,
        ),
  ],
  // 1 rocket pod with fins and a flame
  (p, alt) => [
    `<path d="M92,200 Q120,246 148,200 Z" fill="#ffb347" ${ink(4)}/><path d="M106,202 Q120,230 134,202 Z" fill="#fff07a"/>` +
      `<path d="M66,150 L26,206 L72,196 Z" fill="${p.shade}" ${ink()}/><path d="M174,150 L214,206 L168,196 Z" fill="${p.shade}" ${ink()}/>` +
      `<rect x="62" y="22" width="116" height="186" rx="58" fill="${p.body}" ${ink()}/>` +
      `<rect x="72" y="40" width="22" height="150" rx="11" fill="#fff" opacity="0.14"/>` +
      (alt
        ? spots(
            [
              [150, 190, 9],
              [86, 186, 7],
            ],
            p,
          )
        : '') +
      shine(92, 46, 14, 8),
    eyes(C, 66, 11, alt),
  ],
  // 2 beetle with horns and legs
  (p, alt) => [
    [-1, 1]
      .map((s) =>
        [0, 1, 2].map((k) => limb(`M${C + s * 80},${120 + k * 30} l${s * 26},${10 + k * 4}`, p.shade, 6)).join(''),
      )
      .join('') +
      limb('M92,48 Q70,14 50,22', p.shade) +
      limb('M148,48 Q170,14 190,22', p.shade) +
      `<circle cx="50" cy="22" r="8" fill="${p.trim}" ${ink(3)}/><circle cx="190" cy="22" r="8" fill="${p.trim}" ${ink(3)}/>` +
      `<circle cx="${C}" cy="134" r="92" fill="${p.body}" ${ink()}/>` +
      `<path d="M${C},44 L${C},226" ${ink(4)} opacity="0.6"/>` +
      (alt
        ? spots(
            [
              [66, 108, 10],
              [176, 112, 12],
              [70, 180, 9],
              [172, 182, 8],
            ],
            p,
          )
        : '') +
      shine(80, 84, 22, 11),
    eyes(C, 66, 10, alt),
  ],
  // 3 manta-ray wing ship
  (p, alt) => [
    limb('M120,186 Q126,218 112,232', p.shade, 6) +
      `<path d="M8,124 Q52,60 120,68 Q188,60 232,124 Q190,150 156,196 L120,178 L84,196 Q50,150 8,124 Z" fill="${p.body}" ${ink()}/>` +
      `<path d="M30,124 Q70,96 104,104" fill="none" stroke="${p.shade}" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M210,124 Q170,96 136,104" fill="none" stroke="${p.shade}" stroke-width="5" stroke-linecap="round"/>` +
      (alt
        ? lights(
            [
              [36, 130],
              [204, 130],
            ],
            p,
          )
        : '') +
      shine(70, 92, 20, 8, -20),
    eyes(C, 82, 10, alt),
  ],
  // 4 ring ship with a cockpit bubble on top
  (p, alt) => [
    `<circle cx="${C}" cy="${BADGE.y}" r="100" fill="${p.body}" ${ink()}/>` +
      `<circle cx="${C}" cy="${BADGE.y}" r="70" fill="${p.shade}" ${ink(4)}/>` +
      lights(
        Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          return [C + Math.cos(a) * 86, BADGE.y + Math.sin(a) * 86];
        }),
        p,
      ) +
      shine(72, 74, 20, 9),
    `<path d="M88,40 A32,32 0 0 1 152,40 L150,46 L90,46 Z" fill="${p.glass}" ${ink()}/>` + eyes(C, 30, 8, alt),
  ],
  // 5 crab with raised claws and eye stalks
  (p, alt) => [
    limb('M50,130 Q22,104 34,72', p.shade, 9) +
      limb('M190,130 Q218,104 206,72', p.shade, 9) +
      `<path d="M34,72 m-22,0 a22,22 0 1 1 44,0 l-14,-4 l-8,10 z" fill="${p.body}" ${ink()}/>` +
      `<path d="M206,72 m-22,0 a22,22 0 1 1 44,0 l-14,-4 l-8,10 z" fill="${p.body}" ${ink()}/>` +
      limb('M98,76 L94,46', p.shade, 5) +
      limb('M142,76 L146,46', p.shade, 5) +
      `<ellipse cx="${C}" cy="140" rx="92" ry="70" fill="${p.body}" ${ink()}/>` +
      `<path d="M44,170 Q120,214 196,170" fill="none" stroke="${p.shade}" stroke-width="6" stroke-linecap="round"/>` +
      (alt
        ? spots(
            [
              [62, 130, 8],
              [178, 128, 9],
            ],
            p,
          )
        : '') +
      shine(78, 100, 20, 9),
    alt ? eyes(C, 40, 9, true) : `${eyes(94, 40, 8, true)}${eyes(146, 40, 8, true)}`,
  ],
  // 6 space jellyfish
  (p, alt) => [
    [60, 90, 120, 150, 180]
      .map(
        (x, i) =>
          `<path d="M${x},176 q${i % 2 ? 14 : -14},18 0,34 q${i % 2 ? -14 : 14},14 0,28" fill="none" stroke="${p.shade}" stroke-width="7" stroke-linecap="round"/>`,
      )
      .join('') +
      `<path d="M28,140 A92,92 0 0 1 212,140 Q196,156 180,146 Q166,166 150,150 Q136,170 120,152 Q104,170 90,150 Q74,166 60,146 Q44,156 28,140 Z" fill="${p.body}" ${ink()}/>` +
      `<path d="M28,140 A92,92 0 0 1 212,140" fill="none" stroke="${p.glass}" stroke-width="6" opacity="0.6"/>` +
      shine(76, 74, 22, 11),
    eyes(C, 74, 10, alt),
  ],
  // 7 X-wing fighter
  (p, alt) => [
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]
      .map(([sx, sy]) => {
        const x2 = C + sx * 104;
        const y2 = BADGE.y + sy * 78;
        return (
          `<path d="M${C},${BADGE.y} L${x2},${y2}" stroke="${INK}" stroke-width="30" stroke-linecap="round"/>` +
          `<path d="M${C},${BADGE.y} L${x2},${y2}" stroke="${p.shade}" stroke-width="20" stroke-linecap="round"/>` +
          `<circle cx="${x2}" cy="${y2}" r="13" fill="${p.trim}" ${ink(4)}/>`
        );
      })
      .join('') +
      `<circle cx="${C}" cy="${BADGE.y}" r="76" fill="${p.body}" ${ink()}/>` +
      (alt
        ? spots(
            [
              [76, 168, 8],
              [166, 170, 7],
            ],
            p,
          )
        : '') +
      shine(86, 86, 20, 9),
    eyes(C, 72, 9, alt),
  ],
  // 8 teardrop squid
  (p, alt) => [
    [
      [78, -1],
      [104, -1],
      [136, 1],
      [162, 1],
    ]
      .map(
        ([x, s]) =>
          `<path d="M${x},188 q${s * 10},20 ${s * -2},38" fill="none" stroke="${p.shade}" stroke-width="9" stroke-linecap="round"/>`,
      )
      .join('') +
      `<path d="M120,10 C196,70 210,170 120,198 C30,170 44,70 120,10 Z" fill="${p.body}" ${ink()}/>` +
      (alt
        ? spots(
            [
              [64, 150, 8],
              [178, 150, 8],
              [120, 196, 6],
            ],
            p,
          )
        : '') +
      shine(92, 58, 13, 8, -40),
    eyes(C, 66, 11, alt),
  ],
  // 9 boxy drone with an antenna
  (p, alt) => [
    limb(`M${C},34 L${C},10`, p.shade, 4) +
      `<circle cx="${C}" cy="8" r="8" fill="${p.trim}" ${ink(3)}/>` +
      `<rect x="10" y="108" width="24" height="56" rx="8" fill="${p.shade}" ${ink(4)}/><rect x="206" y="108" width="24" height="56" rx="8" fill="${p.shade}" ${ink(4)}/>` +
      `<rect x="28" y="34" width="184" height="184" rx="34" fill="${p.body}" ${ink()}/>` +
      `<rect x="54" y="56" width="132" height="38" rx="19" fill="${p.glass}" ${ink(4)}/>` +
      lights(
        [
          [48, 200],
          [192, 200],
        ],
        p,
      ) +
      (alt
        ? spots(
            [
              [58, 120, 7],
              [182, 120, 7],
            ],
            p,
          )
        : '') +
      shine(60, 48, 16, 6, -10),
    eyes(C, 75, 9, alt),
  ],
];

export const SHIP_COUNT = HULLS.length * 2;

function shipSvg(i) {
  const hull = HULLS[Math.floor(i / 2)];
  const alt = i % 2 === 1;
  const p = PALETTES[(Math.floor(i / 2) * 3 + (alt ? 5 : 0)) % PALETTES.length];
  const [behind, front] = hull(p, alt);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME}" height="${FRAME}" viewBox="0 0 ${FRAME} ${FRAME}">${behind}${badge(p)}${front}</svg>`;
}

// ---------- render ----------

/**
 * Rasterize a ship and put a soft pale halo behind it, so the dark comic
 * outline still separates the ship from the dark space backdrop.
 */
async function withHalo(svg) {
  const ship = await sharp(Buffer.from(svg)).png().toBuffer();
  const alpha = await sharp(ship).extractChannel(3).blur(5).linear(0.55, 0).toBuffer();
  const halo = await sharp({ create: { width: FRAME, height: FRAME, channels: 3, background: '#cfe6ff' } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return sharp(halo)
    .composite([{ input: ship }])
    .png()
    .toBuffer();
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
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;
  mkdirSync(OUT_DIR, { recursive: true });
  const out = resolve(OUT_DIR, 'alien-ships.webp');
  refuseOverwrite([out], args.includes('--force'));

  const frames = await Promise.all(Array.from({ length: SHIP_COUNT }, (_, i) => withHalo(shipSvg(i))));
  const sheet = await sharp({
    create: { width: FRAME * COLS, height: FRAME * ROWS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(frames.map((input, i) => ({ input, left: (i % COLS) * FRAME, top: Math.floor(i / COLS) * FRAME })))
    .png()
    .toBuffer();
  await sharp(sheet).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(out);
  console.log(`wrote ${out}`);

  if (previewPath) {
    await sharp({ create: { width: FRAME * COLS, height: FRAME * ROWS, channels: 4, background: '#0b1024' } })
      .composite([{ input: sheet, left: 0, top: 0 }])
      .png()
      .toFile(previewPath);
    console.log(`wrote preview ${previewPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
