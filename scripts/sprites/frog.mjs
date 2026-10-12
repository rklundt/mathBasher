#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Frog Splash frog + fly generator (sprint 2.5.6).
 *
 * The frog is original vector art drawn in code, seen from the front (a
 * cute "sitting frog" pose) and hopping UP the screen. This script builds
 * one SVG per pose, rasterizes it with sharp, and packs the poses into one
 * horizontal sprite sheet per colorway. This file IS the source of the art
 * — edit and re-run, never hand-edit the shipped sheets.
 *
 * Usage:
 *   pnpm sprite:frog                  # writes public/assets/sprites/hero/frog-*.webp + fly.webp
 *   pnpm sprite:frog --preview <png>  # also writes a review sheet
 *   pnpm sprite:frog --force          # re-render over existing shipped sheets
 *
 * Frog sheet layout (FRAME × FRAME each, frog centred, feet near the bottom):
 *   0 sit · 1 blink · 2 crouch · 3 leap · 4 mouth open (tongue drawn in game) · 5 oops (falling in)
 * Fly sheet: FLY_FRAMES wing-flap frames.
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = resolve(ROOT, 'public/assets/sprites/hero');

export const FRAME = 220;
export const POSES = ['sit', 'blink', 'crouch', 'leap', 'mouth', 'oops'];
export const FLY_W = 72;
export const FLY_H = 56;
export const FLY_FRAMES = 2;

/** Colorways — body / dark (outline + spots) / belly / cheeks / eye ring. */
const COLORWAYS = {
  green: { body: '#74c94f', dark: '#2f7a1f', belly: '#eaf7b5', spot: '#4f9f33', blush: '#ff8fa3' },
  blue: { body: '#55b8d6', dark: '#1e5f86', belly: '#dcf4fb', spot: '#3189b0', blush: '#ff9ab5' },
  orange: { body: '#f7a73f', dark: '#9a4c0c', belly: '#fff1c9', spot: '#d9771c', blush: '#ff8a8a' },
};

const f = (n) => n.toFixed(1);

/**
 * One frog pose as an SVG string. Everything is built around a centre x
 * (CX) and a "ground" y where the feet rest; poses squash / stretch the
 * body and move the legs.
 */
