#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Puzzle pack art generator (sprint 2.14).
 *
 * Original kawaii vector art drawn in code for the seven IQ-style puzzles
 * (Pattern Train, Missing Piece, Odd One Out, Magic Wand, Spin Match, Copy
 * Cat, Symbol Hunt). This file IS the source of the art: edit and re-run,
 * never hand-edit the shipped images. More pieces than the puzzles strictly
 * need, so rounds stay varied (owner, 2026-10-26).
 *
 * Geometry the game must match is exported here and mirrored in
 * `src/core/spriteKeys.ts` / `config.puzzles` (a test checks them).
 *
 * Outputs:
 *   public/assets/sprites/hero/puzzle-tokens.webp     12 shapes × 8 colours, TOKEN px frames (row = colour)
 *   public/assets/sprites/hero/puzzle-spin.webp       16 lopsided shapes × 4 colours, TOKEN px frames (row = colour)
 *   public/assets/sprites/hero/puzzle-hats.webp       8 hats / accessories, HAT px frames
 *   public/assets/sprites/hero/puzzle-train.webp      the engine and 4 cars, TRAIN frames
 *   public/assets/sprites/hero/puzzle-wand.webp       the magic wand
 *   public/assets/sprites/hero/puzzle-icons.webp      the picker's tile pictures, ICON px, ICON_ORDER (boot-loaded)
 *   public/assets/sprites/bg/puzzle-<id>-{1,2,3}.webp each puzzle's three backdrops
 *   public/assets/sprites/bg/puzzle-<id>.webp         its darkened copy (setup, Loading)
 *
 * Usage:
 *   pnpm sprite:puzzles                       # writes the files above
 *   pnpm sprite:puzzles --preview <png> --dry # review board only, ships nothing
 *   pnpm sprite:puzzles --force               # re-render over the shipped files
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BG_DIR = resolve(ROOT, 'public/assets/sprites/bg');
const HERO_DIR = resolve(ROOT, 'public/assets/sprites/hero');
/** Menu backdrop brightness: white menu text must read on it (pastels need it low). */
export const MENU_BRIGHTNESS = 0.3;

export const W = 1280;
export const H = 720;
/** A token / spin-shape frame (square). Mirrored in spriteKeys PUZZLE_SHEETS. */
export const TOKEN = 128;
export const HAT = 96;
export const TRAIN = { w: 220, h: 180 };
export const WAND = { w: 120, h: 220 };

/** Token shapes, in sheet column order. Mirrored in config.puzzles.shapes. */
export const SHAPES = [
  'circle',
  'square',
  'triangle',
  'star',
  'heart',
  'diamond',
  'hexagon',
  'moon',
  'drop',
  'cloud',
  'flower',
  'pentagon',
];
/** Token colours, in sheet row order. Mirrored in config.puzzles.colours. */
export const COLOURS = {
  red: '#ff6b6b',
  orange: '#ffa94d',
  yellow: '#ffd43b',
  green: '#69db7c',
  teal: '#1098ad',
  blue: '#4dabf7',
  purple: '#9775fa',
  pink: '#f783ac',
};
export const SPIN_COLOURS = ['orange', 'blue', 'green', 'purple'];
export const HATS = ['party', 'bow', 'crown', 'glasses', 'cap', 'flower', 'tophat', 'headphones'];
export const PUZZLES = [
  'pattern-train',
  'missing-piece',
  'odd-one-out',
  'magic-wand',
  'spin-match',
  'copy-cat',
  'symbol-hunt',
];
export const BACKDROP_VARIANTS = 3;
/** The picker's puzzle tile pictures, one ICON-px frame each, in this order (mirrored in spriteKeys PUZZLE_ICON_SHEET). */
export const ICON = 96;
export const ICON_ORDER = ['pair-pals', ...PUZZLES];

/**
 * The 16 spin shapes as grid cells [col, row]: chiral pentominoes and
 * hexominoes (none looks the same flipped as it does turned, so "turned"
 * and "mirrored" are always different answers; a test checks it).
 */
