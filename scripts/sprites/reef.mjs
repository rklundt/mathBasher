#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Math-a-lotl scenery generator (sprint 2.5.4): the galaxy-over-water
 * backdrop, the answer bubble, and the reef decorations (coral, seaweed,
 * background fish). Like `axolotl.mjs`, the art is drawn in code — this file
 * IS the source; edit and re-run, never hand-edit the outputs.
 *
 * Usage:
 *   pnpm sprite:reef                  # writes the shipped WebPs
 *   pnpm sprite:reef --preview <png>  # also writes a review sheet
 *   pnpm sprite:reef --force          # re-render over existing shipped files
 *
 * Outputs:
 *   public/assets/sprites/bg/math-a-lotl.webp       1280×720 backdrop
 *   public/assets/sprites/bg/reef-bubble.webp         answer / ambient bubble
 *   public/assets/sprites/bg/reef-coral-{1,2,3}.webp  static coral pieces
 *   public/assets/sprites/bg/reef-seaweed.webp        SEAWEED_FRAMES sway frames
 *   public/assets/sprites/bg/reef-fish.webp           FISH_FRAMES swim frames (white; tinted in game)
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BG_DIR = resolve(ROOT, 'public/assets/sprites/bg');

export const BG_W = 1280;
export const BG_H = 720;
/** Fraction of the backdrop height that is sky; the rest is water. */
export const SKY_FRAC = 0.25;
export const SEAWEED_W = 110;
export const SEAWEED_H = 260;
export const SEAWEED_FRAMES = 4;
export const FISH_W = 120;
export const FISH_H = 70;
export const FISH_FRAMES = 2;
export const BUBBLE_SIZE = 128;

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

// ---------- backdrop ----------

function backdropSvg() {
  const rng = mulberry32(42);
  const skyH = BG_H * SKY_FRAC;
  const stars = Array.from({ length: 70 }, () => {
    const r = 0.6 + rng() * 1.6;
    return `<circle cx="${f(rng() * BG_W)}" cy="${f(rng() * (skyH - 14))}" r="${f(r)}" fill="#fff" opacity="${f(0.45 + rng() * 0.55)}"/>`;
  }).join('');
  // Gentle wave along the waterline.
  const waveTop = Array.from(
    { length: BG_W / 40 },
    (_, i) => `Q${i * 40 + 20},${f(skyH + (i % 2 ? -7 : 7))} ${i * 40 + 40},${skyH}`,
  ).join(' ');
  const wave = `M0,${skyH} ${waveTop} V${BG_H} H0 Z`;
  const rays = Array.from({ length: 6 }, (_, i) => {
    const x = 60 + i * 215 + rng() * 40;
    return `<polygon points="${f(x)},${skyH} ${f(x + 70)},${skyH} ${f(x - 60)},${BG_H} ${f(x - 190)},${BG_H}" fill="url(#ray)"/>`;
  }).join('');
  const sand = `M0,${BG_H - 46} Q160,${BG_H - 66} 340,${BG_H - 50} T720,${BG_H - 52} T1080,${BG_H - 48} T1280,${BG_H - 56} V${BG_H} H0 Z`;
  const defs = `
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#170c36"/><stop offset="1" stop-color="#4c2380"/></linearGradient>
    <radialGradient id="neb1" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#e05aa8" stop-opacity="0.85"/><stop offset="1" stop-color="#e05aa8" stop-opacity="0"/></radialGradient>
    <radialGradient id="neb2" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#8a4ee0" stop-opacity="0.8"/><stop offset="1" stop-color="#8a4ee0" stop-opacity="0"/></radialGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#63c8f2"/><stop offset="0.4" stop-color="#2f8fd6"/><stop offset="1" stop-color="#164f97"/></linearGradient>
    <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.2"/><stop offset="0.8" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9c99a"/><stop offset="1" stop-color="#b98e5e"/></linearGradient>`;
  const body = `
    <rect width="${BG_W}" height="${skyH + 10}" fill="url(#sky)"/>
    <ellipse cx="300" cy="${skyH * 0.45}" rx="360" ry="110" fill="url(#neb1)"/>
    <ellipse cx="980" cy="${skyH * 0.6}" rx="420" ry="120" fill="url(#neb2)"/>
    <ellipse cx="660" cy="${skyH * 0.3}" rx="220" ry="70" fill="url(#neb1)" opacity="0.6"/>
    ${stars}
    <path d="${wave}" fill="url(#water)"/>
    ${rays}
    <path d="${sand}" fill="url(#sand)" opacity="0.9"/>
    <path d="M0,${skyH} ${waveTop}" fill="none" stroke="#bfeaff" stroke-width="3" opacity="0.8"/>`;
  return svg(BG_W, BG_H, body, defs);
}

