#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Frog Splash river generator (sprint 2.5.6): a seamless water tile, lily
 * pads (plain + flowered), a splash sheet, and the two riverbanks. Drawn in
 * code like the frog — this file IS the source; edit and re-run.
 *
 * Usage:
 *   pnpm sprite:pond                  # writes public/assets/sprites/bg/pond-*.webp
 *   pnpm sprite:pond --preview <png>  # also writes a review sheet
 *   pnpm sprite:pond --force          # re-render over existing shipped files
 *
 * Outputs (public/assets/sprites/bg/):
 *   pond-water.webp        WATER_TILE² seamless tile (scrolled in game for the current)
 *   pond-pad-1/2.webp      PAD² top-down lily pads (plain / with a flower)
 *   pond-splash.webp       SPLASH_FRAMES × (SPLASH_W × SPLASH_H) splash sheet
 *   pond-bank-near.webp    BANK_W × BANK_H start bank (shoreline along its TOP edge)
 *   pond-bank-far.webp     BANK_W × BANK_H far bank (shoreline along its BOTTOM edge)
 *   frog-splash.webp       1280×720 menu backdrop (water + both banks + a few pads)
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BG_DIR = resolve(ROOT, 'public/assets/sprites/bg');

export const WATER_TILE = 256;
export const PAD = 160;
export const SPLASH_W = 200;
export const SPLASH_H = 150;
export const SPLASH_FRAMES = 4;
export const BANK_W = 1280;
export const BANK_H = 240;

const f = (n) => n.toFixed(1);
const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- water ----------

/** Seamless tile: every wave line has a period that divides the tile width. */
function waterSvg() {
  const T = WATER_TILE;
  const rng = mulberry32(5);
  let lines = '';
  for (let i = 0; i < 7; i++) {
    const y0 = 18 + i * 34 + rng() * 10;
    const amp = 3 + rng() * 3;
    const period = [64, 128, 256][i % 3];
    const phase = rng() * Math.PI * 2;
    // A short dash of wave (not full width) so the tile reads as ripples, not stripes.
    const x0 = rng() * T;
    const len = 70 + rng() * 80;
    let d = '';
    for (let k = 0; k <= 24; k++) {
      const x = x0 + (len * k) / 24;
      const y = y0 + amp * Math.sin((2 * Math.PI * x) / period + phase);
      d += `${k === 0 ? 'M' : 'L'}${f(x % T)},${f(y)} `;
      if (k < 24 && (x0 + (len * (k + 1)) / 24) % T < x % T) d += `M${f(((x0 + (len * (k + 1)) / 24) % T))},${f(y)} `;
    }
    lines += `<path d="${d}" fill="none" stroke="#bfeaf7" stroke-width="3" stroke-linecap="round" opacity="${f(0.35 + rng() * 0.25)}"/>`;
  }
  let sparkles = '';
  for (let i = 0; i < 10; i++) {
    sparkles += `<circle cx="${f(rng() * T)}" cy="${f(rng() * T)}" r="${f(1.2 + rng() * 1.6)}" fill="#ffffff" opacity="0.5"/>`;
  }
  return svg(T, T, `<rect width="${T}" height="${T}" fill="#2f9cc4"/>${lines}${sparkles}`);
}

// ---------- lily pads ----------

function padSvg(withFlower) {
  const c = PAD / 2;
  const r = c - 8;
  const notch = 0.42; // radians half-width of the notch
  const a0 = -Math.PI / 2 + notch; // notch points up-ish, rotated in game
  const a1 = -Math.PI / 2 - notch + Math.PI * 2;
  const p = (a, rr = r) => [c + Math.cos(a) * rr, c + Math.sin(a) * rr];
  const [sx, sy] = p(a0);
  const [ex, ey] = p(a1);
  const outline = `M${c},${c} L${f(sx)},${f(sy)} A${r},${r} 0 1 1 ${f(ex)},${f(ey)} Z`;
  const veins = Array.from({ length: 9 }, (_, i) => {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / 9;
    const [vx, vy] = p(a, r - 10);
    return `<path d="M${c},${c} L${f(vx)},${f(vy)}" stroke="#a6e07a" stroke-width="2.4" stroke-linecap="round" opacity="0.8"/>`;
  }).join('');
  const defs = `<radialGradient id="pg" cx="0.45" cy="0.45" r="0.6"><stop offset="0" stop-color="#8fd163"/><stop offset="1" stop-color="#4fa33a"/></radialGradient>`;
  let flower = '';
  if (withFlower) {
    // Near the rim, clear of the answer number printed at the centre.
    const fx = c + r * 0.62;
    const fy = c + r * 0.5;
    flower = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return `<ellipse cx="${f(fx + Math.cos(a) * 9)}" cy="${f(fy + Math.sin(a) * 9)}" rx="9" ry="5" fill="#ffb3cf" stroke="#d9608e" stroke-width="1.6" transform="rotate(${f((a * 180) / Math.PI)} ${f(fx + Math.cos(a) * 9)} ${f(fy + Math.sin(a) * 9)})"/>`;
    }).join('') + `<circle cx="${f(fx)}" cy="${f(fy)}" r="5" fill="#ffe066" stroke="#d9a400" stroke-width="1.5"/>`;
  }
  return svg(
    PAD,
    PAD,
    `<path d="${outline}" fill="#1f4f2a" opacity="0.35" transform="translate(4,6)"/>
     <path d="${outline}" fill="url(#pg)" stroke="#2f7a2a" stroke-width="4" stroke-linejoin="round"/>
     ${veins}
     <ellipse cx="${f(c - 22)}" cy="${f(c - 26)}" rx="20" ry="9" fill="#fff" opacity="0.18" transform="rotate(-25 ${f(c - 22)} ${f(c - 26)})"/>
     ${flower}`,
    defs,
  );
}