export const SPIN_CELLS = [
  [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ], // F
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 3],
  ], // L
  [
    [1, 0],
    [1, 1],
    [0, 2],
    [1, 2],
    [0, 3],
  ], // N
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 2],
  ], // P
  [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, 2],
    [1, 3],
  ], // Y
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [1, 2],
    [2, 2],
  ], // Z
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 3],
    [2, 3],
  ], // big L
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [1, 2],
    [1, 3],
    [2, 3],
  ], // hook
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
    [2, 2],
    [2, 3],
  ], // stairs
  [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [2, 2],
    [2, 3],
  ], // twist
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ], // C-ish
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [1, 2],
    [2, 2],
  ], // boot
  [
    [1, 0],
    [1, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [2, 3],
  ], // sprout
  [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
    [2, 0],
    [3, 0],
  ], // flag
  [
    [0, 1],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 1],
    [3, 1],
  ], // zigzag
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
    [2, 1],
  ], // mitten
];

const INK = '#3a2420';
const BLUSH = '#ff8fa3';
const f = (n) => Number(n).toFixed(1);
const st = (w = 3) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/** A small kawaii face at (x, y); s = scale (1 ≈ a 70 px shape). */
function face(x, y, s = 1) {
  const dx = 9 * s;
  const eyes = [-1, 1]
    .map(
      (d) =>
        `<ellipse cx="${f(x + d * dx)}" cy="${f(y)}" rx="${f(3.6 * s)}" ry="${f(4.2 * s)}" fill="#2a1a17"/><circle cx="${f(x + d * dx - 1.3 * s)}" cy="${f(y - 1.6 * s)}" r="${f(1.4 * s)}" fill="#fff"/>`,
    )
    .join('');
  const blush = [-1, 1]
    .map(
      (d) =>
        `<ellipse cx="${f(x + d * (dx + 6 * s))}" cy="${f(y + 5 * s)}" rx="${f(3.6 * s)}" ry="${f(2.3 * s)}" fill="${BLUSH}" opacity="0.8"/>`,
    )
    .join('');
  const mouth = `<path d="M${f(x - 3 * s)},${f(y + 5 * s)} q${f(1.5 * s)},${f(2.4 * s)} ${f(3 * s)},0 q${f(1.5 * s)},${f(2.4 * s)} ${f(3 * s)},0" fill="none" ${st(1.6 * s)}/>`;
  return blush + eyes + mouth;
}

/** Points of a regular polygon (n sides, radius r, first point up). */
const poly = (n, r, start = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / n;
    return `${f(Math.cos(a) * r)},${f(Math.sin(a) * r)}`;
  }).join(' ');

