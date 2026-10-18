#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Bunny Garden garden-pieces generator (sprint 2.8).
 *
 * Original kawaii vector art drawn in code, thick dark outline throughout:
 *   - garden-carrots.webp: round stubby carrots with faces and leafy tops,
 *     one row per kind (orange, purple, yellow, white), two frames each:
 *     0 up (smiling) · 1 pulled (delighted).
 *   - garden-mole.webp: the friendly mole that pops up for a wrong pick:
 *     0 peek (smiling) · 1 wave (a paw up, a little shrug).
 *   - garden-hole.webp: 0 the hole (dark, behind a carrot) · 1 its dirt lip
 *     (in front of the carrot, so a sinking carrot disappears into it).
 *   - garden-basket.webp: 0 the back of the basket · 1 its front rim
 *     (carrots drop in between).
 * This file IS the source of the art: edit and re-run, never hand-edit the
 * shipped images.
 *
 * Usage:
 *   pnpm sprite:carrot                       # writes public/assets/sprites/hero/garden-*.webp
 *   pnpm sprite:carrot --preview <png> --dry # review sheet only, ships nothing
 *   pnpm sprite:carrot --force               # re-render over existing shipped images
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = resolve(ROOT, 'public/assets/sprites/hero');

/** Carrot and mole frames are CARROT_FRAME square; the carrot's shoulders sit at SHOULDER_Y. */
export const CARROT_FRAME = 120;
export const CARROT_KINDS = 4;
export const CARROT_FRAMES = 2;
export const MOLE_FRAMES = 2;
export const HOLE_W = 160;
export const HOLE_H = 70;
export const BASKET_W = 170;
export const BASKET_H = 120;

const INK = '#3a2420';
const BLUSH = '#f4a0a8';
const LEAF = '#5fb54f';
const LEAF_DARK = '#3f8f3a';

const KINDS = [
  { body: '#f6923a', shade: '#e07a26', ring: '#e8822c' }, // orange
  { body: '#a173d6', shade: '#8a5cc0', ring: '#9265c8' }, // purple
  { body: '#f7cc4a', shade: '#e2b232', ring: '#e8bb3a' }, // yellow
  { body: '#f6ecd6', shade: '#e3d6ba', ring: '#e9dcc0' }, // white
];