// ---------- bubble ----------

function bubbleSvg() {
  const s = BUBBLE_SIZE;
  const c = s / 2;
  const r = c - 4;
  const defs = `<radialGradient id="b" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#bfe8ff" stop-opacity="0.12"/><stop offset="0.75" stop-color="#bfe8ff" stop-opacity="0.22"/>
      <stop offset="0.95" stop-color="#ffffff" stop-opacity="0.75"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.9"/></radialGradient>`;
  const body = `
    <circle cx="${c}" cy="${c}" r="${r}" fill="url(#b)" stroke="#ffffff" stroke-opacity="0.85" stroke-width="3"/>
    <ellipse cx="${c - r * 0.42}" cy="${c - r * 0.45}" rx="${r * 0.2}" ry="${r * 0.12}" fill="#fff" opacity="0.95" transform="rotate(-40 ${c - r * 0.42} ${c - r * 0.45})"/>
    <circle cx="${c - r * 0.18}" cy="${c - r * 0.62}" r="${r * 0.05}" fill="#fff" opacity="0.9"/>
    <path d="M${f(c + r * 0.55)},${f(c + r * 0.45)} A${r * 0.75},${r * 0.75} 0 0 1 ${f(c + r * 0.1)},${f(c + r * 0.7)}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.55"/>`;
  return svg(s, s, body, defs);
}

// ---------- coral ----------