/** One token: a shape with a face, centred in a TOKEN-px frame. */
function tokenSvg(shape, colour) {
  const c = COLOURS[colour];
  const r = TOKEN * 0.36;
  const S = st(4);
  let body;
  let faceY = 0;
  switch (shape) {
    case 'circle':
      body = `<circle cx="0" cy="0" r="${r}" fill="${c}" ${S}/>`;
      break;
    case 'square':
      body = `<rect x="${-r * 0.9}" y="${-r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" rx="${r * 0.22}" fill="${c}" ${S}/>`;
      break;
    case 'triangle':
      body = `<path d="M0,${-r * 1.08} L${r * 1.02},${r * 0.76} L${-r * 1.02},${r * 0.76} Z" fill="${c}" ${S}/>`;
      faceY = r * 0.22;
      break;
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r * 1.1 : r * 0.52;
        return `${f(Math.cos(a) * rr)},${f(Math.sin(a) * rr)}`;
      }).join(' ');
      body = `<polygon points="${pts}" fill="${c}" ${S}/>`;
      faceY = r * 0.08;
      break;
    }
    case 'heart':
      body = `<path d="M0,${r * 0.95} C${-r * 1.45},${-r * 0.05} ${-r * 0.8},${-r * 1.2} 0,${-r * 0.42} C${r * 0.8},${-r * 1.2} ${r * 1.45},${-r * 0.05} 0,${r * 0.95} Z" fill="${c}" ${S}/>`;
      faceY = -r * 0.05;
      break;
    case 'diamond':
      body = `<path d="M0,${-r * 1.1} L${r * 0.85},0 L0,${r * 1.1} L${-r * 0.85},0 Z" fill="${c}" ${S}/>`;
      break;
    case 'hexagon':
      body = `<polygon points="${poly(6, r * 1.02, 0)}" fill="${c}" ${S}/>`;
      break;
    case 'moon': {
      // A crescent: the big circle minus a smaller one to its right, nudged right to sit centred.
      const R2 = r * 0.8;
      const d = r * 0.55;
      const ix = (d * d + r * r - R2 * R2) / (2 * d);
      const iy = Math.sqrt(r * r - ix * ix);
      body = `<path d="M${f(ix)},${f(-iy)} A${f(r)},${f(r)} 0 1 0 ${f(ix)},${f(iy)} A${f(R2)},${f(R2)} 0 0 1 ${f(ix)},${f(-iy)} Z" fill="${c}" ${S}/>`;
      return frame(`<g transform="translate(${f(r * 0.2)},0)">${body}${face(-r * 0.5, r * 0.05, (r / 34) * 0.75)}</g>`);
    }
    case 'drop':
      body = `<path d="M0,${-r * 1.15} C${r * 0.4},${-r * 0.55} ${r * 0.95},${-r * 0.05} ${r * 0.95},${r * 0.35} A${r * 0.95},${r * 0.75} 0 0 1 ${-r * 0.95},${r * 0.35} C${-r * 0.95},${-r * 0.05} ${-r * 0.4},${-r * 0.55} 0,${-r * 1.15} Z" fill="${c}" ${S}/>`;
      faceY = r * 0.35;
      break;
    case 'cloud':
      body = `<path d="M${-r * 1.05},${r * 0.55} Q${-r * 1.35},${-r * 0.05} ${-r * 0.7},${-r * 0.2} Q${-r * 0.6},${-r * 0.95} ${r * 0.05},${-r * 0.75} Q${r * 0.6},${-r * 1.1} ${r * 0.85},${-r * 0.35} Q${r * 1.4},${-r * 0.15} ${r * 1.05},${r * 0.55} Z" fill="${c}" ${S}/>`;
      faceY = r * 0.1;
      break;
    case 'flower': {
      const petals = Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return `<circle cx="${f(Math.cos(a) * r * 0.62)}" cy="${f(Math.sin(a) * r * 0.62)}" r="${f(r * 0.48)}" fill="${c}" ${S}/>`;
      }).join('');
      body = `${petals}<circle cx="0" cy="0" r="${f(r * 0.56)}" fill="#fff3bf" ${S}/>`;
      return frame(`${body}${face(0, 0, (r / 34) * 0.62)}`);
    }
    case 'pentagon':
      body = `<polygon points="${poly(5, r * 1.06)}" fill="${c}" ${S}/>`;
      faceY = r * 0.08;
      break;
    default:
      throw new Error(`unknown shape ${shape}`);
  }
  return frame(`${body}${face(0, faceY, r / 34)}`);
}

