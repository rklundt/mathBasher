#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Penguin Slide penguin generator (sprint 2.7).
 *
 * Original kawaii vector art drawn in code: a round penguin seen from the
 * front with a thick dark outline, big shiny eyes, blush and a tiny beak.
 * Three colorways, one picked at random per round (like the frogs and the
 * axolotls). This script builds one SVG per pose, rasterizes it with sharp
 * and packs the poses into one horizontal sprite sheet per colorway. This
 * file IS the source of the art: edit and re-run, never hand-edit the
 * shipped sheets.
 *
 * Usage:
 *   pnpm sprite:penguin                       # writes public/assets/sprites/hero/penguin-*.webp
 *   pnpm sprite:penguin --preview <png>       # also writes a review sheet
 *   pnpm sprite:penguin --preview <png> --dry # review sheet only, ships nothing
 *   pnpm sprite:penguin --force               # re-render over existing shipped sheets
 *
 * Sheet layout (FRAME × FRAME each, feet near the bottom):
 *   0 slide · 1 lean left · 2 lean right · 3 gulp · 4 bonk (dizzy) · 5 cheer
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = resolve(ROOT, 'public/assets/sprites/hero');

export const FRAME = 220;
export const POSES = ['slide', 'leanLeft', 'leanRight', 'gulp', 'bonk', 'cheer'];

const INK = '#3a2420';
const CREAM = '#fbf4e6';
const BLUSH = '#f4a7a0';

/** Shape + colours per colorway. `rx`/`ry` = body half-size; `mask` = how the cream face/belly is cut. */
const COLORWAYS = {
  classic: {
    body: '#4b5059',
    shine: '#6b717c',
    feet: '#f7b347',
    rx: 52,
    ry: 76,
    mask: 'belly',
    tuft: false,
    fluff: false,
  },
  blueberry: {
    body: '#53689c',
    shine: '#9fb3dd',
    feet: '#f7b347',
    rx: 68,
    ry: 66,
    mask: 'belly',
    tuft: true,
    fluff: false,
  },
  fluffy: {
    body: '#a8acb8',
    shine: '#c6c9d2',
    feet: '#7a5a4a',
    rx: 56,
    ry: 68,
    mask: 'face',
    tuft: false,
    fluff: true,
  },
};

const f = (n) => n.toFixed(1);

