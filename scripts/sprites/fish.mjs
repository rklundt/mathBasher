#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Penguin Slide fish + snowball generator (sprint 2.7).
 *
 * Original kawaii vector art drawn in code. The fish carry the answers: a
 * round body seen from the front, two big shiny eyes, blush, a smile and a
 * little tail, in several colours, each with a two-frame wiggle. A wrong
 * answer turns out to be a snowball (BONK!), so the snowball sheet has a
 * whole frame and a burst-open frame. The answer itself is drawn in the
 * game on a dark badge, not here. This file IS the source of the art: edit
 * and re-run, never hand-edit the shipped sheets.
 *
 * Usage:
 *   pnpm sprite:fish                       # writes public/assets/sprites/hero/{slide-fish,snowball}.webp
 *   pnpm sprite:fish --preview <png>       # also writes a review sheet
 *   pnpm sprite:fish --preview <png> --dry # review sheet only, ships nothing
 *   pnpm sprite:fish --force               # re-render over existing shipped sheets
 *
 * Fish sheet: one row per colour, WIGGLE_FRAMES frames each (FRAME × FRAME).
 * Snowball sheet: 0 whole · 1 burst.
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = resolve(ROOT, 'public/assets/sprites/hero');

export const FRAME = 120;
export const WIGGLE_FRAMES = 2;

const INK = '#3a2420';
const COLOURS = [
  { body: '#ffbe76', fin: '#ff9d47' },
  { body: '#86d6e8', fin: '#5cbcd2' },
  { body: '#ffadc4', fin: '#f286a5' },
  { body: '#bde597', fin: '#93c86b' },
  { body: '#c9b6f2', fin: '#a98fe6' },
];
export const FISH_COLOURS = COLOURS.length;

const f = (n) => n.toFixed(1);
const st = (w = 4) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function fishSvg(c, frame) {
  const CX = FRAME / 2;
  const CY = FRAME / 2 + 6;
  const sway = frame === 0 ? -6 : 6;
  const tail = `<path d="M${f(CX + 30)},${f(CY)} Q${f(CX + 52)},${f(CY - 24 + sway)} ${f(CX + 56)},${f(CY - 8 + sway)} Q${f(CX + 48)},${f(CY)} ${f(CX + 56)},${f(CY + 8 + sway)} Q${f(CX + 52)},${f(CY + 24 + sway)} ${f(CX + 30)},${f(CY)} Z" fill="${c.fin}" ${st()}/>`;
  const topFin = `<path d="M${f(CX - 12)},${f(CY - 30)} Q${f(CX - 2)},${f(CY - 50)} ${f(CX + 14)},${f(CY - 30)} Z" fill="${c.fin}" ${st()}/>`;
  const sideFin = (side) =>
    `<path d="M${f(CX + side * 30)},${f(CY + 6)} q${f(side * 14)},${f(frame === 0 ? 2 : 8)} ${f(side * 16)},${f(frame === 0 ? 14 : 18)} q${f(-side * 12)},-2 ${f(-side * 18)},-8 Z" fill="${c.fin}" ${st(3.5)}/>`;
  const body = `<ellipse cx="${CX}" cy="${f(CY)}" rx="36" ry="32" fill="${c.body}" ${st()}/>`;
  const shine = `<ellipse cx="${f(CX - 16)}" cy="${f(CY - 18)}" rx="8" ry="4" fill="#ffffff" opacity="0.55" transform="rotate(-25 ${f(CX - 16)} ${f(CY - 18)})"/>`;
  const eye = (side) => {
    const ex = CX + side * 13;
    const ey = CY - 4;
    return `<circle cx="${f(ex)}" cy="${f(ey)}" r="7.5" fill="#2a1a17"/>
      <circle cx="${f(ex - 2.6)}" cy="${f(ey - 2.8)}" r="2.8" fill="#ffffff"/>
      <circle cx="${f(ex + 2.4)}" cy="${f(ey + 2.4)}" r="1.2" fill="#ffffff"/>`;
  };
  const blush = [-1, 1]
    .map(
      (side) => `<ellipse cx="${f(CX + side * 24)}" cy="${f(CY + 8)}" rx="6" ry="3.8" fill="#ff7f8a" opacity="0.7"/>`,
    )
    .join('');
  const mouth = `<path d="M${f(CX - 5)},${f(CY + 9)} Q${CX},${f(CY + 15)} ${f(CX + 5)},${f(CY + 9)}" fill="none" ${st(3)}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME}" height="${FRAME}" viewBox="0 0 ${FRAME} ${FRAME}">
    ${tail}${topFin}${sideFin(-1)}${sideFin(1)}${body}${shine}${blush}${eye(-1)}${eye(1)}${mouth}
  </svg>`;
}

