#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Bunny Garden bunny generator (sprint 2.8).
 *
 * Original kawaii vector art drawn in code: a chibi bunny seen from the
 * front, with a big round head, long ears, big shiny eyes, blush, a tiny
 * nose and a thick dark outline. Three colorways, one picked at random per
 * round (like the frogs, axolotls and penguins). This script builds one SVG
 * per pose, rasterizes it with sharp and packs the poses into one
 * horizontal sprite sheet per colorway. This file IS the source of the art:
 * edit and re-run, never hand-edit the shipped sheets.
 *
 * Usage:
 *   pnpm sprite:bunny                       # writes public/assets/sprites/hero/bunny-*.webp
 *   pnpm sprite:bunny --preview <png>       # also writes a review sheet
 *   pnpm sprite:bunny --preview <png> --dry # review sheet only, ships nothing
 *   pnpm sprite:bunny --force               # re-render over existing shipped sheets
 *
 * Sheet layout (FRAME × FRAME each, feet near the bottom):
 *   0 idle · 1 hop · 2 pull · 3 happy · 4 oops · 5 cheer
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = resolve(ROOT, 'public/assets/sprites/hero');

export const FRAME = 220;
export const POSES = ['idle', 'hop', 'pull', 'happy', 'oops', 'cheer'];

const INK = '#3a2420';
const BLUSH = '#f4a0a8';

/** Colours per colorway. `lop` flops the left ear down. */
const COLORWAYS = {
  snowball: {
    fur: '#fdf9f4',
    shade: '#ece3da',
    belly: '#ffffff',
    inner: '#f7b6c3',
    nose: '#f0849c',
    lop: false,
  },
  caramel: {
    fur: '#dda46a',
    shade: '#c78c55',
    belly: '#fbeedb',
    inner: '#f5bfae',
    nose: '#e0718a',
    lop: false,
  },
  lop: {
    fur: '#aeb0bc',
    shade: '#9597a3',
    belly: '#eceaf0',
    inner: '#f2b8c6',
    nose: '#ec8aa2',
    lop: true,
  },
};

const f = (n) => n.toFixed(1);

