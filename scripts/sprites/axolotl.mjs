#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Math-a-lotl axolotl sprite generator (sprint 2.5.4).
 *
 * The axolotl is original vector art drawn in code: this script builds an SVG
 * per animation frame from a handful of parameters (tail wave phase, gill
 * flutter, leg paddle, happy face), rasterizes each frame with sharp, and
 * packs the frames into one horizontal sprite sheet per colorway.
 *
 * This file IS the source of the art — edit the shapes / colors here and
 * re-run; never hand-edit the shipped sheets.
 *
 * Usage:
 *   pnpm sprite:axolotl                 # writes public/assets/sprites/hero/axolotl-*.webp
 *   pnpm sprite:axolotl --preview <png> # also writes a review sheet (all colorways on water)
 *   pnpm sprite:axolotl --force         # re-render over existing shipped sheets
 *
 * Sheet layout (per colorway): SWIM_FRAMES swim-cycle frames, then 1 happy
 * frame. Every frame is FRAME_W × FRAME_H, facing RIGHT; the game flips /
 * rotates the sprite for other directions.
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = resolve(ROOT, 'public/assets/sprites/hero');

export const FRAME_W = 340;
export const FRAME_H = 224;
/** Offset of the drawing inside the frame (room for gill tips and the tail fin). */
const PAD_X = 6;
const PAD_Y = 18;
export const SWIM_FRAMES = 6;

/** Freckles on the back of the head: [dx, dy, r] from the head centre. */
const HEAD_SPOTS = [
  [-44, -14, 3.2], [-34, -32, 2.6], [-16, -44, 3], [6, -46, 2.4], [26, -42, 3],
  [44, -30, 2.4], [-52, 8, 2.6], [-40, 28, 3], [-22, 38, 2.4], [58, -12, 2.2],
];

/** Small deterministic PRNG so the freckles land in the same place every frame. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Colorways — body / belly / outline / gills / fin / cheeks. */
const COLORWAYS = {
  pink: {
    body: '#ffb3c8', belly: '#ffe3ec', outline: '#b9476f',
    gill: '#e8467c', gillLight: '#ff86ad', fin: '#ffd3e0', blush: '#ff6f9a',
    bodyShade: '#f096b0', spot: '#de4f7f',
  },
  gold: {
    body: '#ffd65a', belly: '#fff4c8', outline: '#c06f16',
    gill: '#ff6a24', gillLight: '#ffa04f', fin: '#ffeaa6', blush: '#ff8a4a',
    bodyShade: '#efbb3c', spot: '#e8742a',
  },
  lilac: {
    body: '#a7b3d2', belly: '#dfe4f3', outline: '#4c4384',
    gill: '#9b5cff', gillLight: '#cfadff', fin: '#cdd4ec', blush: '#b98cff',
    bodyShade: '#8c99be', spot: '#7a58d6',
  },
};

// ---------- geometry helpers ----------

const f = (n) => n.toFixed(1);