function frame(inner, size = TOKEN) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><g transform="translate(${size / 2},${size / 2})">${inner}</g></svg>`;
}

/** A spin shape: grid cells joined into one outlined block with a face, centred. */
function spinSvg(cells, colour) {
  const c = COLOURS[colour];
  const cols = Math.max(...cells.map(([x]) => x)) + 1;
  const rows = Math.max(...cells.map(([, y]) => y)) + 1;
  const u = Math.floor((TOKEN * 0.78) / Math.max(cols, rows));
  const ox = -(cols * u) / 2;
  const oy = -(rows * u) / 2;
  const ink = cells
    .map(
      ([x, y]) =>
        `<rect x="${ox + x * u - 3}" y="${oy + y * u - 3}" width="${u + 6}" height="${u + 6}" rx="7" fill="${INK}"/>`,
    )
    .join('');
  const fill = cells
    .map(
      ([x, y]) =>
        `<rect x="${ox + x * u - 0.5}" y="${oy + y * u - 0.5}" width="${u + 1}" height="${u + 1}" fill="${c}"/>`,
    )
    .join('');
  // The face sits on the cell nearest the middle of the shape.
  const mx = cells.reduce((s, [x]) => s + x, 0) / cells.length;
  const my = cells.reduce((s, [, y]) => s + y, 0) / cells.length;
  const [fx, fy] = cells.reduce((best, cell) => {
    const d = (cell[0] - mx) ** 2 + (cell[1] - my) ** 2;
    const db = (best[0] - mx) ** 2 + (best[1] - my) ** 2;
    return d < db ? cell : best;
  });
  const shine = cells
    .map(
      ([x, y]) =>
        `<rect x="${ox + x * u + u * 0.18}" y="${oy + y * u + u * 0.14}" width="${u * 0.22}" height="${u * 0.12}" rx="${u * 0.06}" fill="#fff" opacity="0.45"/>`,
    )
    .join('');
  return frame(`${ink}${fill}${shine}${face(ox + fx * u + u / 2, oy + fy * u + u / 2, u / 30)}`);
}

/** Hats and accessories, each in a HAT-px frame (anchored at the frame's bottom middle; glasses at its centre). */
function hatSvg(kind) {
  let g;
  switch (kind) {
    case 'party':
      g = `<path d="M0,-38 L22,30 L-22,30 Z" fill="#9775fa" ${st()}/><path d="M-12,0 L8,-6 M-16,14 L14,6" stroke="#ffd43b" stroke-width="5" stroke-linecap="round"/><circle cx="0" cy="-40" r="8" fill="#ff6b6b" ${st(2.5)}/>`;
      break;
    case 'bow':
      g = `<path d="M0,10 L-34,-12 L-30,28 Z M0,10 L34,-12 L30,28 Z" fill="#f783ac" ${st()}/><circle cx="0" cy="10" r="9" fill="#ff8fa3" ${st(2.5)}/>`;
      break;
    case 'crown':
      g = `<path d="M-32,30 L-36,-14 L-16,6 L0,-24 L16,6 L36,-14 L32,30 Z" fill="#ffd43b" ${st()}/><circle cx="0" cy="12" r="5" fill="#ff6b6b"/><circle cx="-18" cy="16" r="4" fill="#4dabf7"/><circle cx="18" cy="16" r="4" fill="#69db7c"/>`;
      break;
    case 'glasses':
      g = `<circle cx="-18" cy="0" r="14" fill="#fff" fill-opacity="0.35" ${st(4)}/><circle cx="18" cy="0" r="14" fill="#fff" fill-opacity="0.35" ${st(4)}/><path d="M-4,0 L4,0 M-32,-2 L-42,-8 M32,-2 L42,-8" ${st(4)}/>`;
      break;
    case 'cap':
      g = `<path d="M-30,24 Q-30,-14 0,-16 Q30,-14 30,24 Z" fill="#4dabf7" ${st()}/><path d="M18,22 L46,26 Q40,34 14,32 Z" fill="#339af0" ${st()}/><circle cx="0" cy="-16" r="5" fill="#fff" ${st(2)}/>`;
      break;
    case 'flower':
      g =
        Array.from({ length: 5 }, (_, i) => {
          const a = (i * 2 * Math.PI) / 5;
          return `<circle cx="${f(Math.cos(a) * 14)}" cy="${f(Math.sin(a) * 14 + 8)}" r="11" fill="#fff" ${st(2.5)}/>`;
        }).join('') + `<circle cx="0" cy="8" r="9" fill="#ffd43b" ${st(2.5)}/>`;
      break;
    case 'tophat':
      g = `<rect x="-20" y="-30" width="40" height="52" rx="4" fill="#495057" ${st()}/><rect x="-34" y="20" width="68" height="12" rx="6" fill="#495057" ${st()}/><rect x="-20" y="6" width="40" height="9" fill="#ff6b6b"/>`;
      break;
    case 'headphones':
      g = `<path d="M-30,24 Q-34,-26 0,-28 Q34,-26 30,24" fill="none" ${st(6)}/><rect x="-42" y="8" width="18" height="28" rx="8" fill="#38d9a9" ${st()}/><rect x="24" y="8" width="18" height="28" rx="8" fill="#38d9a9" ${st()}/>`;
      break;
    default:
      throw new Error(`unknown hat ${kind}`);
  }
  return frame(g, HAT);
}

/** The train: frame 0 the engine, frames 1–4 cars (yellow, blue, pink, green); the token sits in the car's window. */
function trainSvg(i) {
  const { w, h } = TRAIN;
  const wheels = (xs) =>
    xs
      .map(
        (x) =>
          `<circle cx="${x}" cy="${h - 24}" r="20" fill="#5a4a4a" ${st()}/><circle cx="${x}" cy="${h - 24}" r="7" fill="#cfd3dc"/>`,
      )
      .join('');
  let g;
  if (i === 0) {
    g = `<rect x="30" y="${h - 150}" width="120" height="110" rx="18" fill="#ff6b6b" ${st()}/><rect x="50" y="${h - 176}" width="64" height="44" rx="10" fill="#f783ac" ${st()}/>
      <rect x="146" y="${h - 96}" width="46" height="56" rx="10" fill="#ff6b6b" ${st()}/><rect x="56" y="${h - 196}" width="22" height="30" rx="6" fill="#5a4a4a" ${st()}/>
      <path d="M190,${h - 44} L214,${h - 30} L190,${h - 30} Z" fill="#ffd43b" ${st(2.5)}/>${wheels([70, 130])}${face(90, h - 100, 1.5)}`;
  } else {
    const c = ['#ffd43b', '#74c0fc', '#faa2c1', '#8ce99a'][i - 1];
    g = `<rect x="14" y="${h - 146}" width="${w - 28}" height="108" rx="18" fill="${c}" ${st()}/><rect x="34" y="${h - 132}" width="${w - 68}" height="80" rx="12" fill="#fffaf0" ${st(2.5)}/>
      <rect x="2" y="${h - 62}" width="14" height="10" rx="3" fill="#5a4a4a"/><rect x="${w - 16}" y="${h - 62}" width="14" height="10" rx="3" fill="#5a4a4a"/>${wheels([56, w - 56])}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${g}</svg>`;
}

function wandSvg() {
  const { w, h } = WAND;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? 38 : 18;
    return `${f(w / 2 + Math.cos(a) * rr)},${f(48 + Math.sin(a) * rr)}`;
  }).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${w / 2 - 8}" y="70" width="16" height="${h - 80}" rx="8" fill="#5a4a4a" ${st()}/><rect x="${w / 2 - 8}" y="${h - 40}" width="16" height="22" rx="6" fill="#fff" ${st(2)}/>
    <polygon points="${pts}" fill="#ffd43b" ${st(4)}/>${face(w / 2, 52, 0.9)}<path d="M18,30 l4,-10 l4,10 l10,4 l-10,4 l-4,10 l-4,-10 l-10,-4 Z M${w - 22},84 l3,-7 l3,7 l7,3 l-7,3 l-3,7 l-3,-7 l-7,-3 Z" fill="#fff" ${st(2)}/></svg>`;
}