function penguinSvg(c, pose) {
  const CX = FRAME / 2;
  const ground = FRAME - 14;
  const cy = ground - c.ry - 6;
  const lean = pose === 'leanLeft' ? -12 : pose === 'leanRight' ? 12 : pose === 'bonk' ? 8 : 0;
  const st = (w = 5) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const s = st();

  // Flippers: down at the sides; out for a lean (the side it leans away from); up to cheer.
  const flipper = (side) => {
    const up = pose === 'cheer';
    const out = (pose === 'leanLeft' && side > 0) || (pose === 'leanRight' && side < 0);
    const sx = CX + side * (c.rx - 6);
    const sy = cy + (up ? -c.ry * 0.25 : c.ry * 0.05);
    const tipX = sx + side * (up ? 30 : out ? 34 : 16);
    const tipY = sy + (up ? -40 : out ? 18 : 46);
    return `<path d="M${f(sx)},${f(sy - 12)} Q${f(tipX + side * 6)},${f((sy + tipY) / 2)} ${f(tipX)},${f(tipY)} Q${f(sx + side * 4)},${f(sy + 24)} ${f(sx - side * 4)},${f(sy + 20)} Z" fill="${c.body}" ${s}/>`;
  };

  const feet = [-1, 1]
    .map((side) => {
      const fx = CX + side * c.rx * 0.42;
      const fy = ground - 4;
      return `<path d="M${f(fx - 15)},${f(fy)} Q${f(fx)},${f(fy - 12)} ${f(fx + 15)},${f(fy)} Q${f(fx + 6)},${f(fy + 7)} ${f(fx)},${f(fy + 3)} Q${f(fx - 6)},${f(fy + 7)} ${f(fx - 15)},${f(fy)} Z" fill="${c.feet}" ${s}/>`;
    })
    .join('');

  const body = `<ellipse cx="${CX}" cy="${f(cy)}" rx="${c.rx}" ry="${c.ry}" fill="${c.body}" ${s}/>`;
  const shine = `<ellipse cx="${f(CX - c.rx * 0.45)}" cy="${f(cy - c.ry * 0.62)}" rx="${f(c.rx * 0.18)}" ry="${f(c.ry * 0.08)}" fill="${c.shine}" transform="rotate(-25 ${f(CX - c.rx * 0.45)} ${f(cy - c.ry * 0.62)})"/>`;

  // Cream mask: two eye patches joined to a belly (classic / blueberry) or to a small chin (chick).
  const eyeY = cy - c.ry * 0.24;
  const eyeDx = c.rx * 0.4;
  const patchR = c.rx * 0.46;
  const mask =
    c.mask === 'belly'
      ? `<circle cx="${f(CX - eyeDx)}" cy="${f(eyeY)}" r="${f(patchR)}" fill="${CREAM}"/>
         <circle cx="${f(CX + eyeDx)}" cy="${f(eyeY)}" r="${f(patchR)}" fill="${CREAM}"/>
         <ellipse cx="${CX}" cy="${f(cy + c.ry * 0.22)}" rx="${f(c.rx * 0.74)}" ry="${f(c.ry * 0.62)}" fill="${CREAM}"/>`
      : `<circle cx="${f(CX - eyeDx)}" cy="${f(eyeY)}" r="${f(patchR)}" fill="${CREAM}"/>
         <circle cx="${f(CX + eyeDx)}" cy="${f(eyeY)}" r="${f(patchR)}" fill="${CREAM}"/>
         <ellipse cx="${CX}" cy="${f(eyeY + patchR * 0.5)}" rx="${f(c.rx * 0.6)}" ry="${f(patchR * 0.75)}" fill="${CREAM}"/>`;

  // Chick: soft fluff marks on the chest; blueberry: a little head tuft.
  const fluff = c.fluff
    ? `<path d="M${f(CX - 10)},${f(cy + 14)} q5,6 10,0 q5,6 10,0" fill="none" ${st(3)}/>
       <path d="M${f(CX - 30)},${f(cy + 40)} q5,6 10,0" fill="none" ${st(3)}/>
       <path d="M${f(CX + 20)},${f(cy + 40)} q5,6 10,0" fill="none" ${st(3)}/>`
    : `<path d="M${f(CX - 7)},${f(cy + c.ry * 0.3)} q4,5 8,0 q4,5 8,0" fill="none" stroke="#c9d6e8" stroke-width="2.5" stroke-linecap="round"/>`;
  const tuft = c.tuft
    ? `<path d="M${f(CX - 10)},${f(cy - c.ry + 4)} Q${f(CX - 6)},${f(cy - c.ry - 14)} ${f(CX)},${f(cy - c.ry - 2)} Q${f(CX + 6)},${f(cy - c.ry - 16)} ${f(CX + 10)},${f(cy - c.ry + 4)}" fill="${c.body}" ${s}/>`
    : '';

  // Eyes per pose.
  const eye = (side) => {
    const ex = CX + side * eyeDx;
    if (pose === 'gulp' || pose === 'cheer') {
      return `<path d="M${f(ex - 8)},${f(eyeY + 3)} Q${f(ex)},${f(eyeY - 7)} ${f(ex + 8)},${f(eyeY + 3)}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    }
    if (pose === 'bonk') {
      return `<path d="M${f(ex)},${f(eyeY)} m-6,0 a6,6 0 1,1 6,6 a3.5,3.5 0 1,1 -3.5,-3.5" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    }
    const look = pose === 'leanLeft' ? -2.5 : pose === 'leanRight' ? 2.5 : 0;
    const r = Math.max(8.5, c.rx * 0.17);
    return `<circle cx="${f(ex + look)}" cy="${f(eyeY)}" r="${f(r)}" fill="#2a1a17"/>
      <circle cx="${f(ex + look - r * 0.35)}" cy="${f(eyeY - r * 0.4)}" r="${f(r * 0.38)}" fill="#fff"/>
      <circle cx="${f(ex + look + r * 0.35)}" cy="${f(eyeY + r * 0.35)}" r="${f(r * 0.16)}" fill="#fff"/>`;
  };

  const blush = [-1, 1]
    .map(
      (side) =>
        `<ellipse cx="${f(CX + side * eyeDx * 1.45)}" cy="${f(eyeY + c.rx * 0.26)}" rx="${f(c.rx * 0.2)}" ry="${f(c.rx * 0.13)}" fill="${BLUSH}" opacity="${pose === 'gulp' ? 0.95 : 0.85}"/>`,
    )
    .join('');

  const by = eyeY + c.rx * 0.2;
  let beak;
  if (pose === 'gulp') {
    // Cheeks full, a fish tail poking out of the beak.
    beak = `<path d="M${f(CX - 9)},${f(by)} L${f(CX + 9)},${f(by)} L${CX},${f(by + 9)} Z" fill="#f7b347" ${st(3)}/>
      <path d="M${f(CX + 6)},${f(by + 4)} l14,-8 l-2,10 l8,4 l-14,4 Z" fill="#86d6e8" ${st(2.5)}/>`;
  } else if (pose === 'cheer' || pose === 'bonk') {
    beak = `<path d="M${f(CX - 10)},${f(by - 2)} L${f(CX + 10)},${f(by - 2)} L${CX},${f(by + 4)} Z" fill="#f7b347" ${st(3)}/>
      <path d="M${f(CX - 8)},${f(by + 5)} L${f(CX + 8)},${f(by + 5)} L${CX},${f(by + 13)} Z" fill="#f29a2e" ${st(3)}/>`;
  } else {
    beak = `<path d="M${f(CX - 9)},${f(by)} L${f(CX + 9)},${f(by)} L${CX},${f(by + 9)} Z" fill="#f7b347" ${st(3)}/>`;
  }

  // Bonk extras: snow on the head and little stars.
  const extras =
    pose === 'bonk'
      ? `<path d="M${f(CX - 26)},${f(cy - c.ry + 8)} Q${f(CX - 20)},${f(cy - c.ry - 14)} ${f(CX)},${f(cy - c.ry - 8)} Q${f(CX + 22)},${f(cy - c.ry - 16)} ${f(CX + 28)},${f(cy - c.ry + 8)} Z" fill="#ffffff" ${st(3.5)}/>
         ${[
           [-46, -c.ry - 6],
           [44, -c.ry - 2],
           [0, -c.ry - 30],
         ]
           .map(
             ([dx, dy]) =>
               `<path d="M${f(CX + dx)},${f(cy + dy - 7)} l2.2,4.8 l5.2,0.6 l-3.9,3.5 l1.1,5.1 l-4.6,-2.6 l-4.6,2.6 l1.1,-5.1 l-3.9,-3.5 l5.2,-0.6 Z" fill="#ffd34d" stroke="${INK}" stroke-width="2"/>`,
           )
           .join('')}`
      : '';

  const lr = (side) => flipper(side);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME}" height="${FRAME}" viewBox="0 0 ${FRAME} ${FRAME}">
    <g transform="rotate(${lean} ${CX} ${ground})">
      ${feet}${lr(-1)}${lr(1)}${tuft}${body}${shine}${mask}${fluff}${blush}${eye(-1)}${eye(1)}${beak}${extras}
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
  const outs = Object.keys(COLORWAYS).map((n) => resolve(OUT_DIR, `penguin-${n}.webp`));
  if (!dry) {
    mkdirSync(OUT_DIR, { recursive: true });
    refuseOverwrite(outs, args.includes('--force'));
  }

  const rows = [];
  for (const [name, c] of Object.entries(COLORWAYS)) {
    const buf = await sheet(
      POSES.map((p) => penguinSvg(c, p)),
      FRAME,
      FRAME,
    );
    if (!dry) {
      await sharp(buf)
        .webp({ quality: 90, alphaQuality: 100, effort: 6 })
        .toFile(resolve(OUT_DIR, `penguin-${name}.webp`));
      console.log(`wrote ${resolve(OUT_DIR, `penguin-${name}.webp`)}`);
    }
    rows.push(buf);
  }

  if (previewPath) {
    await sharp({
      create: { width: FRAME * POSES.length, height: FRAME * rows.length, channels: 4, background: '#dbeefc' },
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