/** Catmull-Rom spline through points → SVG cubic path (open). */
function smoothPath(pts, closed = false) {
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${f(p[1][0])},${f(p[1][1])}`;
  const end = closed ? p.length - 2 : p.length - 2;
  for (let i = 1; i < end; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return closed ? d + ' Z' : d;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- the axolotl ----------

/**
 * One frame as an SVG string.
 * @param {object} c       colorway
 * @param {number} phase   swim-cycle phase, 0..1
 * @param {boolean} happy  closed-eye happy face (catch frame)
 */
function axolotlSvg(c, phase, happy) {
  const TAU = Math.PI * 2;
  const w = TAU * phase;

  // Spine: s=0 just behind the head → s=1 tail tip. The wave grows toward
  // the tail so the body stays steady while the tail sweeps.
  const spine = (s) => [196 - s * 170, 114 + 2 * s + 26 * Math.pow(s, 1.5) * Math.sin(w - s * 2.8)];
  const normal = (s) => {
    const a = spine(Math.max(0, s - 0.01));
    const b = spine(Math.min(1, s + 0.01));
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    return [-dy / len, dx / len]; // points up on screen (SVG y grows down)
  };
  const half = (s) => (s < 0.3 ? 38 - s * 12 : 34.4 * Math.pow(1 - (s - 0.3) / 0.7, 1.2) + 2.5);
  const halfBelow = (s) => half(s) * (s < 0.4 ? 1.12 : 1);
  const finTop = (s) => 17 * smoothstep(0.08, 0.55, s) * (1 - 0.55 * smoothstep(0.86, 1, s));
  const finBot = (s) => 13 * smoothstep(0.45, 0.72, s) * (1 - 0.55 * smoothstep(0.86, 1, s));
  const at = (s, off) => {
    const p = spine(s);
    const n = normal(s);
    return [p[0] + n[0] * off, p[1] + n[1] * off];
  };
  const range = (a, b, steps) => Array.from({ length: steps + 1 }, (_, i) => a + ((b - a) * i) / steps);

  const tip = (() => {
    const p = spine(1);
    const q = spine(0.98);
    const dx = p[0] - q[0];
    const dy = p[1] - q[1];
    const len = Math.hypot(dx, dy);
    return (extra) => [p[0] + (dx / len) * extra, p[1] + (dy / len) * extra];
  })();

  // Fin (translucent ridge along the back + under the tail).
  const finPts = [
    ...range(0.06, 1, 24).map((s) => at(s, half(s) + finTop(s))),
    tip(10),
    ...range(1, 0.45, 12).map((s) => at(s, -(halfBelow(s) + finBot(s)))),
    ...range(0.45, 0.06, 6).map((s) => spine(s)),
  ];
  // Body + tail.
  const bodyPts = [
    ...range(0, 1, 26).map((s) => at(s, half(s))),
    tip(3),
    ...range(1, 0, 26).map((s) => at(s, -halfBelow(s))),
    [spine(0)[0] + 18, spine(0)[1]],
  ];

  // Legs: shoulder on the belly edge → upper arm → elbow → forearm → splayed
  // fingers (4 front, 5 back), like a real axolotl. They paddle back and
  // forth; the near and far pairs move in antiphase.
  const rad = (d) => (d * Math.PI) / 180;
  const leg = (s, theta, bend, far, toes) => {
    const [x, y] = at(s, -halfBelow(s) + 9);
    const elbow = [x + Math.cos(rad(theta)) * 15, y + Math.sin(rad(theta)) * 15];
    const fa = theta - bend;
    const wrist = [elbow[0] + Math.cos(rad(fa)) * 12, elbow[1] + Math.sin(rad(fa)) * 12];
    const limb = `M${f(x)},${f(y)} L${f(elbow[0])},${f(elbow[1])} L${f(wrist[0])},${f(wrist[1])}`;
    const fingers = Array.from({ length: toes }, (_, k) => {
      const a = rad(fa - 50 + (100 * k) / (toes - 1));
      const len = 11 + 3 * Math.sin((Math.PI * (k + 0.5)) / toes);
      const tipPt = [wrist[0] + Math.cos(a) * len, wrist[1] + Math.sin(a) * len];
      return { d: `M${f(wrist[0])},${f(wrist[1])} L${f(tipPt[0])},${f(tipPt[1])}`, tipPt };
    });
    const fill = far ? c.bodyShade : c.body;
    const stroke = (d, wd, col) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${wd}" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<g>
      ${fingers.map((g) => stroke(g.d, 6.2, c.outline)).join('')}
      ${fingers.map((g) => `<circle cx="${f(g.tipPt[0])}" cy="${f(g.tipPt[1])}" r="3.2" fill="${c.outline}"/>`).join('')}
      ${stroke(limb, 13, c.outline)}
      ${fingers.map((g) => stroke(g.d, 3.2, fill)).join('')}
      ${fingers.map((g) => `<circle cx="${f(g.tipPt[0])}" cy="${f(g.tipPt[1])}" r="2.2" fill="${fill}"/>`).join('')}
      ${stroke(limb, 8.6, fill)}
    </g>`;
  };
  const paddle = 24 * Math.sin(w);
  const legsFar = leg(0.11, 150 - paddle, 22 + paddle * 0.4, true, 4) + leg(0.42, 150 + paddle, 22 - paddle * 0.4, true, 5);
  const legsNear = leg(0.05, 138 + paddle, 26 - paddle * 0.5, false, 4) + leg(0.36, 138 - paddle, 26 + paddle * 0.5, false, 5);

  // Freckles: scattered along the body (they ride the spine, so they move
  // with the tail wave) and over the back of the head, clear of the face.
  const rng = mulberry32(7);
  const bodySpots = Array.from({ length: 13 }, (_, i) => {
    // Evenly stepped along the body with a little jitter, alternating
    // high / low so they don't clump.
    const s = 0.05 + (i / 12) * 0.66 + (rng() - 0.5) * 0.03;
    const off = ((i % 2 ? 0.45 : -0.2) + (rng() - 0.5) * 0.35) * half(s);
    const [x, y] = at(s, off);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2.8 + rng() * 1.4 - s * 1.2)}" fill="${c.spot}" opacity="0.85"/>`;
  }).join('');

  // Head + face (3/4 view: face turned toward the viewer, both eyes showing).
  const hx = 238;
  const hy = 94;
  const bob = 1.5 * Math.sin(w + 1);

  // Gills: three feathery fronds per side, fluttering.
  const frond = (bx, by, deg, len, i, far) => {
    const a = ((deg + 8 * Math.sin(w * 2 + i * 0.9)) * Math.PI) / 180;
    const dir = [Math.cos(a), Math.sin(a)];
    const perp = [-dir[1], dir[0]];
    const curl = 7;
    const P = (t) => {
      // quadratic bezier base → mid(curled) → end
      const m = [bx + dir[0] * len * 0.5 + perp[0] * curl, by + dir[1] * len * 0.5 + perp[1] * curl];
      const e = [bx + dir[0] * len, by + dir[1] * len];
      const u = 1 - t;
      return [u * u * bx + 2 * u * t * m[0] + t * t * e[0], u * u * by + 2 * u * t * m[1] + t * t * e[1]];
    };
    const col = far ? c.gill : c.gill;
    let fringe = '';
    for (const t of [0.3, 0.47, 0.64, 0.8, 0.94]) {
      const [px, py] = P(t);
      const k = 8.5 * (1.15 - t * 0.5);
      for (const side of [1, -1]) {
        const ex = px + perp[0] * k * side - dir[0] * k * 0.55;
        const ey = py + perp[1] * k * side - dir[1] * k * 0.55;
        fringe += `<line x1="${f(px)}" y1="${f(py)}" x2="${f(ex)}" y2="${f(ey)}" stroke="${col}" stroke-width="4.6" stroke-linecap="round"/>`;
      }
    }
    const pts = range(0, 1, 8).map(P);
    const stalk = smoothPath(pts);
    return `<g opacity="${far ? 0.92 : 1}">${fringe}
      <path d="${stalk}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round"/>
      <path d="${stalk}" fill="none" stroke="${c.gillLight}" stroke-width="3" stroke-linecap="round" opacity="0.9"/></g>`;
  };
  const gills =
    frond(hx - 40, hy - 32 + bob, 200, 40, 0, true) +
    frond(hx - 34, hy - 42 + bob, 225, 46, 1, true) +
    frond(hx - 18, hy - 50 + bob, 252, 42, 2, true) +
    frond(hx + 28, hy - 48 + bob, 292, 40, 3, false) +
    frond(hx + 46, hy - 36 + bob, 318, 44, 4, false) +
    frond(hx + 56, hy - 18 + bob, 345, 38, 5, false);

  const eye = (ex, ey, r) =>
    happy
      ? `<path d="M${f(ex - r)},${f(ey + 2)} Q${f(ex)},${f(ey - r * 1.3)} ${f(ex + r)},${f(ey + 2)}" fill="none" stroke="#1d1526" stroke-width="3.6" stroke-linecap="round"/>`
      : `<ellipse cx="${f(ex)}" cy="${f(ey)}" rx="${f(r)}" ry="${f(r * 1.12)}" fill="#1d1526"/>
         <circle cx="${f(ex - r * 0.32)}" cy="${f(ey - r * 0.38)}" r="${f(r * 0.38)}" fill="#fff"/>
         <circle cx="${f(ex + r * 0.35)}" cy="${f(ey + r * 0.35)}" r="${f(r * 0.17)}" fill="#fff"/>`;

  const mouth = happy
    ? `<path d="M${hx + 6},${hy + 12 + bob} Q${hx + 22},${hy + 30 + bob} ${hx + 38},${hy + 11 + bob} Z" fill="#7a2a45" stroke="${c.outline}" stroke-width="2.5" stroke-linejoin="round"/>
       <path d="M${hx + 15},${hy + 21 + bob} Q${hx + 22},${hy + 17 + bob} ${hx + 30},${hy + 21 + bob} Q${hx + 22},${hy + 27 + bob} ${hx + 15},${hy + 21 + bob} Z" fill="#ff7d9c"/>`
    : `<path d="M${hx + 4},${hy + 13 + bob} Q${hx + 22},${hy + 25 + bob} ${hx + 40},${hy + 11 + bob}" fill="none" stroke="${c.outline}" stroke-width="3" stroke-linecap="round"/>`;

  const head = `<g transform="translate(0,${f(bob)})">
    <ellipse cx="${hx}" cy="${hy}" rx="66" ry="54" fill="url(#headGrad)" stroke="${c.outline}" stroke-width="3.2"/>
    <ellipse cx="${hx - 18}" cy="${hy - 30}" rx="24" ry="11" fill="#fff" opacity="0.32" transform="rotate(-14 ${hx - 18} ${hy - 30})"/>
    <ellipse cx="${hx - 10}" cy="${hy + 14}" rx="10" ry="6" fill="${c.blush}" opacity="0.45"/>
    <ellipse cx="${hx + 52}" cy="${hy + 10}" rx="8" ry="5.5" fill="${c.blush}" opacity="0.45"/>
    ${HEAD_SPOTS.map(([dx, dy, r]) => `<circle cx="${hx + dx}" cy="${hy + dy}" r="${r}" fill="${c.spot}" opacity="0.85"/>`).join('')}
  </g>
  ${eye(hx + 2, hy - 4 + bob, 9.5)}
  ${eye(hx + 42, hy - 7 + bob, 8.6)}
  ${mouth}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${FRAME_H}" viewBox="0 0 ${FRAME_W} ${FRAME_H}">
  <defs>
    <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.35" stop-color="${c.body}"/><stop offset="1" stop-color="${c.belly}"/>
    </linearGradient>
    <radialGradient id="headGrad" cx="0.45" cy="0.35" r="0.75">
      <stop offset="0" stop-color="${c.belly}"/><stop offset="0.55" stop-color="${c.body}"/><stop offset="1" stop-color="${c.body}"/>
    </radialGradient>
  </defs>
  <g transform="translate(${PAD_X},${PAD_Y})">
  ${legsFar}
  <path d="${smoothPath(finPts, true)}" fill="${c.fin}" fill-opacity="0.9" stroke="${c.outline}" stroke-width="2" stroke-opacity="0.6" stroke-linejoin="round"/>
  <path d="${smoothPath(bodyPts, true)}" fill="url(#bodyGrad)" stroke="${c.outline}" stroke-width="3.2" stroke-linejoin="round"/>
  ${bodySpots}
  ${legsNear}
  ${gills}
  ${head}
  </g>
</svg>`;
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