// ---------------------------------------------------------------- backdrops

/** Each puzzle's two gradient colours and its accent colours for the texture. */
export const PUZZLE_COLOURS = {
  'pattern-train': { bg: ['#dff1ff', '#fff4d6'], accents: ['#74c0fc', '#ffd43b', '#ff8787', '#8ce99a'] },
  'missing-piece': { bg: ['#ffe8f1', '#e3fbec'], accents: ['#faa2c1', '#8ce99a', '#74c0fc', '#ffd43b'] },
  'odd-one-out': { bg: ['#fff6cf', '#efe7ff'], accents: ['#ffd43b', '#b197fc', '#ff8787', '#63e6be'] },
  'magic-wand': { bg: ['#eee6ff', '#dff4ff'], accents: ['#b197fc', '#74c0fc', '#ffd43b', '#faa2c1'] },
  'spin-match': { bg: ['#ffeedd', '#e3fbec'], accents: ['#ffa94d', '#63e6be', '#74c0fc', '#faa2c1'] },
  'copy-cat': { bg: ['#e3fbec', '#ffe8f1'], accents: ['#8ce99a', '#faa2c1', '#ffd43b', '#74c0fc'] },
  'symbol-hunt': { bg: ['#fff4d6', '#dff1ff'], accents: ['#ffa94d', '#74c0fc', '#f783ac', '#69db7c'] },
};

/** A seeded little random so a backdrop renders the same every run. */
function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** True inside the calm middle where the puzzle sits (texture thins out there). */
const inMiddle = (x, y) => x > 300 && x < 980 && y > 130 && y < 590;

/**
 * A puzzle backdrop: a soft gradient, big soft bubbles, and texture — dots,
 * sparkles and outlined shapes — mostly at the edges so the puzzle in the
 * middle stays calm. Variant 0: bubbles + confetti; 1: rolling hills +
 * sparkles; 2: floating outlined shapes + dots.
 */