/** Branching coral: recursive tapered branches with round tips. */
function branchCoralSvg() {
  const W = 200;
  const H = 220;
  const rng = mulberry32(3);
  const strokes = [];
  const tips = [];
  const grow = (x, y, ang, len, wd, depth) => {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    const mx = (x + x2) / 2 + (rng() - 0.5) * 10;
    const my = (y + y2) / 2;
    strokes.push({ d: `M${f(x)},${f(y)} Q${f(mx)},${f(my)} ${f(x2)},${f(y2)}`, wd });
    if (depth === 0) {
      tips.push([x2, y2, wd * 0.62]);
      return;
    }
    const kids = depth > 1 ? 2 : 2 + (rng() < 0.4 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const spread = (k - (kids - 1) / 2) * 0.55 + (rng() - 0.5) * 0.25;
      grow(x2, y2, ang + spread, len * (0.68 + rng() * 0.12), wd * 0.72, depth - 1);
    }
  };
  grow(W / 2, H - 6, -Math.PI / 2, 62, 20, 3);
  const outline = strokes
    .map((s) => `<path d="${s.d}" fill="none" stroke="#b9405d" stroke-width="${f(s.wd + 5)}" stroke-linecap="round"/>`)
    .join('');
  const fill = strokes
    .map((s) => `<path d="${s.d}" fill="none" stroke="#ff7f95" stroke-width="${f(s.wd)}" stroke-linecap="round"/>`)
    .join('');
  const shine = strokes
    .map(
      (s) =>
        `<path d="${s.d}" fill="none" stroke="#ffb3c0" stroke-width="${f(s.wd * 0.3)}" stroke-linecap="round" transform="translate(-${f(s.wd * 0.18)},0)"/>`,
    )
    .join('');
  const tipDots = tips.map(([x, y, r]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#ffd0d8"/>`).join('');
  return svg(W, H, outline + fill + shine + tipDots);
}

/** Sea fan: a lacy fan of thin branches over a translucent web. */
function fanCoralSvg() {
  const W = 250;
  const H = 160;
  const rng = mulberry32(11);
  const bx = W / 2;
  const by = H - 8;
  const rays = 11;
  let lines = '';
  let web = `M${bx},${by}`;
  for (let i = 0; i < rays; i++) {
    const a = -Math.PI + 0.35 + (i / (rays - 1)) * (Math.PI - 0.7);
    const len = 108 + rng() * 14;
    const ex = bx + Math.cos(a) * len;
    const ey = by + Math.sin(a) * len;
    const mx = bx + Math.cos(a) * len * 0.5 + (rng() - 0.5) * 18;
    const my = by + Math.sin(a) * len * 0.5;
    lines += `<path d="M${bx},${by} Q${f(mx)},${f(my)} ${f(ex)},${f(ey)}" fill="none" stroke="#7a3fb8" stroke-width="5" stroke-linecap="round"/>`;
    lines += `<path d="M${bx},${by} Q${f(mx)},${f(my)} ${f(ex)},${f(ey)}" fill="none" stroke="#c88cf0" stroke-width="2.4" stroke-linecap="round"/>`;
    web += ` L${f(ex)},${f(ey)}`;
  }
  web += ' Z';
  // Cross-hatch lace: concentric arcs.
  let lace = '';
  for (const k of [0.35, 0.55, 0.75, 0.92]) {
    lace += `<path d="M${f(bx - 104 * k)},${f(by - 26 * k)} Q${bx},${f(by - 232 * k)} ${f(bx + 104 * k)},${f(by - 26 * k)}" fill="none" stroke="#c88cf0" stroke-width="1.6" opacity="0.7"/>`;
  }
  return svg(W, H, `<path d="${web}" fill="#b56ee6" opacity="0.35" stroke-linejoin="round"/>${lace}${lines}`);
}

/** Brain coral dome with a little anemone beside it. */
function brainCoralSvg() {
  const W = 230;
  const H = 130;
  const grooves = Array.from({ length: 6 }, (_, i) => {
    const y = 58 + i * 11;
    let d = `M${30 + i * 3},${y}`;
    for (let x = 30 + i * 3; x < 150 - i * 3; x += 12) d += ` q6,${i % 2 ? -6 : 6} 12,0`;
    return `<path d="${d}" fill="none" stroke="#2f8f86" stroke-width="2.6" stroke-linecap="round" opacity="0.8"/>`;
  }).join('');
  const tentacles = Array.from({ length: 9 }, (_, i) => {
    const a = -Math.PI / 2 + (i - 4) * 0.22;
    const x2 = 168 + Math.cos(a) * 46;
    const y2 = 118 + Math.sin(a) * 46;
    const d = `M168,118 Q${f(168 + Math.cos(a) * 24 + (i % 2 ? 6 : -6))},${f(118 + Math.sin(a) * 24)} ${f(x2)},${f(y2)}`;
    return `<path d="${d}" fill="none" stroke="#e8743c" stroke-width="7" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#ffb27a" stroke-width="3.4" stroke-linecap="round"/><circle cx="${f(x2)}" cy="${f(y2)}" r="4.2" fill="#ffd9b8"/>`;
  }).join('');
  const dome = `<path d="M18,124 C18,40 162,40 162,124 Z" fill="#5fc9b8" stroke="#2f8f86" stroke-width="4" stroke-linejoin="round"/>`;
  const clip = `<clipPath id="dome"><path d="M18,124 C18,40 162,40 162,124 Z"/></clipPath>`;
  return svg(
    W,
    H,
    `${tentacles}${dome}<g clip-path="url(#dome)">${grooves}</g><ellipse cx="62" cy="70" rx="22" ry="8" fill="#fff" opacity="0.25"/>`,
    clip,
  );
}

// ---------- seaweed ----------

function seaweedSvg(phase) {
  const W = SEAWEED_W;
  const H = SEAWEED_H;
  const pts = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12; // 0 = base, 1 = top
    const sway = 16 * Math.pow(t, 1.4) * Math.sin(Math.PI * 2 * phase + t * 2.2);
    return [W / 2 + sway, H - 4 - t * (H - 20), 12 * (1 - t) + 4];
  });
  const left = pts.map(([x, y, w]) => `${f(x - w)},${f(y)}`);
  const right = pts.map(([x, y, w]) => `${f(x + w)},${f(y)}`).reverse();
  const leaves = pts
    .filter((_, i) => i > 1 && i < 12 && i % 2 === 0)
    .map(([x, y, w], k) => {
      const side = k % 2 ? 1 : -1;
      const lx = x + side * (w + 24);
      return `<path d="M${f(x)},${f(y)} Q${f(x + side * 14)},${f(y - 26)} ${f(lx)},${f(y - 18)} Q${f(x + side * 12)},${f(y + 4)} ${f(x)},${f(y)} Z" fill="#46c27f" stroke="#1f7d4c" stroke-width="2.2" stroke-linejoin="round"/>`;
    })
    .join('');
  return svg(
    W,
    H,
    `${leaves}<polygon points="${[...left, ...right].join(' ')}" fill="#46c27f" stroke="#1f7d4c" stroke-width="2.6" stroke-linejoin="round"/>`,
  );
}