async function renderSheet(c) {
  const frames = [];
  for (let i = 0; i < SWIM_FRAMES; i++) frames.push(axolotlSvg(c, i / SWIM_FRAMES, false));
  frames.push(axolotlSvg(c, 0, true));
  const bufs = await Promise.all(frames.map((svg) => sharp(Buffer.from(svg)).png().toBuffer()));
  return sharp({
    create: { width: FRAME_W * bufs.length, height: FRAME_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(bufs.map((input, i) => ({ input, left: i * FRAME_W, top: 0 })));
}

async function main() {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;

  mkdirSync(OUT_DIR, { recursive: true });
  refuseOverwrite(
    Object.keys(COLORWAYS).map((name) => resolve(OUT_DIR, `axolotl-${name}.webp`)),
    args.includes('--force'),
  );
  const rows = [];
  for (const [name, c] of Object.entries(COLORWAYS)) {
    const sheet = await renderSheet(c);
    const png = await sheet.png().toBuffer();
    const out = resolve(OUT_DIR, `axolotl-${name}.webp`);
    await sharp(png).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(out);
    console.log(`wrote ${out}`);
    rows.push(png);
  }

  if (previewPath) {
    const frames = SWIM_FRAMES + 1;
    await sharp({
      create: { width: FRAME_W * frames, height: FRAME_H * rows.length, channels: 4, background: '#2f7fc4' },
    })
      .composite(rows.map((input, i) => ({ input, left: 0, top: i * FRAME_H })))
      .png()
      .toFile(previewPath);
    console.log(`wrote preview ${previewPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