function frogSvg(c, pose) {
  const CX = FRAME / 2;
  const ground = FRAME - 18;
  const stroke = `stroke="${c.dark}" stroke-width="4" stroke-linejoin="round"`;
  // Pose parameters.
  const p = {
    sit: { sy: 1, lift: 0, legOut: 0, arms: 'down' },
    blink: { sy: 1, lift: 0, legOut: 0, arms: 'down' },
    crouch: { sy: 0.84, lift: 0, legOut: 10, arms: 'down' },
    leap: { sy: 1.12, lift: 22, legOut: -8, arms: 'up' },
    mouth: { sy: 1, lift: 0, legOut: 0, arms: 'down' },
    oops: { sy: 1.04, lift: 8, legOut: 14, arms: 'up' },
  }[pose];

  const bodyCy = ground - 52 * p.sy - p.lift;
  const headCy = bodyCy - 40 * p.sy;

  // --- Back legs (haunches + feet) ---
  let backLegs;
  if (pose === 'leap') {
    // Legs stretched down behind, long and thin, feet splayed.
    backLegs = [-1, 1]
      .map((s) => {
        const hx = CX + s * 34;
        const hy = bodyCy + 22;
        const kx = CX + s * 30;
        const ky = ground - 8;
        const fx = CX + s * 44;
        const fy = ground + 4;
        return `<path d="M${f(hx)},${f(hy)} Q${f(CX + s * 52)},${f(bodyCy + 50)} ${f(kx)},${f(ky)}" fill="none" stroke="${c.dark}" stroke-width="18" stroke-linecap="round"/>
          <path d="M${f(hx)},${f(hy)} Q${f(CX + s * 52)},${f(bodyCy + 50)} ${f(kx)},${f(ky)}" fill="none" stroke="${c.body}" stroke-width="11" stroke-linecap="round"/>
          ${foot(c, fx, fy, s, 1.05)}`;
      })
      .join('');
  } else {
    backLegs = [-1, 1]
      .map((s) => {
        const hx = CX + s * (48 + p.legOut);
        const hy = ground - 26;
        return `<ellipse cx="${f(hx)}" cy="${f(hy)}" rx="30" ry="${f(24 * Math.min(1, p.sy + 0.08))}" fill="${c.body}" ${stroke}/>
          <ellipse cx="${f(hx - s * 6)}" cy="${f(hy - 6)}" rx="10" ry="6" fill="#fff" opacity="0.25"/>
          ${foot(c, CX + s * (62 + p.legOut), ground - 4, s, 1)}`;
      })
      .join('');
  }

  // --- Body + belly ---
  const body = `<ellipse cx="${CX}" cy="${f(bodyCy)}" rx="52" ry="${f(46 * p.sy)}" fill="${c.body}" ${stroke}/>
    <ellipse cx="${CX}" cy="${f(bodyCy + 8 * p.sy)}" rx="34" ry="${f(30 * p.sy)}" fill="${c.belly}"/>`;

  // --- Front arms ---
  const arms = [-1, 1]
    .map((s) => {
      if (p.arms === 'up') {
        const x0 = CX + s * 30;
        const y0 = bodyCy - 4;
        const x1 = CX + s * 58;
        const y1 = bodyCy - 30;
        return `<path d="M${f(x0)},${f(y0)} L${f(x1)},${f(y1)}" stroke="${c.dark}" stroke-width="14" stroke-linecap="round"/>
          <path d="M${f(x0)},${f(y0)} L${f(x1)},${f(y1)}" stroke="${c.body}" stroke-width="8" stroke-linecap="round"/>
          ${hand(c, x1, y1, s)}`;
      }
      // Chunky front legs from the shoulders, angled slightly outward.
      const x0 = CX + s * 30;
      const x1 = CX + s * 38;
      return `<path d="M${f(x0)},${f(bodyCy - 4)} Q${f(CX + s * 42)},${f(bodyCy + 22)} ${f(x1)},${f(ground - 8)}" fill="none" stroke="${c.dark}" stroke-width="20" stroke-linecap="round"/>
        <path d="M${f(x0)},${f(bodyCy - 4)} Q${f(CX + s * 42)},${f(bodyCy + 22)} ${f(x1)},${f(ground - 8)}" fill="none" stroke="${c.body}" stroke-width="13" stroke-linecap="round"/>
        ${hand(c, x1, ground - 4, s)}`;
    })
    .join('');

  // --- Head: wide flat oval with eye domes on top ---
  const eyeY = headCy - 26;
  const eyeDx = 30;
  const eyes = [-1, 1]
    .map((s) => {
      const ex = CX + s * eyeDx;
      const dome = `<circle cx="${f(ex)}" cy="${f(eyeY)}" r="21" fill="${c.body}" ${stroke}/>`;
      let inner;
      if (pose === 'blink') {
        inner = `<path d="M${f(ex - 11)},${f(eyeY + 2)} Q${f(ex)},${f(eyeY + 9)} ${f(ex + 11)},${f(eyeY + 2)}" fill="none" stroke="${c.dark}" stroke-width="3.5" stroke-linecap="round"/>`;
      } else {
        const r = pose === 'oops' ? 15 : 14;
        const pr = pose === 'oops' ? 5.5 : 8;
        const py = pose === 'oops' ? 0 : -2;
        inner = `<circle cx="${f(ex)}" cy="${f(eyeY)}" r="${r}" fill="#fff"/>
          <circle cx="${f(ex + s * 1.5)}" cy="${f(eyeY + py)}" r="${pr}" fill="#1b1424"/>
          <circle cx="${f(ex + s * 1.5 - 3)}" cy="${f(eyeY + py - 3.5)}" r="3" fill="#fff"/>`;
      }
      return dome + inner;
    })
    .join('');

  let mouth;
  if (pose === 'mouth') {
    mouth = `<ellipse cx="${CX}" cy="${f(headCy + 8)}" rx="22" ry="14" fill="#7a1f3d" stroke="${c.dark}" stroke-width="3"/>
      <ellipse cx="${CX}" cy="${f(headCy + 14)}" rx="12" ry="6" fill="#ff7aa0"/>`;
  } else if (pose === 'oops') {
    mouth = `<ellipse cx="${CX}" cy="${f(headCy + 8)}" rx="8" ry="9" fill="#7a1f3d" stroke="${c.dark}" stroke-width="3"/>`;
  } else {
    mouth = `<path d="M${f(CX - 30)},${f(headCy + 2)} Q${CX},${f(headCy + 22)} ${f(CX + 30)},${f(headCy + 2)}" fill="none" stroke="${c.dark}" stroke-width="4" stroke-linecap="round"/>`;
  }

  const head = `<ellipse cx="${CX}" cy="${f(headCy)}" rx="60" ry="${f(34 * Math.min(1.05, p.sy + 0.05))}" fill="${c.body}" ${stroke}/>
    ${[
      [-34, -6, 6], [36, -10, 5], [-10, -22, 4.5], [18, -24, 4], [44, 8, 4],
    ]
      .map(([dx, dy, r]) => `<circle cx="${f(CX + dx)}" cy="${f(headCy + dy)}" r="${r}" fill="${c.spot}"/>`)
      .join('')}
    <ellipse cx="${f(CX - 22)}" cy="${f(headCy - 14)}" rx="18" ry="7" fill="#fff" opacity="0.3"/>
    <ellipse cx="${f(CX - 40)}" cy="${f(headCy + 8)}" rx="9" ry="5.5" fill="${c.blush}" opacity="0.55"/>
    <ellipse cx="${f(CX + 40)}" cy="${f(headCy + 8)}" rx="9" ry="5.5" fill="${c.blush}" opacity="0.55"/>
    ${mouth}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME}" height="${FRAME}" viewBox="0 0 ${FRAME} ${FRAME}">
    ${backLegs}${body}${arms}${head}${eyes}
  </svg>`;
}