// ---------- fish (white; the game tints + fades it) ----------

function fishSvg(phase) {
  const W = FISH_W;
  const H = FISH_H;
  const tail = 10 * Math.sin(Math.PI * 2 * phase);
  return svg(
    W,
    H,
    `<path d="M30,35 L6,${f(16 + tail)} L10,35 L6,${f(54 + tail)} Z" fill="#fff" stroke="#dfe9ff" stroke-width="2" stroke-linejoin="round"/>
     <path d="M58,16 Q66,4 78,14" fill="#fff"/>
     <ellipse cx="66" cy="35" rx="40" ry="21" fill="#fff"/>
     <circle cx="92" cy="30" r="5" fill="#1d2a4a"/><circle cx="93.5" cy="28.5" r="1.8" fill="#fff"/>
     <path d="M60,26 Q66,35 60,44" fill="none" stroke="#dfe9ff" stroke-width="3" stroke-linecap="round"/>`,
  );
}

// ---------- render ----------

/**
 * Shipped game assets are cached for a week under stable names, so a
 * re-render that silently overwrites one can serve stale art (see
 * DeveloperGuide "Cache model"). Refuse unless `--force` is passed —
 * a visible change should ship under a NEW filename instead.
 */
function refuseOverwrite(paths, force) {
  const existing = paths.filter((p) => existsSync(p));
  if (existing.length === 0 || force) return;
  console.error('Refusing to overwrite shipped assets (pass --force to re-render in place):');
  for (const p of existing) console.error(`  ${p}`);
  console.error('A visible change should ship under a new filename (week-long cache).');
  process.exit(1);
}

const png = (s) => sharp(Buffer.from(s)).png().toBuffer();

async function sheet(frames, w, h) {
  const bufs = await Promise.all(frames.map(png));
  return sharp({
    create: { width: w * bufs.length, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(bufs.map((input, i) => ({ input, left: i * w, top: 0 })))
    .png()
    .toBuffer();
}

const webp = (buf, out) => sharp(buf).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(out);

async function main() {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;
  mkdirSync(BG_DIR, { recursive: true });

  const outputs = {
    bg: [await png(backdropSvg()), resolve(BG_DIR, 'math-a-lotl.webp')],
    bubble: [await png(bubbleSvg()), resolve(BG_DIR, 'reef-bubble.webp')],
    coral1: [await png(branchCoralSvg()), resolve(BG_DIR, 'reef-coral-1.webp')],
    coral2: [await png(fanCoralSvg()), resolve(BG_DIR, 'reef-coral-2.webp')],
    coral3: [await png(brainCoralSvg()), resolve(BG_DIR, 'reef-coral-3.webp')],
    seaweed: [
      await sheet(
        Array.from({ length: SEAWEED_FRAMES }, (_, i) => seaweedSvg(i / SEAWEED_FRAMES)),
        SEAWEED_W,
        SEAWEED_H,
      ),
      resolve(BG_DIR, 'reef-seaweed.webp'),
    ],
    fish: [
      await sheet(
        Array.from({ length: FISH_FRAMES }, (_, i) => fishSvg(i / FISH_FRAMES)),
        FISH_W,
        FISH_H,
      ),
      resolve(BG_DIR, 'reef-fish.webp'),
    ],
  };
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
    await sharp(o.bg[0])
      .composite([
        { input: o.coral2[0], left: 60, top: BG_H - 230 },
        { input: o.coral1[0], left: 240, top: BG_H - 250 },
        { input: o.coral3[0], left: 980, top: BG_H - 150 },
        { input: o.seaweed[0], left: 470, top: BG_H - 290 },
        { input: await sharp(o.fish[0]).ensureAlpha(0.35).toBuffer(), left: 700, top: 300 },
        { input: o.bubble[0], left: 820, top: 420 },
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
