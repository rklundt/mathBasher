#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Balance Scale art generator (sprint 2.12).
 *
 * Original kawaii vector art drawn in code, from the owner-approved proofs:
 * a sunny fair, a balance scale with a face on its pillar, pastel kettlebell
 * weights, a cheering crowd of animals peeking over the fences, a duckling
 * that walks the progress path, and six side-scenery layers that change
 * between questions. This file IS the source of the art: edit and re-run,
 * never hand-edit the shipped images.
 *
 * The scene draws the moving parts itself: the beam's angle, the strings to
 * the pans, the labels on the weights (`MathText`, so fractions stack), the
 * "?" on the empty slot and the stones on the path. Geometry the scene must
 * match is exported below and mirrored in `src/core/spriteKeys.ts` /
 * `config.balanceScale` (a test checks them).
 *
 * Outputs:
 *   public/assets/sprites/bg/balance-fair.webp       the game's scenery (bright)
 *   public/assets/sprites/bg/balance-scale.webp      darkened copy (Difficulty / Loading / Game Over)
 *   public/assets/sprites/bg/balance-props-{1..6}.webp  side scenery, transparent
 *   public/assets/sprites/hero/balance-pillar.webp   pillar faces: idle · happy · dizzy
 *   public/assets/sprites/hero/balance-beam.webp     the beam (hooks at both ends)
 *   public/assets/sprites/hero/balance-pan.webp      one pan
 *   public/assets/sprites/hero/balance-badge.webp    the "=" at the pivot
 *   public/assets/sprites/hero/balance-weights.webp  five weight colours (labels drawn by the scene)
 *   public/assets/sprites/hero/balance-slot.webp     the empty "?" slot (outline)
 *   public/assets/sprites/hero/balance-crowd.webp    8 animals × idle · happy · oops (6 × 4 grid)
 *   public/assets/sprites/hero/balance-duck.webp     the path duckling: idle · hop · cheer
 *
 * Usage:
 *   pnpm sprite:balance                       # writes the files above
 *   pnpm sprite:balance --preview <png> --dry # review board only, ships nothing
 *   pnpm sprite:balance --force               # re-render over the shipped files
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BG_DIR = resolve(ROOT, 'public/assets/sprites/bg');
const HERO_DIR = resolve(ROOT, 'public/assets/sprites/hero');
/** Menu backdrop brightness: white menu text must read on it. */
export const MENU_BRIGHTNESS = 0.45;

export const W = 1280;
export const H = 720;
/** The progress path: 12 stone centres, bottom (first question) to top. Mirrored in config.balanceScale.path. */
export const PATH = { x: 1205, amplitude: 30, turns: 2.2, bottomY: 600, topY: 150, stones: 12 };
/** Frame sizes (mirrored in spriteKeys BALANCE_SHEETS). */
export const PILLAR = { w: 260, h: 340 };
export const BEAM = { w: 600, h: 44 };
export const PAN = { w: 380, h: 74 };
export const BADGE = 96;
export const WEIGHT = { w: 130, h: 140, colours: 5 };
export const CROWD = { w: 200, h: 230, cols: 6, animals: 8, poses: 3 };
export const DUCK = { w: 120, h: 130, poses: 3 };
export const PROPS = 6;

const INK = '#3a2420';
const BLUSH = '#ff8fa3';
const f = (n) => Number(n).toFixed(1);

// ---------------------------------------------------------------- the fair

function cloud(x, y, s) {
  return `<g transform="translate(${x},${y}) scale(${s})" stroke="${INK}" stroke-width="3" fill="#fff">
    <path d="M-60,20 Q-70,-10 -40,-14 Q-34,-44 -2,-38 Q16,-60 42,-40 Q74,-44 70,-12 Q92,0 76,22 Z"/></g>`;
}