function backdropSvg(id, variant) {
  const { bg, accents } = PUZZLE_COLOURS[id];
  const R = rand(PUZZLES.indexOf(id) * 97 + variant * 13 + 5);
  const pick = () => accents[Math.floor(R() * accents.length)];
  let layers = '';
  // Big soft bubbles everywhere.
  for (let i = 0; i < 14; i++) {
    layers += `<circle cx="${f(R() * W)}" cy="${f(R() * H)}" r="${f(30 + R() * 80)}" fill="#fff" opacity="${f(0.12 + R() * 0.12)}"/>`;
  }
  if (variant === 1) {
    // Rolling hills along the bottom.
    layers += `<path d="M0,${H - 90} Q200,${H - 150} 420,${H - 100} T860,${H - 110} T1280,${H - 120} L1280,${H} L0,${H} Z" fill="${accents[2]}" opacity="0.22"/>
      <path d="M0,${H - 50} Q260,${H - 110} 560,${H - 60} T1280,${H - 70} L1280,${H} L0,${H} Z" fill="${accents[3]}" opacity="0.25"/>`;
  }
  // The noise: many small dots, denser at the edges.
  for (let i = 0; i < 260; i++) {
    const x = R() * W;
    const y = R() * H;
    if (inMiddle(x, y) && R() < 0.75) continue;
    layers += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.5 + R() * 3.5)}" fill="${pick()}" opacity="${f(0.25 + R() * 0.3)}"/>`;
  }
  if (variant === 0) {
    // Confetti strips.
    for (let i = 0; i < 46; i++) {
      const x = R() * W;
      const y = R() * H;
      if (inMiddle(x, y)) continue;
      layers += `<rect x="${f(x)}" y="${f(y)}" width="${f(5 + R() * 6)}" height="${f(12 + R() * 8)}" rx="2" fill="${pick()}" opacity="0.45" transform="rotate(${f(R() * 180)} ${f(x)} ${f(y)})"/>`;
    }
  }
  if (variant === 1 || variant === 0) {
    // Twinkles.
    for (let i = 0; i < 24; i++) {
      const x = R() * W;
      const y = R() * (H - 140);
      if (inMiddle(x, y)) continue;
      const s = 5 + R() * 7;
      layers += `<path d="M${f(x)},${f(y - s)} Q${f(x + s * 0.18)},${f(y - s * 0.18)} ${f(x + s)},${f(y)} Q${f(x + s * 0.18)},${f(y + s * 0.18)} ${f(x)},${f(y + s)} Q${f(x - s * 0.18)},${f(y + s * 0.18)} ${f(x - s)},${f(y)} Q${f(x - s * 0.18)},${f(y - s * 0.18)} ${f(x)},${f(y - s)} Z" fill="#fff" opacity="0.8"/>`;
    }
  }
  if (variant === 2) {
    // Floating outlined shapes.
    for (let i = 0; i < 26; i++) {
      const x = R() * W;
      const y = R() * H;
      if (inMiddle(x, y)) continue;
      const s = 10 + R() * 14;
      const c = pick();
      const kind = Math.floor(R() * 4);
      const shape =
        kind === 0
          ? `<circle cx="0" cy="0" r="${f(s)}"/>`
          : kind === 1
            ? `<rect x="${f(-s)}" y="${f(-s)}" width="${f(s * 2)}" height="${f(s * 2)}" rx="${f(s * 0.3)}"/>`
            : kind === 2
              ? `<path d="M0,${f(-s)} L${f(s)},${f(s * 0.8)} L${f(-s)},${f(s * 0.8)} Z"/>`
              : `<polygon points="${poly(5, s)}"/>`;
      layers += `<g transform="translate(${f(x)},${f(y)}) rotate(${f(R() * 90)})" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round" opacity="0.55">${shape}</g>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>${layers}</svg>`;
}

// ---------------------------------------------------------------- tile pictures

const PAIR_PALS_ANIMALS = resolve(ROOT, 'public/assets/sprites/hero/pairpals-pics-animals.webp');
const PAIR_PALS_CARDS = resolve(ROOT, 'public/assets/sprites/hero/pairpals-cards.webp');

/** A frame cut from a shipped sheet, scaled to `size`. */
async function cut(file, frame, cols, frameSize, size) {
  return sharp(file)
    .extract({
      left: (frame % cols) * frameSize,
      top: Math.floor(frame / cols) * frameSize,
      width: frameSize,
      height: frameSize,
    })
    .resize(size, size)
    .png()
    .toBuffer();
}

/** One tile picture: an SVG drawn at ICON px, plus any pieces composited on top. */
async function icon(svgInner, layers = []) {
  const base = await png(`<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}">${svgInner}</svg>`);
  return layers.length ? sharp(base).composite(layers).png().toBuffer() : base;
}

/** A token drawn small, as an SVG group at (x, y) of size px. */
const mini = (svg, x, y, px) =>
  `<g transform="translate(${f(x - px / 2)},${f(y - px / 2)}) scale(${f(px / TOKEN)})">${svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`;

async function iconsSheet() {
  const frames = [];
  // Pair Pals: a face-down card and a card showing the cat, fanned.
  const back = await cut(PAIR_PALS_CARDS, 0, 6, 200, 56);
  const faceCard = await cut(PAIR_PALS_CARDS, 5, 6, 200, 56);
  const cat = await cut(PAIR_PALS_ANIMALS, 0, 5, 200, 46);
  const tiltedBack = await sharp(back)
    .rotate(-12, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  frames.push(
    await icon('', [
      { input: tiltedBack, left: 4, top: 14 },
      { input: faceCard, left: 34, top: 22 },
      { input: cat, left: 39, top: 27 },
    ]),
  );
  // Pattern Train: the engine and a car.
  const train = await sharp(Buffer.from(trainSvg(0)))
    .resize(70)
    .png()
    .toBuffer();
  frames.push(await icon('', [{ input: train, left: 13, top: 22 }]));
  // Missing Piece: a little window with a "?" pane.
  const panes = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const x = 22 + c * 26;
      const y = 22 + r * 26;
      panes.push(
        r === 2 && c === 2
          ? `<rect x="${x - 11}" y="${y - 11}" width="22" height="22" rx="4" fill="#fff" stroke="#7a849c" stroke-width="2" stroke-dasharray="4 3"/><text x="${x}" y="${y + 6}" text-anchor="middle" font-family="Segoe UI" font-weight="800" font-size="16" fill="#7a849c">?</text>`
          : mini(tokenSvg(SHAPES[[0, 1, 2][r]], Object.keys(COLOURS)[[5, 7, 3][c]]), x, y, 26),
      );
    }
  frames.push(
    await icon(
      `<rect x="4" y="4" width="88" height="88" rx="12" fill="#a86a3c" ${st(3)}/><rect x="10" y="10" width="76" height="76" rx="8" fill="#fdf2dc"/>${panes.join('')}`,
    ),
  );
  // Odd One Out: three stars and a circle.
  frames.push(
    await icon(
      mini(tokenSvg('star', 'yellow'), 28, 28, 46) +
        mini(tokenSvg('star', 'pink'), 68, 28, 46) +
        mini(tokenSvg('star', 'green'), 28, 68, 46) +
        mini(tokenSvg('circle', 'blue'), 68, 68, 46) +
        `<circle cx="68" cy="68" r="21" fill="none" stroke="#facc15" stroke-width="4"/>`,
    ),
  );
  // Magic Wand: the wand.
  const wand = await sharp(Buffer.from(wandSvg())).resize(null, 86).png().toBuffer();
  frames.push(await icon('', [{ input: wand, left: 25, top: 5 }]));
  // Spin Match: a lopsided shape and a turning arrow.
  frames.push(
    await icon(
      mini(spinSvg(SPIN_CELLS[1], 'orange'), 44, 50, 74) +
        `<path d="M70,18 A34,34 0 0 1 86,52" fill="none" stroke="#7a849c" stroke-width="5" stroke-linecap="round"/><path d="M80,48 L87,60 L93,47 Z" fill="#7a849c"/>`,
    ),
  );
  // Copy Cat: the chick with a music note.
  const chick = await cut(PAIR_PALS_ANIMALS, 5, 5, 200, 74);
  frames.push(
    await icon(
      `<path d="M74,8 L74,30 M74,8 L88,4 L88,24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><ellipse cx="70" cy="31" rx="6" ry="5" fill="#fff"/><ellipse cx="84" cy="26" rx="6" ry="5" fill="#fff"/>`,
      [{ input: chick, left: 4, top: 18 }],
    ),
  );
  // Symbol Hunt: a heart under a magnifying glass.
  frames.push(
    await icon(
      mini(tokenSvg('heart', 'red'), 42, 42, 60) +
        `<circle cx="42" cy="42" r="30" fill="#fff" fill-opacity="0.25" ${st(5)}/><path d="M64,64 L86,86" ${st(10)}/><path d="M64,64 L86,86" stroke="#c98b5a" stroke-width="5" stroke-linecap="round"/>`,
    ),
  );
  if (frames.length !== ICON_ORDER.length) throw new Error(`icons: ${frames.length}`);
  return sharp({
    create: { width: ICON * frames.length, height: ICON, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(frames.map((input, i) => ({ input, left: i * ICON, top: 0 })))
    .png()
    .toBuffer();
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

  const tokens = await grid(
    Object.keys(COLOURS).flatMap((c) => SHAPES.map((s) => tokenSvg(s, c))),
    TOKEN,
    TOKEN,
    SHAPES.length,
  );
  const spin = await grid(
    SPIN_COLOURS.flatMap((c) => SPIN_CELLS.map((cells) => spinSvg(cells, c))),
    TOKEN,
    TOKEN,
    SPIN_CELLS.length,
  );
  const hats = await grid(HATS.map(hatSvg), HAT, HAT, HATS.length);
  const train = await grid([0, 1, 2, 3, 4].map(trainSvg), TRAIN.w, TRAIN.h, 5);
  const wand = await png(wandSvg());
  const icons = await iconsSheet();
  const backdrops = {};
  for (const id of PUZZLES) {
    backdrops[id] = await Promise.all(Array.from({ length: BACKDROP_VARIANTS }, (_, v) => png(backdropSvg(id, v))));
  }

  const webp = { quality: 90, alphaQuality: 100, effort: 6 };
  const files = [
    [resolve(HERO_DIR, 'puzzle-tokens.webp'), sharp(tokens).webp(webp)],
    [resolve(HERO_DIR, 'puzzle-spin.webp'), sharp(spin).webp(webp)],
    [resolve(HERO_DIR, 'puzzle-hats.webp'), sharp(hats).webp(webp)],
    [resolve(HERO_DIR, 'puzzle-train.webp'), sharp(train).webp(webp)],
    [resolve(HERO_DIR, 'puzzle-wand.webp'), sharp(wand).webp(webp)],
    [resolve(HERO_DIR, 'puzzle-icons.webp'), sharp(icons).webp(webp)],
    ...PUZZLES.flatMap((id) => [
      ...backdrops[id].map((b, v) => [
        resolve(BG_DIR, `puzzle-${id}-${v + 1}.webp`),
        sharp(b).webp({ quality: 84, effort: 6 }),
      ]),
      [
        resolve(BG_DIR, `puzzle-${id}.webp`),
        sharp(backdrops[id][0]).modulate({ brightness: MENU_BRIGHTNESS }).webp({ quality: 84, effort: 6 }),
      ],
    ]),
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
    const sheets = [tokens, spin, hats, train, wand, icons];
    const metas = await Promise.all(sheets.map((b) => sharp(b).metadata()));
    const thumbs = await Promise.all(
      PUZZLES.flatMap((id) => backdrops[id].map((b) => sharp(b).resize(320, 180).png().toBuffer())),
    );
    const sheetW = Math.max(...metas.map((m) => m.width));
    let y = 10;
    const comps = [];
    sheets.forEach((input, i) => {
      comps.push({ input, left: 10, top: y });
      y += metas[i].height + 16;
    });
    thumbs.forEach((input, i) => comps.push({ input, left: 10 + (i % 6) * 330, top: y + Math.floor(i / 6) * 190 }));
    y += Math.ceil(thumbs.length / 6) * 190;
    await sharp({
      create: { width: Math.max(sheetW + 20, 6 * 330 + 10), height: y + 10, channels: 4, background: '#e9e4f5' },
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