const f = (n) => n.toFixed(1);
const st = (w = 4.5) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function face(cx, eyeY, mood) {
  const eyes = [-1, 1]
    .map((side) => {
      const ex = cx + side * 14;
      if (mood === 'pulled') {
        return `<path d="M${f(ex - 7)},${f(eyeY + 3)} Q${f(ex)},${f(eyeY - 6)} ${f(ex + 7)},${f(eyeY + 3)}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
      }
      return `<ellipse cx="${f(ex)}" cy="${f(eyeY)}" rx="6.5" ry="7.2" fill="#2a1a17"/>
        <circle cx="${f(ex - 2.2)}" cy="${f(eyeY - 2.8)}" r="2.6" fill="#fff"/>
        <circle cx="${f(ex + 2.4)}" cy="${f(eyeY + 2.6)}" r="1.1" fill="#fff"/>`;
    })
    .join('');
  const blush = [-1, 1]
    .map(
      (side) =>
        `<ellipse cx="${f(cx + side * 24)}" cy="${f(eyeY + 10)}" rx="6.5" ry="4.2" fill="${BLUSH}" opacity="0.9"/>`,
    )
    .join('');
  const mouth =
    mood === 'pulled'
      ? `<path d="M${f(cx - 7)},${f(eyeY + 8)} Q${cx},${f(eyeY + 19)} ${f(cx + 7)},${f(eyeY + 8)} Z" fill="#d9536c" ${st(2.5)}/>`
      : `<path d="M${f(cx - 6)},${f(eyeY + 9)} Q${cx},${f(eyeY + 15)} ${f(cx + 6)},${f(eyeY + 9)}" fill="none" ${st(3)}/>`;
  return blush + eyes + mouth;
}

function carrotSvg(kind, mood) {
  const W = CARROT_FRAME;
  const cx = W / 2;
  const top = 44; // shoulders
  const k = KINDS[kind];
  const leaves = [-1, 0, 1]
    .map((d) => {
      const tipX = cx + d * 22;
      const tipY = 6 + Math.abs(d) * 8;
      const fill = d === 0 ? LEAF : LEAF_DARK;
      return `<path d="M${f(cx + d * 4)},${f(top + 4)} Q${f(cx + d * 22 - 12)},${f((top + tipY) / 2)} ${f(tipX)},${f(tipY)} Q${f(cx + d * 22 + 12)},${f((top + tipY) / 2 + 4)} ${f(cx + d * 6)},${f(top + 4)} Z" fill="${fill}" ${st(3.5)}/>`;
    })
    .join('');
  // A stubby, round carrot: wide shoulders, rounded point.
  const body = `<path d="M${f(cx - 34)},${f(top + 12)} Q${f(cx - 36)},${f(top - 2)} ${cx},${f(top - 2)} Q${f(cx + 36)},${f(top - 2)} ${f(cx + 34)},${f(top + 12)} Q${f(cx + 30)},${f(top + 46)} ${cx},${f(top + 70)} Q${f(cx - 30)},${f(top + 46)} ${f(cx - 34)},${f(top + 12)} Z" fill="${k.body}" ${st()}/>`;
  const rings = `<path d="M${f(cx - 26)},${f(top + 38)} q6,-3 12,0 M${f(cx + 14)},${f(top + 46)} q6,-3 10,0 M${f(cx - 12)},${f(top + 58)} q5,-2 9,0" fill="none" stroke="${k.ring}" stroke-width="3" stroke-linecap="round"/>`;
  const shine = `<ellipse cx="${f(cx - 18)}" cy="${f(top + 8)}" rx="7" ry="4" fill="#ffffff" opacity="0.55" transform="rotate(-25 ${f(cx - 18)} ${f(top + 8)})"/>`;
  const sparkle =
    mood === 'pulled'
      ? `<path d="M${f(cx + 40)},${f(top - 8)} l2.4,5 l5.4,0.6 l-4,3.6 l1.2,5.3 l-5,-2.8 l-5,2.8 l1.2,-5.3 l-4,-3.6 l5.4,-0.6 Z" fill="#ffe27a" stroke="${INK}" stroke-width="2"/>`
      : '';
  const roots =
    mood === 'pulled'
      ? `<path d="M${f(cx)},${f(top + 70)} q-4,8 -2,14 M${f(cx - 6)},${f(top + 62)} q-8,4 -12,10 M${f(cx + 7)},${f(top + 60)} q8,5 10,12" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
         <circle cx="${f(cx - 22)}" cy="${f(top + 66)}" r="3.2" fill="#8a5a3c" ${st(1.8)}/>
         <circle cx="${f(cx + 20)}" cy="${f(top + 72)}" r="2.6" fill="#8a5a3c" ${st(1.8)}/>
         <circle cx="${f(cx + 2)}" cy="${f(top + 86)}" r="2.4" fill="#8a5a3c" ${st(1.6)}/>`
      : '';
  const tilt = mood === 'pulled' ? 8 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
    <g transform="rotate(${tilt} ${cx} ${top + 30})">${roots}${leaves}${body}${rings}${shine}${face(cx, top + 16, mood)}${sparkle}</g>
  </svg>`;
}

function moleSvg(frame) {
  const W = CARROT_FRAME;
  const cx = W / 2;
  const cy = 74;
  const fur = '#a88468';
  const muzzle = '#e9c9ac';
  const head = `<path d="M${f(cx - 42)},${f(W - 6)} Q${f(cx - 46)},${f(cy - 44)} ${cx},${f(cy - 46)} Q${f(cx + 46)},${f(cy - 44)} ${f(cx + 42)},${f(W - 6)} Z" fill="${fur}" ${st()}/>`;
  const shine = `<path d="M${f(cx - 36)},${f(cy - 6)} Q${f(cx - 38)},${f(cy - 38)} ${f(cx - 4)},${f(cy - 41)}" fill="none" stroke="#c9a88c" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="${f(cx - 20)}" cy="${f(cy - 32)}" rx="9" ry="5" fill="#ffffff" opacity="0.4" transform="rotate(-25 ${f(cx - 20)} ${f(cy - 32)})"/>`;
  const muz = `<ellipse cx="${cx}" cy="${f(cy + 8)}" rx="22" ry="16" fill="${muzzle}"/>`;
  // Happy closed eyes (a friendly "hi!", never a scare).
  const eyes = [-1, 1]
    .map((side) => {
      const ex = cx + side * 17;
      const ey = cy - 14;
      return `<path d="M${f(ex - 7)},${f(ey + 2)} Q${f(ex)},${f(ey - 6)} ${f(ex + 7)},${f(ey + 2)}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    })
    .join('');
  const blush = [-1, 1]
    .map(
      (side) => `<ellipse cx="${f(cx + side * 30)}" cy="${f(cy - 2)}" rx="7" ry="4.5" fill="${BLUSH}" opacity="0.9"/>`,
    )
    .join('');
  const nose = `<ellipse cx="${cx}" cy="${f(cy + 1)}" rx="9" ry="6.5" fill="#f2879f" ${st(3)}/>
    <ellipse cx="${f(cx - 3)}" cy="${f(cy - 1)}" rx="2.6" ry="1.6" fill="#fff" opacity="0.8"/>`;
  const mouth = `<path d="M${f(cx - 7)},${f(cy + 12)} q3.5,4 7,0 q3.5,4 7,0" fill="none" ${st(3)}/>`;
  // Paws: on the hole's rim; one up and waving in frame 1.
  const paws =
    frame === 0
      ? [-1, 1]
          .map(
            (side) =>
              `<ellipse cx="${f(cx + side * 26)}" cy="${f(W - 12)}" rx="12" ry="9" fill="${muzzle}" ${st(3.5)}/>`,
          )
          .join('')
      : `<ellipse cx="${f(cx - 26)}" cy="${f(W - 12)}" rx="12" ry="9" fill="${muzzle}" ${st(3.5)}/>
         <ellipse cx="${f(cx + 44)}" cy="${f(cy - 20)}" rx="14" ry="16" fill="${muzzle}" ${st(3.5)} transform="rotate(20 ${f(cx + 44)} ${f(cy - 20)})"/>
         <path d="M${f(cx + 40)},${f(cy - 34)} l-2,-5 M${f(cx + 46)},${f(cy - 35)} l0,-6 M${f(cx + 52)},${f(cy - 32)} l2,-5" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
         <path d="M${f(cx + 58)},${f(cy - 44)} q7,4 5,11 M${f(cx + 64)},${f(cy - 34)} q5,3 3,8" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
    ${head}${shine}${muz}${blush}${eyes}${nose}${mouth}${paws}
  </svg>`;
}

function holeSvg(part) {
  const W = HOLE_W;
  const H = HOLE_H;
  const cx = W / 2;
  if (part === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <ellipse cx="${cx}" cy="${H / 2 - 2}" rx="${W / 2 - 16}" ry="${H / 2 - 16}" fill="#3a2418" ${st(4)}/>
    </svg>`;
  }
  // The front lip: a soft mound of dirt with a bumpy top edge and crumbs.
  const top = H / 2 - 2;
  const bumps = [
    [14, top + 6],
    [40, top + 12],
    [cx, top + 15],
    [W - 40, top + 12],
    [W - 14, top + 6],
  ];
  let d = `M6,${top + 4}`;
  for (let i = 0; i < bumps.length; i++) {
    const [x, y] = bumps[i];
    d += ` Q${f(x - 12)},${f(y - 9)} ${f(x)},${f(y)}`;
  }
  d += ` Q${W - 2},${H - 6} ${cx},${H - 2} Q2,${H - 6} 6,${top + 4} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path d="${d}" fill="#d39a6c" ${st(4)}/>
    <path d="M30,${top + 22} Q${cx},${top + 32} ${W - 30},${top + 22}" fill="none" stroke="#e6b487" stroke-width="4" stroke-linecap="round"/>
    <circle cx="26" cy="${H - 12}" r="3.6" fill="#a8714a" ${st(2)}/>
    <circle cx="${W - 30}" cy="${H - 10}" r="3" fill="#a8714a" ${st(2)}/>
    <circle cx="${cx + 14}" cy="${H - 7}" r="2.6" fill="#a8714a" ${st(1.8)}/>
  </svg>`;
}

function basketSvg(part) {
  const W = BASKET_W;
  const H = BASKET_H;
  const cx = W / 2;
  const rimY = 50;
  const weave = '#e0aa62';
  const weaveDark = '#bf8945';
  if (part === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <path d="M26,${rimY} Q${cx},-2 ${W - 26},${rimY}" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>
      <path d="M26,${rimY} Q${cx},-2 ${W - 26},${rimY}" fill="none" stroke="${weave}" stroke-width="8" stroke-linecap="round"/>
      <ellipse cx="${cx}" cy="${rimY}" rx="${W / 2 - 10}" ry="15" fill="#8f6234" ${st(4)}/>
      <ellipse cx="${cx}" cy="${rimY + 2}" rx="${W / 2 - 22}" ry="9" fill="#6e4a26"/>
    </svg>`;
  }
  // Front: a round woven side (two rows of little weave bumps) and one pink bow.
  const row = (y, offset) =>
    Array.from({ length: 7 }, (_, i) => {
      const x = 26 + i * 20 + offset;
      return `<path d="M${f(x - 8)},${f(y)} q8,-7 16,0" fill="none" stroke="${weaveDark}" stroke-width="3" stroke-linecap="round"/>`;
    }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path d="M8,${rimY} Q${cx},${rimY + 16} ${W - 8},${rimY} Q${W - 10},${H - 6} ${cx},${H - 4} Q10,${H - 6} 8,${rimY} Z" fill="${weave}" ${st()}/>
    ${row(rimY + 30, 0)}${row(rimY + 50, 10)}
    <path d="M8,${rimY} Q${cx},${rimY + 16} ${W - 8},${rimY}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    <path d="M${cx - 4},${rimY + 12} q-16,-12 -18,2 q2,12 18,0 Z M${cx + 4},${rimY + 12} q16,-12 18,2 q-2,12 -18,0 Z" fill="#f28aa5" ${st(3)}/>
    <path d="M${cx - 3},${rimY + 14} l-6,14 M${cx + 3},${rimY + 14} l6,14" stroke="#f28aa5" stroke-width="5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${rimY + 12}" r="6" fill="#f28aa5" ${st(3)}/>
  </svg>`;
}

// ---------- render ----------

function refuseOverwrite(paths, force) {
  const existing = paths.filter((p) => existsSync(p));
  if (existing.length === 0 || force) return;
  console.error('Refusing to overwrite shipped assets (pass --force to re-render in place):');
  for (const p of existing) console.error(`  ${p}`);
  console.error('A visible change should ship under a new filename (week-long cache).');
  process.exit(1);
}

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

/** Packs `grid` (rows of SVGs) into one PNG of cell w × h. */
async function sheet(grid, w, h) {
  const cells = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) cells.push({ input: await png(grid[r][c]), left: c * w, top: r * h });
  }
  const cols = Math.max(...grid.map((row) => row.length));
  return sharp({
    create: { width: w * cols, height: h * grid.length, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(cells)
    .png()
    .toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;
  const dry = args.includes('--dry');
  const outs = {
    carrots: resolve(OUT_DIR, 'garden-carrots.webp'),
    mole: resolve(OUT_DIR, 'garden-mole.webp'),
    hole: resolve(OUT_DIR, 'garden-hole.webp'),
    basket: resolve(OUT_DIR, 'garden-basket.webp'),
  };
  if (!dry) {
    mkdirSync(OUT_DIR, { recursive: true });
    refuseOverwrite(Object.values(outs), args.includes('--force'));
  }

  const carrots = await sheet(
    KINDS.map((_, k) => [carrotSvg(k, 'up'), carrotSvg(k, 'pulled')]),
    CARROT_FRAME,
    CARROT_FRAME,
  );
  const mole = await sheet([[moleSvg(0), moleSvg(1)]], CARROT_FRAME, CARROT_FRAME);
  const hole = await sheet([[holeSvg(0), holeSvg(1)]], HOLE_W, HOLE_H);
  const basket = await sheet([[basketSvg(0), basketSvg(1)]], BASKET_W, BASKET_H);

  if (!dry) {
    for (const [name, buf] of Object.entries({ carrots, mole, hole, basket })) {
      await sharp(buf).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(outs[name]);
      console.log(`wrote ${outs[name]}`);
    }
  }

  if (previewPath) {
    // Review sheet: everything on the garden's dirt colour, plus a carrot sitting in a hole.
    const W = 760;
    const H = 520;
    const holeBack = await sharp(hole).extract({ left: 0, top: 0, width: HOLE_W, height: HOLE_H }).png().toBuffer();
    const holeFront = await sharp(hole)
      .extract({ left: HOLE_W, top: 0, width: HOLE_W, height: HOLE_H })
      .png()
      .toBuffer();
    const oneCarrot = await sharp(carrots)
      .extract({ left: 0, top: 0, width: CARROT_FRAME, height: CARROT_FRAME })
      .png()
      .toBuffer();
    const oneMole = await sharp(mole)
      .extract({ left: CARROT_FRAME, top: 0, width: CARROT_FRAME, height: CARROT_FRAME })
      .png()
      .toBuffer();
    await sharp({ create: { width: W, height: H, channels: 4, background: '#c9e7a0' } })
      .composite([
        { input: carrots, left: 10, top: 10 },
        { input: mole, left: 270, top: 10 },
        { input: basket, left: 270, top: 150 },
        { input: hole, left: 270, top: 290 },
        { input: holeBack, left: 560, top: 120 },
        { input: oneCarrot, left: 580, top: 60 },
        { input: holeFront, left: 560, top: 120 },
        { input: holeBack, left: 560, top: 300 },
        { input: oneMole, left: 580, top: 250 },
        { input: holeFront, left: 560, top: 300 },
      ])
      .png()
      .toFile(previewPath);
    console.log(`wrote preview ${previewPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