// ---------- splash ----------

function splashSvg(frame) {
  const W = SPLASH_W;
  const H = SPLASH_H;
  const cx = W / 2;
  const cy = H * 0.68;
  const t = frame / (SPLASH_FRAMES - 1); // 0..1
  const ringR = 26 + t * 60;
  const ring = `<ellipse cx="${cx}" cy="${cy}" rx="${f(ringR)}" ry="${f(ringR * 0.35)}" fill="none" stroke="#e8f8ff" stroke-width="${f(5 - t * 3)}" opacity="${f(1 - t * 0.6)}"/>`;
  // Crown of droplets: rise then fall.
  const drops = Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI + (i / 8) * Math.PI;
    const spread = 18 + t * 46;
    const rise = Math.sin(Math.min(1, t * 1.6) * Math.PI) * 52;
    const x = cx + Math.cos(a) * spread;
    const y = cy - rise * (0.6 + 0.4 * Math.sin((i / 8) * Math.PI)) + t * 18;
    const r = 7 - t * 3.5;
    return r > 0.5 ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#dff6ff" stroke="#7cc6e0" stroke-width="1.5" opacity="${f(1 - t * 0.5)}"/>` : '';
  }).join('');
  const column =
    t < 0.7
      ? `<path d="M${f(cx - 16 + t * 4)},${f(cy)} Q${cx},${f(cy - 60 * (1 - t))} ${f(cx + 16 - t * 4)},${f(cy)} Z" fill="#e8f8ff" stroke="#7cc6e0" stroke-width="2" opacity="${f(0.95 - t)}"/>`
      : '';
  return svg(W, H, ring + column + drops);
}

// ---------- banks ----------

function bankSvg(far) {
  const W = BANK_W;
  const H = BANK_H;
  const rng = mulberry32(far ? 21 : 13);
  // Shoreline wave along the water-side edge.
  const edgeY = far ? H - 30 : 30;
  let shore = `M0,${edgeY}`;
  for (let x = 0; x <= W; x += 64) shore += ` Q${x + 32},${f(edgeY + (far ? 1 : -1) * (6 + rng() * 8))} ${x + 64},${edgeY}`;
  const grass = far ? `${shore} V0 H0 Z` : `${shore} V${H} H0 Z`;
  // Sand strip just inside the shoreline.
  let sand = '';
  {
    const inset = far ? -18 : 18;
    let d = `M0,${edgeY + inset}`;
    for (let x = 0; x <= W; x += 64) d += ` Q${x + 32},${f(edgeY + inset + (rng() - 0.5) * 10)} ${x + 64},${edgeY + inset}`;
    sand = far ? `${shore} L${W},${edgeY + inset} ${d.replace('M0', 'L0')} Z` : '';
    sand = `<path d="${shore} V${edgeY + inset} H0 Z" fill="#e7cf98" opacity="0.95"/>`;
  }
  const blades = Array.from({ length: 140 }, () => {
    const x = rng() * W;
    const y = far ? 10 + rng() * (edgeY - 40) : edgeY + 30 + rng() * (H - edgeY - 40);
    const h = 10 + rng() * 14;
    return `<path d="M${f(x)},${f(y)} q${f((rng() - 0.5) * 8)},${f(-h / 2)} ${f((rng() - 0.5) * 6)},${f(-h)}" stroke="#3f8f2c" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.8"/>`;
  }).join('');
  const flowers = Array.from({ length: 18 }, () => {
    const x = rng() * W;
    const y = far ? 20 + rng() * (edgeY - 60) : edgeY + 40 + rng() * (H - edgeY - 60);
    const col = ['#ffd84d', '#ff9ec7', '#ffffff', '#c7a6ff'][Math.floor(rng() * 4)];
    return `<circle cx="${f(x)}" cy="${f(y)}" r="5" fill="${col}" stroke="#00000022" stroke-width="1"/><circle cx="${f(x)}" cy="${f(y)}" r="2" fill="#f2a900"/>`;
  }).join('');
  const pebbles = Array.from({ length: 22 }, () => {
    const x = rng() * W;
    const y = far ? edgeY - 8 - rng() * 12 : edgeY + 6 + rng() * 12;
    return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(4 + rng() * 6)}" ry="${f(3 + rng() * 3)}" fill="#b8a98d" stroke="#8c7d63" stroke-width="1.5"/>`;
  }).join('');
  // Cattails on the far bank.
  const reeds = far
    ? Array.from({ length: 16 }, (_, i) => {
        const x = 30 + i * 80 + rng() * 40;
        const base = edgeY - 20;
        const h = 70 + rng() * 50;
        return `<path d="M${f(x)},${f(base)} q${f((rng() - 0.5) * 14)},${f(-h / 2)} ${f((rng() - 0.5) * 10)},${f(-h)}" stroke="#4d8f2f" stroke-width="5" stroke-linecap="round" fill="none"/>
          <rect x="${f(x - 5)}" y="${f(base - h - 4)}" width="10" height="26" rx="5" fill="#8a5a2b" stroke="#5c3a17" stroke-width="2"/>`;
      }).join('')
    : '';
  const defs = `<linearGradient id="gr" x1="0" y1="${far ? 1 : 0}" x2="0" y2="${far ? 0 : 1}">
      <stop offset="0" stop-color="#8ad35c"/><stop offset="1" stop-color="#4f9e33"/></linearGradient>`;
  return svg(W, H, `<path d="${grass}" fill="url(#gr)" stroke="#3b7d26" stroke-width="4"/>${sand}${pebbles}${blades}${flowers}${reeds}`, defs);
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