function bunnySvg(c, pose) {
  const CX = FRAME / 2;
  const lift = pose === 'hop' ? 16 : pose === 'cheer' ? 6 : 0;
  const ground = FRAME - 10 - lift;
  const bodyCy = ground - 34;
  const headCy = bodyCy - 58;
  const headR = 52;
  const tilt = pose === 'pull' ? -12 : pose === 'oops' ? 5 : 0;
  const st = (w = 5) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const s = st();

  // Ears: long rounded ovals with a pink inside; swept back on a hop / pull;
  // drooped on an oops. The lop's left ear hangs down behind the head along the cheek.
  const ear = (side) => {
    const flop = c.lop && side < 0;
    const droop = pose === 'oops';
    const sweep = pose === 'hop' || pose === 'pull' ? 16 : pose === 'cheer' ? 6 : 0;
    const baseX = CX + side * (flop ? 30 : 22);
    const baseY = headCy - headR * (flop ? 0.62 : 0.72);
    if (flop) {
      const angle = droop ? -170 : -160;
      return `<g transform="rotate(${angle} ${f(baseX)} ${f(baseY + 6)})">
        <ellipse cx="${f(baseX)}" cy="${f(baseY - 34)}" rx="16" ry="40" fill="${c.fur}" ${s}/>
        <ellipse cx="${f(baseX)}" cy="${f(baseY - 32)}" rx="7.5" ry="27" fill="${c.inner}"/>
      </g>`;
    }
    const angle = droop ? side * 62 : side * (10 + sweep);
    return `<g transform="rotate(${angle} ${f(baseX)} ${f(baseY + 6)})">
      <ellipse cx="${f(baseX)}" cy="${f(baseY - 32)}" rx="16" ry="38" fill="${c.fur}" ${s}/>
      <ellipse cx="${f(baseX)}" cy="${f(baseY - 30)}" rx="7.5" ry="26" fill="${c.inner}"/>
    </g>`;
  };

  // Feet: two soft ovals; tucked up on a hop; planted wide to pull.
  const feetDx = pose === 'pull' ? 28 : 22;
  const feet = [-1, 1]
    .map((side) => {
      const fx = CX + side * feetDx;
      const fy = ground - (pose === 'hop' ? 6 : 2);
      return `<ellipse cx="${f(fx)}" cy="${f(fy)}" rx="17" ry="10" fill="${c.fur}" ${s}/>
        <ellipse cx="${f(fx)}" cy="${f(fy + 1)}" rx="7" ry="4" fill="${c.inner}"/>`;
    })
    .join('');

  const body = `<ellipse cx="${CX}" cy="${f(bodyCy)}" rx="42" ry="36" fill="${c.fur}" ${s}/>
    <ellipse cx="${CX}" cy="${f(bodyCy + 6)}" rx="25" ry="22" fill="${c.belly}"/>`;

  // Arms: little paws at the sides; both forward and down to grip (pull);
  // both straight up over the head (cheer).
  const arm = (side) => {
    if (pose === 'cheer') {
      const ax = CX + side * 60;
      const ay = headCy - 14;
      return `<ellipse cx="${f(ax)}" cy="${f(ay)}" rx="11" ry="26" fill="${c.fur}" ${s} transform="rotate(${side * 28} ${f(ax)} ${f(ay)})"/>`;
    }
    if (pose === 'pull') {
      // Both paws together low in front, gripping.
      return `<ellipse cx="${f(CX + side * 10)}" cy="${f(bodyCy + 16)}" rx="11" ry="10" fill="${c.fur}" ${s}/>`;
    }
    return `<ellipse cx="${f(CX + side * 34)}" cy="${f(bodyCy - 4)}" rx="12" ry="11" fill="${c.fur}" ${s}/>`;
  };

  const head = `<circle cx="${CX}" cy="${f(headCy)}" r="${headR}" fill="${c.fur}" ${s}/>
    <ellipse cx="${f(CX - 22)}" cy="${f(headCy - 32)}" rx="11" ry="6" fill="#ffffff" opacity="0.7" transform="rotate(-28 ${f(CX - 22)} ${f(headCy - 32)})"/>`;

  // Face: big shiny eyes, a little low on the head (kawaii proportions).
  const eyeY = headCy + 5;
  const eyeDx = 21;
  const eye = (side) => {
    const ex = CX + side * eyeDx;
    if (pose === 'happy' || pose === 'cheer') {
      return `<path d="M${f(ex - 9)},${f(eyeY + 3)} Q${f(ex)},${f(eyeY - 8)} ${f(ex + 9)},${f(eyeY + 3)}" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
    }
    if (pose === 'pull') {
      // Squeezed shut with effort: > <
      const d =
        side < 0
          ? `M${f(ex - 8)},${f(eyeY - 7)} L${f(ex + 6)},${f(eyeY)} L${f(ex - 8)},${f(eyeY + 7)}`
          : `M${f(ex + 8)},${f(eyeY - 7)} L${f(ex - 6)},${f(eyeY)} L${f(ex + 8)},${f(eyeY + 7)}`;
      return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (pose === 'oops') {
      // Surprised little round eyes.
      return `<circle cx="${f(ex)}" cy="${f(eyeY)}" r="8.5" fill="#2a1a17"/>
        <circle cx="${f(ex - 2.6)}" cy="${f(eyeY - 2.8)}" r="3.2" fill="#fff"/>`;
    }
    const r = 12.6;
    return `<ellipse cx="${f(ex)}" cy="${f(eyeY)}" rx="${r}" ry="${f(r * 1.12)}" fill="#2a1a17"/>
      <circle cx="${f(ex - 4)}" cy="${f(eyeY - 5)}" r="5.8" fill="#fff"/>
      <circle cx="${f(ex + 4.4)}" cy="${f(eyeY + 4.6)}" r="2.4" fill="#fff"/>`;
  };
  const blush = [-1, 1]
    .map(
      (side) =>
        `<ellipse cx="${f(CX + side * 37)}" cy="${f(eyeY + 16)}" rx="${pose === 'happy' ? 12 : 10}" ry="${pose === 'happy' ? 8 : 6.5}" fill="${BLUSH}" opacity="0.85"/>`,
    )
    .join('');
  const ny = eyeY + 13;
  const nose = `<path d="M${f(CX - 5)},${f(ny)} Q${CX},${f(ny - 2)} ${f(CX + 5)},${f(ny)} Q${CX},${f(ny + 6)} ${f(CX - 5)},${f(ny)} Z" fill="${c.nose}" ${st(2.5)}/>`;
  let mouth;
  if (pose === 'cheer') {
    // A big open "D" smile.
    mouth = `<path d="M${f(CX - 11)},${f(ny + 6)} L${f(CX + 11)},${f(ny + 6)} Q${f(CX + 11)},${f(ny + 22)} ${CX},${f(ny + 22)} Q${f(CX - 11)},${f(ny + 22)} ${f(CX - 11)},${f(ny + 6)} Z" fill="#d9536c" ${st(3)}/>`;
  } else if (pose === 'happy') {
    mouth = `<path d="M${f(CX - 8)},${f(ny + 6)} Q${CX},${f(ny + 17)} ${f(CX + 8)},${f(ny + 6)} Z" fill="#d9536c" ${st(3)}/>`;
  } else if (pose === 'oops') {
    mouth = `<ellipse cx="${CX}" cy="${f(ny + 10)}" rx="4.5" ry="5.5" fill="#d9536c" ${st(2.5)}/>`;
  } else if (pose === 'pull') {
    mouth = `<path d="M${f(CX - 8)},${f(ny + 9)} L${f(CX + 8)},${f(ny + 9)}" fill="none" ${st(3)}/>`;
  } else {
    mouth = `<path d="M${f(CX - 8)},${f(ny + 6)} q4,5 8,0 q4,5 8,0" fill="none" ${st(3)}/>`;
  }

  // Oops: a sweat drop. Cheer: sparkles beside the ears. Pull: effort marks.
  const star = (x, y, k = 1) =>
    `<path d="M${f(x)},${f(y - 8 * k)} l${f(2.6 * k)},${f(5.4 * k)} l${f(5.8 * k)},${f(0.7 * k)} l${f(-4.4 * k)},${f(3.9 * k)} l${f(1.3 * k)},${f(5.7 * k)} l${f(-5.3 * k)},${f(-3 * k)} l${f(-5.3 * k)},${f(3 * k)} l${f(1.3 * k)},${f(-5.7 * k)} l${f(-4.4 * k)},${f(-3.9 * k)} l${f(5.8 * k)},${f(-0.7 * k)} Z" fill="#ffe27a" stroke="${INK}" stroke-width="2"/>`;
  let extras = '';
  if (pose === 'oops') {
    extras = `<path d="M${f(CX + headR - 2)},${f(headCy - 26)} q-9,13 0,17 q9,-4 0,-17 Z" fill="#9fd8f5" ${st(2.5)}/>`;
  } else if (pose === 'cheer') {
    extras = star(CX - 70, headCy - headR - 2) + star(CX + 70, headCy - headR - 8) + star(CX, headCy - headR - 34, 0.8);
  } else if (pose === 'pull') {
    extras = `<path d="M${f(CX - 30)},${f(headCy - headR - 6)} l-6,-10 M${f(CX - 18)},${f(headCy - headR - 10)} l-2,-11" fill="none" ${st(3)}/>`;
  }

  // Hop: one soft shadow on the ground under the bunny.
  const shadow =
    pose === 'hop' ? `<ellipse cx="${CX}" cy="${f(FRAME - 9)}" rx="30" ry="6" fill="#000000" opacity="0.15"/>` : '';

  const lopBehind = c.lop ? ear(-1) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME}" height="${FRAME}" viewBox="0 0 ${FRAME} ${FRAME}">
    ${shadow}
    <g transform="translate(${CX} ${ground}) scale(0.9) translate(${-CX} ${-ground}) rotate(${tilt} ${CX} ${ground})">
      ${c.lop ? '' : ear(-1)}${ear(1)}${lopBehind}${feet}${body}${pose === 'cheer' ? arm(-1) + arm(1) : ''}${head}${pose === 'cheer' ? '' : arm(-1) + arm(1)}${blush}${eye(-1)}${eye(1)}${nose}${mouth}${extras}
    </g>
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
  return sharp({
    create: { width: w * bufs.length, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(bufs.map((input, i) => ({ input, left: i * w, top: 0 })))
    .png()
    .toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;
  const dry = args.includes('--dry');
  const outs = Object.keys(COLORWAYS).map((n) => resolve(OUT_DIR, `bunny-${n}.webp`));
  if (!dry) {
    mkdirSync(OUT_DIR, { recursive: true });
    refuseOverwrite(outs, args.includes('--force'));
  }

  const rows = [];
  for (const [name, c] of Object.entries(COLORWAYS)) {
    const buf = await sheet(
      POSES.map((p) => bunnySvg(c, p)),
      FRAME,
      FRAME,
    );
    if (!dry) {
      await sharp(buf)
        .webp({ quality: 90, alphaQuality: 100, effort: 6 })
        .toFile(resolve(OUT_DIR, `bunny-${name}.webp`));
      console.log(`wrote ${resolve(OUT_DIR, `bunny-${name}.webp`)}`);
    }
    rows.push(buf);
  }

  if (previewPath) {
    await sharp({
      create: { width: FRAME * POSES.length, height: FRAME * rows.length, channels: 4, background: '#cfeaa8' },
    })
      .composite(rows.map((input, i) => ({ input, left: 0, top: i * FRAME })))
      .png()
      .toFile(previewPath);
    console.log(`wrote preview ${previewPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