function snowballSvg(frame) {
  const CX = FRAME / 2;
  const CY = FRAME / 2 + 4;
  if (frame === 0) {
    // A round snowball with a grumpy little face — the wrong answer.
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME}" height="${FRAME}" viewBox="0 0 ${FRAME} ${FRAME}">
      <circle cx="${CX}" cy="${CY}" r="36" fill="#ffffff" ${st()}/>
      <path d="M${f(CX - 24)},${f(CY - 18)} q10,-10 22,-4 M${f(CX + 6)},${f(CY + 22)} q10,0 16,-8" fill="none" stroke="#d6e4f2" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${f(CX - 12)}" cy="${f(CY - 2)}" r="5" fill="#2a1a17"/><circle cx="${f(CX + 12)}" cy="${f(CY - 2)}" r="5" fill="#2a1a17"/>
      <path d="M${f(CX - 20)},${f(CY - 12)} l10,4 M${f(CX + 20)},${f(CY - 12)} l-10,4" ${st(3)}/>
      <path d="M${f(CX - 6)},${f(CY + 12)} q6,-4 12,0" fill="none" ${st(3)}/>
    </svg>`;
  }
  // Burst: chunks of snow flying out.
  const chunks = [
    [-30, -22, 12],
    [26, -26, 10],
    [34, 10, 12],
    [-34, 16, 11],
    [0, -38, 9],
    [-6, 30, 13],
  ]
    .map(([dx, dy, r]) => `<circle cx="${f(CX + dx)}" cy="${f(CY + dy)}" r="${r}" fill="#ffffff" ${st(3.5)}/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME}" height="${FRAME}" viewBox="0 0 ${FRAME} ${FRAME}">
    ${chunks}
    <path d="M${CX},${f(CY - 8)} l3,7 l7,1 l-5,5 l1.5,7 l-6.5,-3.5 l-6.5,3.5 l1.5,-7 l-5,-5 l7,-1 Z" fill="#ffd34d" ${st(2.5)}/>
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

async function grid(rows, w, h) {
  const cols = Math.max(...rows.map((r) => r.length));
  const bufs = await Promise.all(rows.map((r) => Promise.all(r.map(png))));
  return sharp({
    create: { width: w * cols, height: h * rows.length, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(bufs.flatMap((r, y) => r.map((input, x) => ({ input, left: x * w, top: y * h }))))
    .png()
    .toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;
  const dry = args.includes('--dry');
  const fishOut = resolve(OUT_DIR, 'slide-fish.webp');
  const snowOut = resolve(OUT_DIR, 'snowball.webp');
  if (!dry) {
    mkdirSync(OUT_DIR, { recursive: true });
    refuseOverwrite([fishOut, snowOut], args.includes('--force'));
  }

  const fish = await grid(
    COLOURS.map((c) => Array.from({ length: WIGGLE_FRAMES }, (_, i) => fishSvg(c, i))),
    FRAME,
    FRAME,
  );
  const snow = await grid([[snowballSvg(0), snowballSvg(1)]], FRAME, FRAME);
  if (!dry) {
    await sharp(fish).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(fishOut);
    await sharp(snow).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(snowOut);
    console.log(`wrote ${fishOut}\nwrote ${snowOut}`);
  }
  if (previewPath) {
    const meta = await sharp(fish).metadata();
    await sharp({
      create: {
        width: Math.max(meta.width, FRAME * 2),
        height: meta.height + FRAME,
        channels: 4,
        background: '#dbeefc',
      },
    })
      .composite([
        { input: fish, left: 0, top: 0 },
        { input: snow, left: 0, top: meta.height },
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