const png = (s) => sharp(Buffer.from(s)).png().toBuffer();
const webp = (buf, out) => sharp(buf).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(out);

async function main() {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;
  mkdirSync(BG_DIR, { recursive: true });

  const splashFrames = await Promise.all(Array.from({ length: SPLASH_FRAMES }, (_, i) => png(splashSvg(i))));
  const splashSheet = await sharp({
    create: { width: SPLASH_W * SPLASH_FRAMES, height: SPLASH_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(splashFrames.map((input, i) => ({ input, left: i * SPLASH_W, top: 0 })))
    .png()
    .toBuffer();

  const outputs = {
    water: [await png(waterSvg()), resolve(BG_DIR, 'pond-water.webp')],
    pad1: [await png(padSvg(false)), resolve(BG_DIR, 'pond-pad-1.webp')],
    pad2: [await png(padSvg(true)), resolve(BG_DIR, 'pond-pad-2.webp')],
    splash: [splashSheet, resolve(BG_DIR, 'pond-splash.webp')],
    near: [await png(bankSvg(false)), resolve(BG_DIR, 'pond-bank-near.webp')],
    far: [await png(bankSvg(true)), resolve(BG_DIR, 'pond-bank-far.webp')],
  };
  // Menu backdrop (Difficulty / Loading screens): the river at a glance.
  {
    const tiles = [];
    for (let y = 0; y < 720; y += WATER_TILE) for (let x = 0; x < 1280; x += WATER_TILE) tiles.push({ input: outputs.water[0], left: x, top: y });
    const backdrop = await sharp({ create: { width: 1280, height: 720, channels: 4, background: '#2f9cc4' } })
      .composite([
        ...tiles,
        { input: outputs.far[0], left: 0, top: -120 },
        // Pads at the edges, clear of the centred menu text.
        { input: outputs.pad1[0], left: 40, top: 300 },
        { input: outputs.pad2[0], left: 1080, top: 200 },
        { input: outputs.near[0], left: 0, top: 600 },
      ])
      .png()
      .toBuffer();
    // Darkened like the space backdrops (×0.6): menu text (Game Over's green
    // "Round Complete!", difficulty subtitles) must read on top of it. The
    // game scene draws its own full-brightness river.
    const dimmed = await sharp(backdrop).modulate({ brightness: 0.6 }).png().toBuffer();
    outputs.backdrop = [dimmed, resolve(BG_DIR, 'frog-splash.webp')];
  }
  refuseOverwrite(
    Object.values(outputs).map(([, out]) => out),
    args.includes('--force'),
  );
  for (const [buf, out] of Object.values(outputs)) {
    await webp(buf, out);
    console.log(`wrote ${out}`);
  }

  if (previewPath) {
    const o = outputs;
    const water = await sharp({ create: { width: 1280, height: 900, channels: 4, background: '#2f9cc4' } })
      .composite([
        ...Array.from({ length: 20 }, (_, i) => ({ input: o.water[0], left: (i % 5) * 256, top: Math.floor(i / 5) * 256 })),
      ])
      .png()
      .toBuffer();
    await sharp(water)
      .composite([
        { input: o.far[0], left: 0, top: 0 },
        { input: o.pad1[0], left: 200, top: 300 },
        { input: o.pad2[0], left: 560, top: 320 },
        { input: o.pad1[0], left: 920, top: 290 },
        { input: o.splash[0], left: 0, top: 500 },
        { input: o.near[0], left: 0, top: 660 },
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