/** Webbed foot: three round-tipped toes fanning outward. */
function foot(c, x, y, side, k) {
  const toes = [-0.9, -0.2, 0.5]
    .map((a) => {
      const ang = a * side;
      const tx = x + Math.sin(ang) * 15 * k * side * side + side * Math.sin(Math.abs(a)) * 4;
      const ty = y + Math.cos(ang) * 6 * k;
      return `<line x1="${f(x)}" y1="${f(y)}" x2="${f(tx + side * 10 * (a + 0.4))}" y2="${f(ty)}" stroke="${c.dark}" stroke-width="8" stroke-linecap="round"/>
        <line x1="${f(x)}" y1="${f(y)}" x2="${f(tx + side * 10 * (a + 0.4))}" y2="${f(ty)}" stroke="${c.body}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="${f(tx + side * 10 * (a + 0.4))}" cy="${f(ty)}" r="4" fill="${c.body}" stroke="${c.dark}" stroke-width="2"/>`;
    })
    .join('');
  return toes;
}

/** Small hand: three short fingers. */
function hand(c, x, y, side) {
  return [-0.8, 0, 0.8]
    .map((a) => {
      const tx = x + side * 3 + Math.sin(a) * 10;
      const ty = y + 3 + Math.cos(a) * 3;
      return `<circle cx="${f(tx)}" cy="${f(ty)}" r="5.5" fill="${c.body}" stroke="${c.dark}" stroke-width="2.5"/>`;
    })
    .join('');
}

/** Cartoon fly: round body, big red eyes, translucent wings (up / down). */
function flySvg(frame) {
  const up = frame === 0;
  const wing = (s) =>
    `<ellipse cx="${f(36 + s * 14)}" cy="${up ? 14 : 24}" rx="14" ry="${up ? 9 : 7}" fill="#dff3ff" fill-opacity="0.75" stroke="#7ea7c4" stroke-width="2" transform="rotate(${s * (up ? -25 : 15)} ${f(36 + s * 14)} ${up ? 14 : 24})"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FLY_W}" height="${FLY_H}" viewBox="0 0 ${FLY_W} ${FLY_H}">
    ${wing(-1)}${wing(1)}
    <ellipse cx="36" cy="34" rx="15" ry="13" fill="#2b2b3a" stroke="#14141c" stroke-width="2.5"/>
    <path d="M26,38 Q36,44 46,38" fill="none" stroke="#5a5a72" stroke-width="2"/>
    <circle cx="29" cy="28" r="6" fill="#e0384f"/><circle cx="43" cy="28" r="6" fill="#e0384f"/>
    <circle cx="27.5" cy="26.5" r="2" fill="#fff"/><circle cx="41.5" cy="26.5" r="2" fill="#fff"/>
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

async function sheet(svgs, w, h) {
  const bufs = await Promise.all(svgs.map(png));
  return sharp({ create: { width: w * bufs.length, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(bufs.map((input, i) => ({ input, left: i * w, top: 0 })))
    .png()
    .toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;
  mkdirSync(OUT_DIR, { recursive: true });
  const outs = [
    ...Object.keys(COLORWAYS).map((n) => resolve(OUT_DIR, `frog-${n}.webp`)),
    resolve(OUT_DIR, 'fly.webp'),
  ];
  refuseOverwrite(outs, args.includes('--force'));

  const rows = [];
  for (const [name, c] of Object.entries(COLORWAYS)) {
    const buf = await sheet(POSES.map((p) => frogSvg(c, p)), FRAME, FRAME);
    await sharp(buf).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(resolve(OUT_DIR, `frog-${name}.webp`));
    rows.push(buf);
  }
  const fly = await sheet(Array.from({ length: FLY_FRAMES }, (_, i) => flySvg(i)), FLY_W, FLY_H);
  await sharp(fly).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(resolve(OUT_DIR, 'fly.webp'));
  for (const o of outs) console.log(`wrote ${o}`);

  if (previewPath) {
    await sharp({ create: { width: FRAME * POSES.length, height: FRAME * rows.length + FLY_H + 20, channels: 4, background: '#3aa6c9' } })
      .composite([
        ...rows.map((input, i) => ({ input, left: 0, top: i * FRAME })),
        { input: fly, left: 20, top: FRAME * rows.length + 10 },
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