function bunting(y) {
  const cols = ['#ff9eb5', '#ffd36e', '#9fd8ff', '#b6e7a0', '#d2b6ff'];
  const flags = Array.from({ length: 17 }, (_, i) => {
    const x = 20 + i * 76;
    const sag = Math.sin((i / 16) * Math.PI) * 26;
    return `<path d="M${f(x)},${f(y + sag)} l38,4 l-16,40 Z" fill="${cols[i % 5]}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
  });
  return `<path d="M0,${y} Q640,${y + 52} 1280,${y}" fill="none" stroke="${INK}" stroke-width="3"/>${flags.join('')}`;
}

function fence(x0, x1, y) {
  const posts = [];
  for (let x = x0; x <= x1; x += 46) {
    posts.push(
      `<path d="M${x},${y + 70} L${x},${y + 4} L${x + 15},${y - 8} L${x + 30},${y + 4} L${x + 30},${y + 70} Z" fill="#f3d9a8" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`,
    );
  }
  const rail = (ry) =>
    `<rect x="${x0 - 6}" y="${y + ry}" width="${x1 - x0 + 42}" height="12" rx="4" fill="#e7c48a" stroke="${INK}" stroke-width="2.5"/>`;
  return `${posts.join('')}${rail(22)}${rail(48)}`;
}

/** Stone centres along the winding path (bottom → top). */
export function pathPoints() {
  return Array.from({ length: PATH.stones }, (_, i) => {
    const t = i / (PATH.stones - 1);
    return [
      PATH.x + Math.sin(t * Math.PI * PATH.turns) * PATH.amplitude,
      PATH.bottomY - t * (PATH.bottomY - PATH.topY),
    ];
  });
}

function pathTrail() {
  const pts = pathPoints();
  const d = 'M' + pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' L');
  const [fx, fy] = pts[pts.length - 1];
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="50" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="#f3d9a8" stroke-width="43" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M${f(fx)},${f(fy - 26)} L${f(fx)},${f(fy - 84)}" stroke="${INK}" stroke-width="4.5"/>
    <path d="M${f(fx)},${f(fy - 84)} l44,14 l-44,14 Z" fill="#ff9eb5" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
}

function fairSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9dcff"/><stop offset="1" stop-color="#e8f7ff"/></linearGradient>
    <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fdc7c"/><stop offset="1" stop-color="#78c25a"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${cloud(210, 150, 0.9)}${cloud(1040, 120, 1.1)}${cloud(640, 95, 0.6)}
  <path d="M0,470 Q320,400 660,450 T1280,430 L1280,720 L0,720 Z" fill="url(#grass)" stroke="${INK}" stroke-width="3"/>
  <path d="M0,560 Q640,520 1280,560 L1280,720 L0,720 Z" fill="#8fd16c" opacity="0.6"/>
  ${bunting(96)}
  ${pathTrail()}
  ${fence(-10, 220, 548)}${fence(990, 1110, 548)}
</svg>`;
}

// ------------------------------------------------------- side scenery (6)

const MUTE = 'opacity="0.85"';
function balloon(x, y, sc, c1, c2) {
  return `<g transform="translate(${x},${y}) scale(${sc})" ${MUTE}>
    <path d="M0,-40 Q34,-40 34,-6 Q34,22 6,40 L-6,40 Q-34,22 -34,-6 Q-34,-40 0,-40 Z" fill="${c1}" stroke="${INK}" stroke-width="3"/>
    <path d="M0,-40 Q14,-20 6,40 M0,-40 Q-14,-20 -6,40" fill="none" stroke="${c2}" stroke-width="5"/>
    <path d="M-6,40 L-9,58 M6,40 L9,58" stroke="${INK}" stroke-width="2"/>
    <rect x="-11" y="56" width="22" height="16" rx="3" fill="#c98b5a" stroke="${INK}" stroke-width="2.5"/></g>`;
}
function ferris(x, y, r) {
  const cols = ['#ff9eb5', '#ffd36e', '#9fd8ff', '#b6e7a0'];
  const cars = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const cx = x + Math.cos(a) * r;
    const cy = y + Math.sin(a) * r;
    return `<path d="M${x},${y} L${f(cx)},${f(cy)}" stroke="${INK}" stroke-width="2"/><rect x="${f(cx - 9)}" y="${f(cy - 2)}" width="18" height="14" rx="4" fill="${cols[i % 4]}" stroke="${INK}" stroke-width="2"/>`;
  }).join('');
  return `<g ${MUTE}><path d="M${x - 40},${y + r + 60} L${x},${y} L${x + 40},${y + r + 60}" fill="none" stroke="${INK}" stroke-width="4"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${INK}" stroke-width="4"/>${cars}
    <circle cx="${x}" cy="${y}" r="8" fill="#ffd36e" stroke="${INK}" stroke-width="2.5"/></g>`;
}
function tent(x, y, w, c) {
  const h = w * 0.8;
  const stripes = Array.from({ length: 4 }, (_, i) => {
    const x0 = x - w / 2 + (i * w) / 4;
    return i % 2 ? `<path d="M${f(x)},${f(y - h)} L${f(x0)},${f(y)} L${f(x0 + w / 4)},${f(y)} Z" fill="#fff"/>` : '';
  }).join('');
  const outline = `M${f(x)},${f(y - h)} L${f(x - w / 2)},${f(y)} L${f(x + w / 2)},${f(y)} Z`;
  return `<g ${MUTE}><path d="${outline}" fill="${c}"/>${stripes}<path d="${outline}" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M${f(x)},${f(y - h)} l0,-22 l18,7 l-18,7" fill="#ffd36e" stroke="${INK}" stroke-width="2"/></g>`;
}
function windmill(x, y) {
  const blades = [0, 90, 180, 270]
    .map(
      (a) =>
        `<path d="M0,0 L-8,-70 L8,-70 Z" fill="#fffaf0" stroke="${INK}" stroke-width="2.5" transform="rotate(${a + 20})"/>`,
    )
    .join('');
  return `<g ${MUTE}><path d="M${x - 30},${y + 120} L${x - 20},${y} L${x + 20},${y} L${x + 30},${y + 120} Z" fill="#f3d9a8" stroke="${INK}" stroke-width="3"/>
    <path d="M${x - 26},${y + 4} Q${x},${y - 30} ${x + 26},${y + 4} Z" fill="#e8728f" stroke="${INK}" stroke-width="3"/>
    <g transform="translate(${x},${y - 4})">${blades}<circle r="7" fill="#ffd36e" stroke="${INK}" stroke-width="2.5"/></g></g>`;
}
function kite(x, y, c, rot) {
  return `<g transform="translate(${x},${y}) rotate(${rot})" ${MUTE}><path d="M0,-34 L24,0 L0,40 L-24,0 Z" fill="${c}" stroke="${INK}" stroke-width="3"/>
    <path d="M0,-34 L0,40 M-24,0 L24,0" stroke="${INK}" stroke-width="1.5"/>
    <path d="M0,40 q10,20 -4,36 q-12,16 4,34" fill="none" stroke="${INK}" stroke-width="2"/>
    <path d="M-2,74 l-8,-4 l2,8 Z M2,96 l8,-4 l-2,8 Z" fill="#ffd36e" stroke="${INK}" stroke-width="1.5"/></g>`;
}
function rainbow(x, y, r) {
  const cols = ['#ff9eb5', '#ffd36e', '#b6e7a0', '#9fd8ff', '#d2b6ff'];
  return `<g opacity="0.7">${cols
    .map(
      (c, i) =>
        `<path d="M${x - r + i * 12},${y} A${r - i * 12},${r - i * 12} 0 0 1 ${x + r - i * 12},${y}" fill="none" stroke="${c}" stroke-width="12"/>`,
    )
    .join('')}</g>`;
}
function tree(x, y, sc) {
  return `<g transform="translate(${x},${y}) scale(${sc})" ${MUTE}><rect x="-7" y="0" width="14" height="40" fill="#c98b5a" stroke="${INK}" stroke-width="2.5"/>
    <circle cx="0" cy="-14" r="34" fill="#6fbf5a" stroke="${INK}" stroke-width="3"/><circle cx="-12" cy="-22" r="5" fill="#ff9eb5"/><circle cx="14" cy="-8" r="5" fill="#ff9eb5"/></g>`;
}
/** Side scenery for version v (0–5): only the strips the pans never reach (x < 140; around x 1110 above the crowd). */
function propsSvg(v) {
  const body = [
    () =>
      balloon(66, 220, 0.85, '#ff9eb5', '#ffd36e') +
      balloon(1112, 190, 0.5, '#9fd8ff', '#fff') +
      balloon(40, 360, 0.45, '#b6e7a0', '#fff'),
    () => ferris(70, 350, 58) + tree(1112, 430, 0.62),
    () => tent(66, 462, 118, '#e8728f') + tent(1112, 462, 72, '#6cb4e6'),
    () => windmill(70, 330) + tree(1112, 430, 0.62),
    () => kite(64, 220, '#d2b6ff', -14) + kite(1112, 200, '#ff9eb5', 12) + kite(100, 340, '#9fd8ff', 8),
    () => rainbow(70, 470, 100) + tree(1112, 430, 0.62),
  ][v]();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

// ------------------------------------------------------------- the scale

const ST = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"`;

/** The pillar with a face; the pivot sits at the frame's top centre. mood: idle | happy | dizzy. */
function pillarSvg(mood) {
  const cx = PILLAR.w / 2;
  const fy = 132; // face line
  let eyes;
  let mouth;
  if (mood === 'happy') {
    eyes = [-1, 1]
      .map(
        (d) =>
          `<path d="M${cx + d * 16 - 8},${fy + 4} Q${cx + d * 16},${fy - 6} ${cx + d * 16 + 8},${fy + 4}" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
      )
      .join('');
    mouth = `<path d="M${cx - 10},${fy + 16} L${cx + 10},${fy + 16} Q${cx + 10},${fy + 30} ${cx},${fy + 30} Q${cx - 10},${fy + 30} ${cx - 10},${fy + 16} Z" fill="#d9536c" stroke="${INK}" stroke-width="3"/>`;
  } else if (mood === 'dizzy') {
    // Wobbly, not sad: little swirl eyes and a wavy mouth.
    eyes = [-1, 1]
      .map(
        (d) =>
          `<path d="M${cx + d * 16},${fy} m-6,0 a6,6 0 1,1 6,6 a3,3 0 1,1 -3,-3" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      )
      .join('');
    mouth = `<path d="M${cx - 12},${fy + 22} q4,-6 8,0 q4,6 8,0 q4,-6 8,0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  } else {
    eyes = [-1, 1]
      .map(
        (d) =>
          `<ellipse cx="${cx + d * 16}" cy="${fy}" rx="7" ry="8" fill="#2a1a17"/><circle cx="${cx + d * 16 - 2.5}" cy="${fy - 3.5}" r="2.8" fill="#fff"/>`,
      )
      .join('');
    mouth = `<path d="M${cx - 8},${fy + 16} Q${cx},${fy + 26} ${cx + 8},${fy + 16}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  }
  const blush = [-1, 1]
    .map((d) => `<ellipse cx="${cx + d * 30}" cy="${fy + 14}" rx="9" ry="5.5" fill="${BLUSH}" opacity="0.85"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PILLAR.w}" height="${PILLAR.h}" viewBox="0 0 ${PILLAR.w} ${PILLAR.h}">
    <path d="M${cx - 120},${PILLAR.h - 4} Q${cx - 110},${PILLAR.h - 40} ${cx - 50},${PILLAR.h - 44} L${cx + 50},${PILLAR.h - 44} Q${cx + 110},${PILLAR.h - 40} ${cx + 120},${PILLAR.h - 4} Z" fill="#c98b5a" ${ST}/>
    <path d="M${cx - 34},${PILLAR.h - 44} L${cx - 26},40 L${cx + 26},40 L${cx + 34},${PILLAR.h - 44} Z" fill="#e2a873" ${ST}/>
    <path d="M${cx - 14},60 L${cx - 18},${PILLAR.h - 60}" stroke="#f6cf9e" stroke-width="5" stroke-linecap="round"/>
    ${blush}${eyes}${mouth}
  </svg>`;
}

function beamSvg() {
  const { w, h } = BEAM;
  const hook = (x) => `<circle cx="${x}" cy="${h / 2}" r="10" fill="#ffd36e" ${ST}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="8" y="${h / 2 - 13}" width="${w - 16}" height="26" rx="13" fill="#e2a873" ${ST}/>
    <path d="M30,${h / 2 - 4} L${w - 30},${h / 2 - 4}" stroke="#f6cf9e" stroke-width="5" stroke-linecap="round"/>
    ${hook(28)}${hook(w - 28)}
  </svg>`;
}

function panSvg() {
  const { w, h } = PAN;
  const cx = w / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="M10,12 Q${cx},${h + 4} ${w - 10},12 Z" fill="#ffd36e" ${ST}/>
    <path d="M10,12 L${w - 10},12" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M50,22 Q${cx - 80},40 ${cx - 10},44" fill="none" stroke="#fff6c9" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
}

function badgeSvg() {
  const r = BADGE / 2 - 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE}" height="${BADGE}" viewBox="0 0 ${BADGE} ${BADGE}">
    <circle cx="${BADGE / 2}" cy="${BADGE / 2}" r="${r}" fill="#fffaf0" ${ST}/>
    <rect x="${BADGE / 2 - 20}" y="${BADGE / 2 - 13}" width="40" height="8" rx="4" fill="${INK}"/>
    <rect x="${BADGE / 2 - 20}" y="${BADGE / 2 + 5}" width="40" height="8" rx="4" fill="${INK}"/>
  </svg>`;
}

// ------------------------------------------------------------ weights

const WEIGHT_COLOURS = [
  ['#ff9eb5', '#e8728f'],
  ['#9fd8ff', '#6cb4e6'],
  ['#ffd36e', '#e9b23d'],
  ['#b6e7a0', '#86c86c'],
  ['#d2b6ff', '#a98ae6'],
];
/** The body's centre in the frame (the scene puts the label plate here). */
export const WEIGHT_BODY = { cx: 65, cy: 92 };
const BODY = 'M-50,30 Q-58,-48 0,-50 Q58,-48 50,30 Q48,40 38,40 L-38,40 Q-48,40 -50,30 Z';

function weightSvg([fill, shade]) {
  return `<g transform="translate(${WEIGHT_BODY.cx},${WEIGHT_BODY.cy})">
    <path d="M-22,-46 Q-24,-76 0,-76 Q24,-76 22,-46" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>
    <path d="M-22,-46 Q-24,-76 0,-76 Q24,-76 22,-46" fill="none" stroke="${shade}" stroke-width="7" stroke-linecap="round"/>
    <path d="${BODY}" fill="${fill}" ${ST}/>
    <path d="M-34,-30 Q-30,-40 -18,-42" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.7"/>
    <ellipse cx="-38" cy="30" rx="6" ry="4" fill="${BLUSH}" opacity="0.7"/><ellipse cx="38" cy="30" rx="6" ry="4" fill="${BLUSH}" opacity="0.7"/>
  </g>`;
}
function slotSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WEIGHT.w}" height="${WEIGHT.h}" viewBox="0 0 ${WEIGHT.w} ${WEIGHT.h}">
    <g transform="translate(${WEIGHT_BODY.cx},${WEIGHT_BODY.cy})">
      <path d="${BODY}" fill="#ffffff" fill-opacity="0.92" stroke="${INK}" stroke-width="4" stroke-dasharray="11 7" stroke-linecap="round"/>
    </g></svg>`;
}
const frameSvg = (w, h, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;

// --------------------------------------------------------------- crowd

/** The crowd, in sheet order (row-major in a 6-wide grid, 3 poses each). */
export const CROWD_ANIMALS = ['bear', 'kitten', 'piglet', 'bunny', 'panda', 'lamb', 'mouse', 'frog'];
export const CROWD_POSES = ['idle', 'happy', 'oops'];

const ANIMALS = {
  bear: { fur: '#c98b5a', inner: '#f2c9a0', ear: 'round', snout: 'bear' },
  kitten: { fur: '#ffb15c', inner: '#ffe0bd', ear: 'tri', snout: 'cat', stripes: '#e8903c' },
  piglet: { fur: '#ffb3c6', inner: '#ff8fab', ear: 'flop', snout: 'pig' },
  bunny: { fur: '#fdf9f4', inner: '#f7b6c3', ear: 'long', snout: 'cat' },
  panda: { fur: '#fdf9f4', inner: '#2f2a2a', ear: 'round', snout: 'bear', patches: true, body: '#2f2a2a' },
  lamb: { fur: '#fff3dc', inner: '#f7d9c4', ear: 'side', snout: 'cat', wool: true },
  mouse: { fur: '#c9c4cf', inner: '#f7b6c3', ear: 'big', snout: 'cat' },
  frog: { fur: '#8fd16c', inner: '#c8f0a8', ear: 'none', snout: 'none', bulge: true },
};

/** One crowd animal peeking over the fence: head, shoulders and paws, body bottom at (0,70). */
function animalSvg(kind, mood) {
  const C = ANIMALS[kind];
  const st = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
  let ears = '';
  if (C.ear === 'round')
    ears = [-1, 1]
      .map(
        (d) =>
          `<circle cx="${d * 38}" cy="-42" r="17" fill="${C.patches ? '#2f2a2a' : C.fur}" ${st}/><circle cx="${d * 38}" cy="-42" r="8" fill="${C.patches ? '#5a5050' : C.inner}"/>`,
      )
      .join('');
  if (C.ear === 'tri')
    ears = [-1, 1]
      .map(
        (d) =>
          `<path d="M${d * 18},-48 L${d * 44},-76 L${d * 50},-30 Z" fill="${C.fur}" ${st}/><path d="M${d * 26},-48 L${d * 42},-65 L${d * 45},-38 Z" fill="${C.inner}"/>`,
      )
      .join('');
  if (C.ear === 'flop')
    ears = [-1, 1]
      .map(
        (d) =>
          `<path d="M${d * 22},-46 Q${d * 52},-64 ${d * 50},-28 Q${d * 38},-36 ${d * 22},-36 Z" fill="${C.fur}" ${st}/>`,
      )
      .join('');
  if (C.ear === 'long')
    ears = [-1, 1]
      .map(
        (d) =>
          `<ellipse cx="${d * 22}" cy="-92" rx="15" ry="42" fill="${C.fur}" ${st} transform="rotate(${d * 10} ${d * 22} -60)"/><ellipse cx="${d * 22}" cy="-88" rx="7" ry="30" fill="${C.inner}" transform="rotate(${d * 10} ${d * 22} -60)"/>`,
      )
      .join('');
  if (C.ear === 'big')
    ears = [-1, 1]
      .map(
        (d) =>
          `<circle cx="${d * 46}" cy="-46" r="28" fill="${C.fur}" ${st}/><circle cx="${d * 46}" cy="-46" r="17" fill="${C.inner}"/>`,
      )
      .join('');
  if (C.ear === 'side')
    ears = [-1, 1]
      .map(
        (d) =>
          `<ellipse cx="${d * 54}" cy="-18" rx="20" ry="10" fill="${C.inner}" ${st} transform="rotate(${d * 20} ${d * 54} -18)"/>`,
      )
      .join('');

  // Paws up (happy), on the cheeks (oops), or resting on the fence (idle).
  const pawCol = C.body ?? C.fur;
  let paws;
  if (mood === 'happy') {
    paws = [-1, 1]
      .map(
        (d) =>
          `<path d="M${d * 40},14 Q${d * 62},-10 ${d * 66},-58" fill="none" stroke="${INK}" stroke-width="17" stroke-linecap="round"/><path d="M${d * 40},14 Q${d * 62},-10 ${d * 66},-58" fill="none" stroke="${pawCol}" stroke-width="11" stroke-linecap="round"/>`,
      )
      .join('');
  } else if (mood === 'oops') {
    paws = [-1, 1].map((d) => `<ellipse cx="${d * 44}" cy="2" rx="14" ry="12" fill="${pawCol}" ${st}/>`).join('');
  } else {
    paws = [-1, 1].map((d) => `<ellipse cx="${d * 36}" cy="30" rx="15" ry="11" fill="${pawCol}" ${st}/>`).join('');
  }
  const body = `<path d="M-46,70 Q-50,10 0,6 Q50,10 46,70 Z" fill="${C.body ?? C.fur}" ${st}/>`;
  let head = `<ellipse cx="0" cy="-14" rx="52" ry="46" fill="${C.fur}" ${st}/>`;
  if (C.wool) {
    const puffs = [-36, -18, 0, 18, 36]
      .map((x, i) => `<circle cx="${x}" cy="${-52 + (i % 2) * 6}" r="16" fill="#fffaf0" ${st}/>`)
      .join('');
    head = `${head}${puffs}`;
  }
  if (C.stripes)
    head += [-1, 0, 1]
      .map((d) => `<path d="M${d * 12},-58 l0,14" stroke="${C.stripes}" stroke-width="5" stroke-linecap="round"/>`)
      .join('');
  if (C.bulge)
    head = [-1, 1].map((d) => `<circle cx="${d * 26}" cy="-52" r="22" fill="${C.fur}" ${st}/>`).join('') + head;

  const ey = C.bulge ? -50 : -16;
  const ex = C.bulge ? 26 : 18;
  let eyes;
  if (mood === 'happy') {
    eyes = [-1, 1]
      .map(
        (d) =>
          `<path d="M${d * ex - 9},${ey + 3} Q${d * ex},${ey - 9} ${d * ex + 9},${ey + 3}" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
      )
      .join('');
  } else {
    const r = mood === 'oops' ? 8 : 8;
    eyes = [-1, 1]
      .map(
        (d) =>
          `<ellipse cx="${d * ex}" cy="${ey}" rx="${r}" ry="${r + 1}" fill="#2a1a17"/><circle cx="${d * ex - 3}" cy="${ey - 4}" r="3.4" fill="#fff"/>`,
      )
      .join('');
  }
  const patches = C.patches
    ? [-1, 1]
        .map(
          (d) =>
            `<ellipse cx="${d * 18}" cy="${ey + 1}" rx="13" ry="15" fill="#2f2a2a" transform="rotate(${d * -20} ${d * 18} ${ey})"/>`,
        )
        .join('')
    : '';
  const blush = [-1, 1]
    .map(
      (d) => `<ellipse cx="${d * 34}" cy="${C.bulge ? -16 : ey + 14}" rx="10" ry="6.5" fill="${BLUSH}" opacity="0.8"/>`,
    )
    .join('');
  let snout = '';
  if (C.snout === 'bear')
    snout = `<ellipse cx="0" cy="2" rx="16" ry="11" fill="${C.patches ? '#fffaf0' : C.inner}" ${st}/><ellipse cx="0" cy="-3" rx="6" ry="4" fill="${INK}"/>`;
  if (C.snout === 'pig')
    snout = `<ellipse cx="0" cy="2" rx="15" ry="10" fill="${C.inner}" ${st}/><circle cx="-5" cy="2" r="2.6" fill="${INK}"/><circle cx="5" cy="2" r="2.6" fill="${INK}"/>`;
  if (C.snout === 'cat') snout = `<path d="M-4,-2 L4,-2 L0,3 Z" fill="#d9536c"/>`;
  let mouth;
  const my = C.snout === 'cat' || C.snout === 'none' ? 6 : 14;
  if (mood === 'happy')
    mouth = `<path d="M-10,${my} L10,${my} Q10,${my + 14} 0,${my + 14} Q-10,${my + 14} -10,${my} Z" fill="#d9536c" ${st}/>`;
  else if (mood === 'oops') mouth = `<ellipse cx="0" cy="${my + 6}" rx="6" ry="7" fill="#d9536c" ${st}/>`;
  else mouth = `<path d="M-7,${my} q3.5,5 7,0 q3.5,5 7,0" fill="none" ${st}/>`;
  if (C.snout === 'none')
    mouth = mood === 'idle' ? `<path d="M-14,${my - 4} Q0,${my + 8} 14,${my - 4}" fill="none" ${st}/>` : mouth;

  const confetti =
    mood === 'happy'
      ? ['#ff9eb5', '#ffd36e', '#9fd8ff', '#b6e7a0']
          .map(
            (c, i) =>
              `<rect x="${-70 + i * 44}" y="${-112 - (i % 2) * 16}" width="9" height="14" rx="2" fill="${c}" transform="rotate(${i * 35 - 40} ${-66 + i * 44} -106)"/>`,
          )
          .join('')
      : '';
  const oopsMarks =
    mood === 'oops'
      ? `<path d="M56,-70 l8,-12 M66,-60 l12,-6" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`
      : '';
  return `${confetti}${ears}${body}${head}${patches}${blush}${eyes}${snout}${mouth}${paws}${oopsMarks}`;
}

function crowdFrame(kind, mood) {
  return frameSvg(
    CROWD.w,
    CROWD.h,
    `<g transform="translate(${CROWD.w / 2},${CROWD.h - 72})">${animalSvg(kind, mood)}</g>`,
  );
}

// -------------------------------------------------------------- duckling

function duckSvg(pose) {
  const st = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
  const up = pose === 'hop' ? -14 : 0;
  const wings =
    pose === 'cheer'
      ? [-1, 1]
          .map(
            (d) =>
              `<path d="M${d * 30},10 Q${d * 52},-14 ${d * 50},-40" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/><path d="M${d * 30},10 Q${d * 52},-14 ${d * 50},-40" fill="none" stroke="#ffe066" stroke-width="9" stroke-linecap="round"/>`,
          )
          .join('')
      : [-1, 1].map((d) => `<ellipse cx="${d * 34}" cy="16" rx="12" ry="16" fill="#ffe066" ${st}/>`).join('');
  const eyes =
    pose === 'cheer'
      ? [-1, 1]
          .map(
            (d) =>
              `<path d="M${d * 15 - 7},-14 Q${d * 15},-22 ${d * 15 + 7},-14" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
          )
          .join('')
      : [-1, 1]
          .map(
            (d) =>
              `<ellipse cx="${d * 15}" cy="-16" rx="6" ry="7" fill="#2a1a17"/><circle cx="${d * 15 - 2}" cy="-19" r="2.5" fill="#fff"/>`,
          )
          .join('');
  return frameSvg(
    DUCK.w,
    DUCK.h,
    `<g transform="translate(${DUCK.w / 2},${DUCK.h - 40 + up}) scale(0.85)">
      <ellipse cx="0" cy="34" rx="28" ry="8" fill="#000" opacity="${pose === 'hop' ? 0.06 : 0.12}"/>
      <path d="M-34,34 Q-40,-4 0,-4 Q40,-4 34,34 Z" fill="#ffe066" ${st}/>
      ${wings}
      <ellipse cx="0" cy="-16" rx="36" ry="32" fill="#ffe066" ${st}/>
      <path d="M-6,-46 q6,-16 12,-4 q6,-10 8,4" fill="none" ${st}/>
      ${[-1, 1].map((d) => `<ellipse cx="${d * 26}" cy="-4" rx="8" ry="5" fill="${BLUSH}" opacity="0.8"/>`).join('')}
      ${eyes}
      <ellipse cx="0" cy="-4" rx="14" ry="7" fill="#ffb347" ${st}/>
    </g>`,
  );
}

// ---------------------------------------------------------------- output

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

async function grid(svgs, w, h, cols) {
  const bufs = await Promise.all(svgs.map(png));
  const rows = Math.ceil(bufs.length / cols);
  return sharp({
    create: {
      width: w * Math.min(cols, bufs.length),
      height: h * rows,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(bufs.map((input, i) => ({ input, left: (i % cols) * w, top: Math.floor(i / cols) * h })))
    .png()
    .toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;
  const dry = args.includes('--dry');

  const fair = await png(fairSvg());
  const props = await Promise.all(Array.from({ length: PROPS }, (_, v) => png(propsSvg(v))));
  const pillar = await grid(['idle', 'happy', 'dizzy'].map(pillarSvg), PILLAR.w, PILLAR.h, 3);
  const beam = await png(beamSvg());
  const pan = await png(panSvg());
  const badge = await png(badgeSvg());
  const weights = await grid(
    WEIGHT_COLOURS.map((c) => frameSvg(WEIGHT.w, WEIGHT.h, weightSvg(c))),
    WEIGHT.w,
    WEIGHT.h,
    WEIGHT.colours,
  );
  const slot = await png(slotSvg());
  const crowd = await grid(
    CROWD_ANIMALS.flatMap((a) => CROWD_POSES.map((p) => crowdFrame(a, p))),
    CROWD.w,
    CROWD.h,
    CROWD.cols,
  );
  const duck = await grid(['idle', 'hop', 'cheer'].map(duckSvg), DUCK.w, DUCK.h, 3);

  const webp = { quality: 90, alphaQuality: 100, effort: 6 };
  const files = [
    [resolve(BG_DIR, 'balance-fair.webp'), sharp(fair).webp({ quality: 88, effort: 6 })],
    [
      resolve(BG_DIR, 'balance-scale.webp'),
      sharp(fair).modulate({ brightness: MENU_BRIGHTNESS }).webp({ quality: 88, effort: 6 }),
    ],
    ...props.map((b, i) => [resolve(BG_DIR, `balance-props-${i + 1}.webp`), sharp(b).webp(webp)]),
    [resolve(HERO_DIR, 'balance-pillar.webp'), sharp(pillar).webp(webp)],
    [resolve(HERO_DIR, 'balance-beam.webp'), sharp(beam).webp(webp)],
    [resolve(HERO_DIR, 'balance-pan.webp'), sharp(pan).webp(webp)],
    [resolve(HERO_DIR, 'balance-badge.webp'), sharp(badge).webp(webp)],
    [resolve(HERO_DIR, 'balance-weights.webp'), sharp(weights).webp(webp)],
    [resolve(HERO_DIR, 'balance-slot.webp'), sharp(slot).webp(webp)],
    [resolve(HERO_DIR, 'balance-crowd.webp'), sharp(crowd).webp(webp)],
    [resolve(HERO_DIR, 'balance-duck.webp'), sharp(duck).webp(webp)],
  ];

  if (!dry) {
    const existing = files.map(([p]) => p).filter((p) => existsSync(p));
    if (existing.length && !args.includes('--force')) {
      console.error('Refusing to overwrite shipped assets (pass --force to re-render in place):');
      for (const p of existing) console.error(`  ${p}`);
      console.error('A visible change should ship under a new filename (week-long cache).');
      process.exit(1);
    }
    mkdirSync(BG_DIR, { recursive: true });
    mkdirSync(HERO_DIR, { recursive: true });
    for (const [p, img] of files) {
      await img.toFile(p);
      console.log(`wrote ${p}`);
    }
  }

  if (previewPath) {
    // A review board: the fair with a set of props, and every sheet below it.
    const sheets = [pillar, beam, pan, badge, weights, slot, crowd, duck];
    const metas = await Promise.all(sheets.map((b) => sharp(b).metadata()));
    const boardH = H + metas.reduce((sum, m) => sum + m.height + 20, 0);
    const comps = [
      { input: fair, left: 0, top: 0 },
      { input: props[1], left: 0, top: 0 },
    ];
    let y = H + 20;
    sheets.forEach((input, i) => {
      comps.push({ input, left: 10, top: y });
      y += metas[i].height + 20;
    });
    await sharp({
      create: {
        width: Math.max(W, ...metas.map((m) => m.width + 20)),
        height: boardH,
        channels: 4,
        background: '#cfe8f7',
      },
    })
      .composite(comps)
      .png()
      .toFile(previewPath);
    console.log(`wrote preview ${previewPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
