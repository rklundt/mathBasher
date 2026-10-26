#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Pair Pals art generator (sprint 2.13).
 *
 * Two kinds of card pictures:
 *  - **Cute animals and desserts**: original kawaii vector art drawn in code
 *    here, from the owner-approved proofs (each picture its own colour and
 *    shape, so pairs are easy to tell apart). This file IS the source of
 *    that art: edit and re-run, never hand-edit the shipped images.
 *  - **Dinosaurs, aliens and dragons**: the owner's Midjourney art, one
 *    cut-out per creature (20 each, picked by the owner), kept in the
 *    ignored `.sprite-source/pair-pals/<theme>/01.png … 20.png`. This script
 *    only fits them to the frames and packs them.
 *
 * Also drawn here: the five card backs and the blank card face, and a soft
 * backdrop per theme plus a darkened copy for the setup screen.
 *
 * Outputs:
 *   public/assets/sprites/hero/pairpals-pics-<theme>.webp  20 pictures, 5 × 4 frames of PICTURE px
 *   public/assets/sprites/hero/pairpals-cards.webp    5 card backs (theme order) + the blank face
 *   public/assets/sprites/bg/pairpals-bg-<theme>.webp    each theme's backdrop (the board)
 *   public/assets/sprites/bg/pair-pals.webp           darkened backdrop (setup screen)
 *
 * Usage:
 *   pnpm sprite:pairpals                       # writes the files above
 *   pnpm sprite:pairpals --preview <png> --dry # review board only, ships nothing
 *   pnpm sprite:pairpals --force               # re-render over the shipped files
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BG_DIR = resolve(ROOT, 'public/assets/sprites/bg');
const HERO_DIR = resolve(ROOT, 'public/assets/sprites/hero');
const SOURCE_DIR = resolve(ROOT, '.sprite-source/pair-pals');
/** Menu backdrop brightness: white menu text must read on it (the pastels need more than the games' 0.45). */
export const MENU_BRIGHTNESS = 0.3;

export const W = 1280;
export const H = 720;
/** One picture frame (square); 20 per sheet in 5 columns. Mirrored in spriteKeys PAIR_PALS_SHEETS. */
export const PICTURE = 200;
export const PICTURES_PER_THEME = 20;
export const PICTURE_COLS = 5;
/** One card frame (square): five backs in theme order, then the blank face. */
export const CARD = 200;
/** Theme order (the setup screen's order; the card backs follow it). */
export const THEMES = ['animals', 'desserts', 'dinosaurs', 'dragons', 'aliens'];
/** The Midjourney themes (cut-outs from `.sprite-source/pair-pals/<theme>/`). */
export const PHOTO_THEMES = ['dinosaurs', 'dragons', 'aliens'];

const INK = '#3a2420';
const BLUSH = '#ff8fa3';
const f = (n) => Number(n).toFixed(1);
const st = (w = 3) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/** Each theme's card-back colour, and its backdrop's two gradient colours and motif colour. */
export const THEME_COLOURS = {
  animals: { back: '#ff9eb5', bg: ['#ffe4ee', '#fff4d9'], motif: '#ff9eb5' },
  desserts: { back: '#ffc94d', bg: ['#fff3c9', '#ffe1ec'], motif: '#ffb3c7' },
  dinosaurs: { back: '#6fcf7f', bg: ['#e4f7da', '#fff6d6'], motif: '#8fd18f' },
  dragons: { back: '#ff7a6b', bg: ['#ffe2d6', '#ffeec2'], motif: '#ffa77a' },
  aliens: { back: '#a993ff', bg: ['#e6e0ff', '#dff4ff'], motif: '#b6a4ff' },
};

// ---------------------------------------------------------------- faces

/** A kawaii face centred at (x, y); s = size scale; eye gap dx. */
function face(x, y, s = 1, opts = {}) {
  const dx = (opts.dx ?? 16) * s;
  const r = 6.5 * s;
  const eyes = [-1, 1]
    .map(
      (d) =>
        `<ellipse cx="${f(x + d * dx)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 1.15)}" fill="#2a1a17"/><circle cx="${f(x + d * dx - 2.4 * s)}" cy="${f(y - 3 * s)}" r="${f(2.6 * s)}" fill="#fff"/>`,
    )
    .join('');
  const blush = opts.noBlush
    ? ''
    : [-1, 1]
        .map(
          (d) =>
            `<ellipse cx="${f(x + d * (dx + 11 * s))}" cy="${f(y + 9 * s)}" rx="${f(7 * s)}" ry="${f(4.5 * s)}" fill="${BLUSH}" opacity="0.8"/>`,
        )
        .join('');
  const my = y + (opts.mouthDy ?? 9) * s;
  const mouth = `<path d="M${f(x - 5 * s)},${f(my)} q${f(2.5 * s)},${f(4 * s)} ${f(5 * s)},0 q${f(2.5 * s)},${f(4 * s)} ${f(5 * s)},0" fill="none" ${st(2.6 * s)}/>`;
  return blush + eyes + (opts.noMouth ? '' : mouth);
}

const blushAt = (x, y, s = 1) =>
  `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(7 * s)}" ry="${f(4.5 * s)}" fill="${BLUSH}" opacity="0.8"/>`;

/** A white-and-dark round eye (for faces drawn by hand). */
const eye = (x, y, r) =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#2a1a17"/><circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.4)}" r="${f(r * 0.38)}" fill="#fff"/>`;

// ------------------------------------------------------------ cute animals
// Every picture is drawn in a 100 × 100 box.

const ANIMALS = {
  cat: () => `<path d="M22,40 L26,12 L42,30 Z M78,40 L74,12 L58,30 Z" fill="#ffb15c" ${st()}/><path d="M28,36 L30,20 L38,30 Z M72,36 L70,20 L62,30 Z" fill="#ffe0bd"/>
    <ellipse cx="50" cy="55" rx="36" ry="31" fill="#ffb15c" ${st()}/><path d="M42,26 l0,10 M50,24 l0,12 M58,26 l0,10" stroke="#e8903c" stroke-width="4" stroke-linecap="round"/>${face(50, 54)}<path d="M47,60 L53,60 L50,64 Z" fill="#d9536c"/>`,
  dog: () => `<ellipse cx="18" cy="48" rx="12" ry="22" fill="#a86a3c" ${st()} transform="rotate(15 18 48)"/><ellipse cx="82" cy="48" rx="12" ry="22" fill="#a86a3c" ${st()} transform="rotate(-15 82 48)"/>
    <ellipse cx="50" cy="54" rx="34" ry="32" fill="#e7c08f" ${st()}/><ellipse cx="50" cy="66" rx="14" ry="10" fill="#fff5e6" ${st(2.5)}/><ellipse cx="50" cy="60" rx="6" ry="4.5" fill="${INK}"/>${face(50, 48, 1, { noMouth: true })}<path d="M45,68 q5,5 10,0" fill="none" ${st(2.5)}/>`,
  bunny:
    () => `<ellipse cx="36" cy="22" rx="10" ry="24" fill="#fdf9f4" ${st()}/><ellipse cx="64" cy="22" rx="10" ry="24" fill="#fdf9f4" ${st()}/><ellipse cx="36" cy="24" rx="5" ry="16" fill="#f7b6c3"/><ellipse cx="64" cy="24" rx="5" ry="16" fill="#f7b6c3"/>
    <ellipse cx="50" cy="60" rx="34" ry="28" fill="#fdf9f4" ${st()}/>${face(50, 58)}`,
  bear: () => `<circle cx="22" cy="30" r="12" fill="#c98b5a" ${st()}/><circle cx="78" cy="30" r="12" fill="#c98b5a" ${st()}/><circle cx="22" cy="30" r="5" fill="#f2c9a0"/><circle cx="78" cy="30" r="5" fill="#f2c9a0"/>
    <ellipse cx="50" cy="55" rx="35" ry="32" fill="#c98b5a" ${st()}/><ellipse cx="50" cy="65" rx="13" ry="9" fill="#f2c9a0" ${st(2.5)}/><ellipse cx="50" cy="61" rx="5" ry="3.5" fill="${INK}"/>${face(50, 50, 1, { noMouth: true })}`,
  panda:
    () => `<circle cx="22" cy="28" r="12" fill="#2f2a2a" ${st()}/><circle cx="78" cy="28" r="12" fill="#2f2a2a" ${st()}/>
    <ellipse cx="50" cy="55" rx="35" ry="32" fill="#fdf9f4" ${st()}/><ellipse cx="36" cy="52" rx="10" ry="12" fill="#2f2a2a" transform="rotate(20 36 52)"/><ellipse cx="64" cy="52" rx="10" ry="12" fill="#2f2a2a" transform="rotate(-20 64 52)"/>
    <circle cx="36" cy="52" r="4.5" fill="#fff"/><circle cx="64" cy="52" r="4.5" fill="#fff"/><ellipse cx="50" cy="64" rx="5" ry="3.5" fill="${INK}"/><path d="M45,69 q5,4 10,0" fill="none" ${st(2.5)}/>${blushAt(25, 64)}${blushAt(75, 64)}`,
  chick:
    () => `<ellipse cx="50" cy="56" rx="34" ry="32" fill="#ffe066" ${st()}/><path d="M44,24 q6,-14 12,-2 q6,-10 8,4" fill="none" ${st()}/>
    <ellipse cx="18" cy="60" rx="9" ry="13" fill="#ffd23f" ${st()}/><ellipse cx="82" cy="60" rx="9" ry="13" fill="#ffd23f" ${st()}/>${face(50, 50, 1, { noMouth: true })}<path d="M42,60 L58,60 L50,70 Z" fill="#ff9a3c" ${st(2.5)}/>`,
  pig: () => `<path d="M20,36 L24,12 L42,28 Z M80,36 L76,12 L58,28 Z" fill="#ff9fba" ${st()}/>
    <ellipse cx="50" cy="56" rx="36" ry="31" fill="#ffc2d4" ${st()}/>
    <ellipse cx="50" cy="66" rx="14" ry="10" fill="#ff9fba" ${st(2.5)}/><ellipse cx="45" cy="66" rx="2.6" ry="3.6" fill="${INK}"/><ellipse cx="55" cy="66" rx="2.6" ry="3.6" fill="${INK}"/>
    ${face(50, 46, 1, { noMouth: true, dx: 18 })}`,
  frog: () => `<circle cx="29" cy="32" r="16" fill="#8fd16c" ${st()}/><circle cx="71" cy="32" r="16" fill="#8fd16c" ${st()}/>
    <ellipse cx="50" cy="62" rx="40" ry="27" fill="#8fd16c" ${st()}/><path d="M16,52 Q50,40 84,52" fill="#8fd16c"/>
    <circle cx="29" cy="32" r="10" fill="#fff" ${st(2)}/><circle cx="71" cy="32" r="10" fill="#fff" ${st(2)}/>${eye(30, 33, 5.5)}${eye(70, 33, 5.5)}
    <path d="M34,64 Q50,78 66,64" fill="none" ${st(3)}/>${blushAt(22, 62)}${blushAt(78, 62)}`,
  fox: () => `<path d="M14,44 L20,8 L44,28 Z M86,44 L80,8 L56,28 Z" fill="#ef6a3a" ${st()}/><path d="M22,32 L24,18 L34,28 Z M78,32 L76,18 L66,28 Z" fill="#5a2a1a"/>
    <path d="M10,48 Q12,24 50,22 Q88,24 90,48 Q86,70 50,90 Q14,70 10,48 Z" fill="#ef6a3a"/>
    <path d="M18,54 Q36,56 50,72 Q64,56 82,54 Q76,74 50,90 Q24,74 18,54 Z" fill="#fff6ea"/>
    <path d="M10,48 Q12,24 50,22 Q88,24 90,48 Q86,70 50,90 Q14,70 10,48 Z" fill="none" ${st()}/>
    <ellipse cx="50" cy="78" rx="5" ry="3.6" fill="${INK}"/>${face(50, 50, 0.95, { noMouth: true, dx: 15 })}`,
  lion: () => {
    const mane = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<circle cx="${f(50 + Math.cos(a) * 33)}" cy="${f(52 + Math.sin(a) * 33)}" r="13" fill="#d9822b" ${st(2.5)}/>`;
    }).join('');
    return `${mane}<circle cx="50" cy="52" r="34" fill="#d9822b"/>
    <circle cx="31" cy="32" r="7" fill="#f7c95c" ${st(2.5)}/><circle cx="69" cy="32" r="7" fill="#f7c95c" ${st(2.5)}/>
    <circle cx="50" cy="54" r="27" fill="#f7c95c" ${st()}/><ellipse cx="50" cy="66" rx="11" ry="8" fill="#fff3d6"/>
    <path d="M45.5,61 L54.5,61 L50,66 Z" fill="${INK}"/><path d="M46,70 q4,3 8,0" fill="none" ${st(2.2)}/>${face(50, 50, 0.85, { noMouth: true, dx: 14 })}`;
  },
  mouse:
    () => `<circle cx="22" cy="32" r="18" fill="#cfd3dc" ${st()}/><circle cx="78" cy="32" r="18" fill="#cfd3dc" ${st()}/><circle cx="22" cy="32" r="10" fill="#f7b6c3"/><circle cx="78" cy="32" r="10" fill="#f7b6c3"/>
    <ellipse cx="50" cy="60" rx="30" ry="28" fill="#cfd3dc" ${st()}/>
    <path d="M30,68 l-15,-3 M30,73 l-15,3 M70,68 l15,-3 M70,73 l15,3" ${st(2)}/><circle cx="50" cy="69" r="4.5" fill="#ff8fa3" ${st(2)}/>${face(50, 57, 0.9, { noMouth: true, dx: 14 })}`,
  owl: () => `<path d="M22,32 L24,8 L42,24 Z M78,32 L76,8 L58,24 Z" fill="#8f6fc9" ${st()}/>
    <ellipse cx="50" cy="56" rx="34" ry="36" fill="#a585dc" ${st()}/>
    <ellipse cx="50" cy="72" rx="20" ry="16" fill="#e6dbff"/><path d="M41,68 q3,3 6,0 M53,68 q3,3 6,0 M47,77 q3,3 6,0" fill="none" stroke="#a585dc" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="36" cy="45" r="13" fill="#fff" ${st(2.5)}/><circle cx="64" cy="45" r="13" fill="#fff" ${st(2.5)}/>${eye(37, 46, 7)}${eye(63, 46, 7)}
    <path d="M45,55 L55,55 L50,63 Z" fill="#ffb15c" ${st(2.5)}/>${blushAt(22, 62)}${blushAt(78, 62)}`,
  penguin:
    () => `<ellipse cx="14" cy="64" rx="7" ry="15" fill="#3b4a6b" ${st()} transform="rotate(20 14 64)"/><ellipse cx="86" cy="64" rx="7" ry="15" fill="#3b4a6b" ${st()} transform="rotate(-20 86 64)"/>
    <ellipse cx="50" cy="55" rx="34" ry="37" fill="#3b4a6b" ${st()}/>
    <path d="M50,38 Q60,24 72,32 Q84,46 76,66 Q68,86 50,88 Q32,86 24,66 Q16,46 28,32 Q40,24 50,38 Z" fill="#fdf9f4"/>
    ${face(50, 53, 0.95, { noMouth: true, dx: 14 })}<path d="M43,61 L57,61 L50,69 Z" fill="#ff9a3c" ${st(2.5)}/>`,
  cow: () => `<path d="M32,24 q-3,-12 -11,-12 M68,24 q3,-12 11,-12" fill="none" stroke="#e8c27a" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="14" cy="42" rx="13" ry="7" fill="#fdf9f4" ${st()} transform="rotate(-20 14 42)"/><ellipse cx="86" cy="42" rx="13" ry="7" fill="#fdf9f4" ${st()} transform="rotate(20 86 42)"/>
    <ellipse cx="50" cy="50" rx="32" ry="31" fill="#fdf9f4" ${st()}/>
    <path d="M27,30 q10,-7 15,3 q-2,11 -12,9 q-7,-4 -3,-12 Z" fill="#2f2a2a"/><path d="M66,40 q10,-4 12,6 q-4,8 -12,4 Z" fill="#2f2a2a"/>
    <ellipse cx="50" cy="72" rx="24" ry="16" fill="#ffb8c8" ${st()}/><ellipse cx="42" cy="72" rx="3" ry="4" fill="${INK}"/><ellipse cx="58" cy="72" rx="3" ry="4" fill="${INK}"/>
    ${face(50, 48, 0.95, { noMouth: true, dx: 15 })}`,
  monkey:
    () => `<circle cx="15" cy="52" r="13" fill="#8a5a3c" ${st()}/><circle cx="85" cy="52" r="13" fill="#8a5a3c" ${st()}/><circle cx="15" cy="52" r="7" fill="#f6c9a0"/><circle cx="85" cy="52" r="7" fill="#f6c9a0"/>
    <circle cx="50" cy="52" r="34" fill="#8a5a3c" ${st()}/><path d="M42,20 q6,-12 14,-2" fill="none" ${st(3)}/>
    <path d="M50,42 Q40,28 30,36 Q20,46 27,62 Q33,82 50,82 Q67,82 73,62 Q80,46 70,36 Q60,28 50,42 Z" fill="#f6c9a0"/>
    ${face(50, 52, 0.9, { dx: 12, mouthDy: 15 })}`,
  elephant:
    () => `<ellipse cx="18" cy="48" rx="18" ry="25" fill="#b5bccb" ${st()}/><ellipse cx="82" cy="48" rx="18" ry="25" fill="#b5bccb" ${st()}/><ellipse cx="20" cy="48" rx="10" ry="16" fill="#f2c3cf"/><ellipse cx="80" cy="48" rx="10" ry="16" fill="#f2c3cf"/>
    <ellipse cx="50" cy="46" rx="30" ry="30" fill="#b5bccb" ${st()}/>
    <path d="M43,62 Q41,82 54,90 Q63,93 63,86 Q55,82 57,62" fill="#b5bccb" ${st()}/><path d="M45,70 l9,0 M47,78 l9,-1" stroke="#949cae" stroke-width="2.5" stroke-linecap="round"/>
    ${face(50, 44, 0.95, { noMouth: true, dx: 14 })}`,
  sheep: () => {
    const puffs = [
      [50, 20],
      [30, 26],
      [70, 26],
      [18, 44],
      [82, 44],
      [22, 66],
      [78, 66],
      [36, 82],
      [64, 82],
      [50, 86],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" fill="#fffaf0" ${st(2.5)}/>`)
      .join('');
    return `${puffs}<circle cx="50" cy="52" r="33" fill="#fffaf0"/>
    <ellipse cx="22" cy="52" rx="11" ry="6" fill="#f0cfae" ${st(2.5)} transform="rotate(-15 22 52)"/><ellipse cx="78" cy="52" rx="11" ry="6" fill="#f0cfae" ${st(2.5)} transform="rotate(15 78 52)"/>
    <ellipse cx="50" cy="58" rx="20" ry="23" fill="#f0cfae" ${st()}/><circle cx="42" cy="34" r="8" fill="#fffaf0"/><circle cx="58" cy="34" r="8" fill="#fffaf0"/><circle cx="50" cy="32" r="8" fill="#fffaf0"/>
    ${face(50, 56, 0.8, { dx: 11, mouthDy: 12 })}`;
  },
  octopus: () => `${[
    [22, 76, 28],
    [38, 82, 10],
    [62, 82, -10],
    [78, 76, -28],
  ]
    .map(
      ([x, y, a]) =>
        `<ellipse cx="${x}" cy="${y}" rx="8" ry="16" fill="#f27bb8" ${st()} transform="rotate(${a} ${x} ${y})"/>`,
    )
    .join('')}
    <ellipse cx="50" cy="46" rx="34" ry="32" fill="#f27bb8" ${st()}/><circle cx="34" cy="26" r="4" fill="#ffc2e0"/><circle cx="64" cy="22" r="3" fill="#ffc2e0"/><circle cx="72" cy="32" r="4.5" fill="#ffc2e0"/>
    ${face(50, 52, 1)}`,
  turtle:
    () => `<ellipse cx="26" cy="80" rx="9" ry="6" fill="#a7d86d" ${st(2.5)}/><ellipse cx="60" cy="80" rx="9" ry="6" fill="#a7d86d" ${st(2.5)}/>
    <circle cx="78" cy="50" r="17" fill="#a7d86d" ${st()}/>
    <path d="M8,74 Q10,30 42,28 Q72,30 72,74 Z" fill="#3fb39f" ${st()}/>
    <path d="M32,40 l8,-6 l8,6 l0,10 l-8,6 l-8,-6 Z" fill="#7fd6c4" stroke="#2a8f7e" stroke-width="2.5"/><path d="M18,60 l8,-5 l8,5 l0,8 M50,55 l8,-5 l8,5 l0,10" fill="none" stroke="#2a8f7e" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="6" y="70" width="68" height="9" rx="4.5" fill="#2a8f7e" ${st(2.5)}/>
    ${face(79, 48, 0.6, { dx: 9 })}`,
  whale:
    () => `<path d="M40,27 q-6,-9 -3,-17 M40,27 q5,-11 12,-12 M40,27 q-1,-13 -1,-19" fill="none" stroke="#9fd8ff" stroke-width="4" stroke-linecap="round"/>
    <path d="M6,60 Q6,30 44,30 Q78,30 82,56 L95,44 Q99,62 91,66 Q99,74 95,84 L80,72 Q68,88 40,88 Q6,88 6,60 Z" fill="#5aa9e6" ${st()}/>
    <path d="M12,70 Q38,84 70,74 Q60,86 40,86 Q20,86 12,70 Z" fill="#cfe9ff"/>
    ${face(38, 56, 0.95, { dx: 13 })}`,
};

// ---------------------------------------------------------------- desserts

const DESSERTS = {
  cupcake:
    () => `<path d="M24,58 L30,90 L70,90 L76,58 Z" fill="#9fd8ff" ${st()}/><path d="M34,60 L37,88 M46,60 L47,88 M54,60 L53,88 M66,60 L63,88" stroke="#6cb4e6" stroke-width="3"/>
    <path d="M20,60 Q16,40 34,36 Q36,18 52,20 Q70,18 70,34 Q86,38 80,60 Z" fill="#ff9eb5" ${st()}/><circle cx="52" cy="16" r="7" fill="#e8364f" ${st(2.5)}/>${face(50, 46, 0.9)}`,
  donut:
    () => `<circle cx="50" cy="54" r="36" fill="#e2a873" ${st()}/><path d="M18,48 Q22,22 50,20 Q80,22 84,48 Q78,62 66,54 Q58,66 48,58 Q36,66 30,56 Q22,62 18,48 Z" fill="#d2b6ff" ${st()}/>
    <circle cx="50" cy="54" r="10" fill="#fff" ${st()}/><path d="M32,36 l4,-3 M62,30 l4,2 M70,44 l3,3 M42,28 l2,4" stroke="#ffd36e" stroke-width="4" stroke-linecap="round"/>${face(50, 74, 0.8, { dx: 14 })}`,
  icecream:
    () => `<path d="M32,52 L50,94 L68,52 Z" fill="#e8b46a" ${st()}/><path d="M38,60 L60,72 M42,72 L56,64 M46,82 L52,78" stroke="#c98b5a" stroke-width="2.5"/>
    <circle cx="50" cy="38" r="22" fill="#b6e7a0" ${st()}/><path d="M28,48 Q34,58 42,50 Q50,60 58,50 Q66,58 72,48" fill="#b6e7a0" ${st()}/>${face(50, 38, 0.85)}`,
  macaron:
    () => `<ellipse cx="50" cy="38" rx="36" ry="17" fill="#ffd36e" ${st()}/><rect x="16" y="46" width="68" height="12" rx="6" fill="#fffaf0" ${st()}/><ellipse cx="50" cy="66" rx="36" ry="17" fill="#ffd36e" ${st()}/>
    ${face(50, 66, 0.85)}`,
  cake: () => `<path d="M14,60 L86,40 L86,82 L14,92 Z" fill="#fffaf0" ${st()}/><path d="M14,60 L86,40 L86,52 L14,72 Z" fill="#ff9eb5" ${st()}/><path d="M14,60 L50,24 L86,40 Z" fill="#ffe3ec" ${st()}/>
    <circle cx="52" cy="22" r="8" fill="#e8364f" ${st(2.5)}/>${face(52, 74, 0.8)}`,
  lollipop:
    () => `<rect x="47" y="56" width="6" height="40" rx="3" fill="#fffaf0" ${st(2.5)}/><circle cx="50" cy="40" r="30" fill="#9fd8ff" ${st()}/>
    <path d="M50,40 m-20,0 a20,20 0 1,1 20,20 a14,14 0 1,1 -14,-14 a8,8 0 1,1 8,8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>${face(50, 42, 0.8)}`,
  cookie:
    () => `<circle cx="50" cy="52" r="38" fill="#e7b37a" ${st()}/><circle cx="46" cy="48" r="28" fill="#efc48f" opacity="0.7"/>
    ${[
      [30, 32],
      [64, 28],
      [76, 52],
      [24, 60],
      [62, 76],
      [36, 78],
    ]
      .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="4" fill="#6b3f22"/>`)
      .join('')}
    ${face(50, 52, 0.95)}`,
  popsicle: () => `<rect x="45" y="70" width="10" height="26" rx="5" fill="#f3d9a8" ${st(2.5)}/>
    <path d="M28,30 Q28,10 50,10 Q72,10 72,30 L72,74 Q72,80 66,80 L34,80 Q28,80 28,74 Z" fill="#ffa24c" ${st()}/>
    <path d="M35,22 L35,60" stroke="#ffd0a0" stroke-width="5" stroke-linecap="round"/>${face(52, 48, 0.85, { dx: 12 })}`,
  cottonCandy: () => {
    const puffs = [
      [50, 20, 16, '#ffb8d9'],
      [31, 30, 15, '#c8e6ff'],
      [69, 30, 15, '#ffb8d9'],
      [24, 50, 15, '#ffb8d9'],
      [76, 50, 15, '#c8e6ff'],
      [38, 64, 15, '#ffb8d9'],
      [62, 64, 15, '#ffb8d9'],
    ]
      .map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${st(2.5)}/>`)
      .join('');
    return `<path d="M42,62 L50,97 L58,62 Z" fill="#fffaf0" ${st()}/><path d="M44,72 L56,68 M46,82 L54,79" stroke="#9fd8ff" stroke-width="3"/>
    ${puffs}<circle cx="50" cy="44" r="26" fill="#ffb8d9"/>${face(50, 44, 0.9, { dx: 13 })}`;
  },
  candy: () => `<path d="M26,52 L6,34 L11,52 L6,70 Z M74,52 L94,34 L89,52 L94,70 Z" fill="#7fe0d0" ${st()}/>
    <ellipse cx="50" cy="52" rx="28" ry="25" fill="#3fc7b4" ${st()}/><path d="M33,38 Q50,30 66,40" fill="none" stroke="#bff3ea" stroke-width="5" stroke-linecap="round"/>${face(50, 54, 0.85, { dx: 12 })}`,
  chocolate: () => `<rect x="22" y="10" width="56" height="70" rx="6" fill="#7a4a2c" ${st()}/>
    <path d="M22,30 L78,30 M50,10 L50,50 M22,50 L78,50" stroke="#5c3520" stroke-width="3"/>
    <path d="M18,48 L82,48 L82,92 L18,92 Z" fill="#4a7fe0" ${st()}/><path d="M18,48 l8,6 l8,-6 l8,6 l8,-6 l8,6 l8,-6 l8,6 l8,-6" fill="none" stroke="#ffd36e" stroke-width="3"/>
    ${face(50, 72, 0.85, { dx: 13 })}`,
  pancakes: () => `<ellipse cx="50" cy="88" rx="42" ry="7" fill="#e7f4ff" ${st(2.5)}/>
    <rect x="12" y="70" width="76" height="16" rx="8" fill="#e8b46a" ${st()}/><rect x="12" y="56" width="76" height="16" rx="8" fill="#f2c47e" ${st()}/><rect x="12" y="42" width="76" height="16" rx="8" fill="#f7d79a" ${st()}/>
    <path d="M14,48 Q14,40 26,40 L74,40 Q86,40 86,48 Q80,58 74,50 Q68,62 62,50 Q54,58 48,50 Q40,62 34,50 Q26,58 20,50 Z" fill="#b5651d" opacity="0.9"/>
    <rect x="40" y="28" width="20" height="13" rx="3" fill="#fff3a6" ${st(2.5)}/>${face(50, 70, 0.75, { dx: 14 })}`,
  jelly: () => `<ellipse cx="50" cy="86" rx="42" ry="8" fill="#e7f4ff" ${st(2.5)}/>
    <path d="M18,84 Q14,56 24,40 Q30,22 50,22 Q70,22 76,40 Q86,56 82,84 Z" fill="#ef4b61" ${st()}/>
    <path d="M30,40 Q34,30 42,28" fill="none" stroke="#ffb3be" stroke-width="5" stroke-linecap="round"/>${face(50, 58, 0.95)}`,
  flan: () => `<ellipse cx="50" cy="86" rx="44" ry="8" fill="#fffaf0" ${st(2.5)}/>
    <path d="M24,28 L76,28 L84,82 L16,82 Z" fill="#ffd77a" ${st()}/>
    <path d="M24,28 L76,28 L78,42 Q72,52 66,42 Q60,56 52,42 Q44,54 38,42 Q30,52 22,42 Z" fill="#a35a1c" ${st(2.5)}/>${face(50, 64, 0.95)}`,
  pie: () => `<circle cx="50" cy="52" r="40" fill="#e8b46a" ${st()}/><circle cx="50" cy="52" r="31" fill="#9d5bd2" ${st(2.5)}/>
    <g stroke="#f2c47e" stroke-width="7" stroke-linecap="round"><path d="M28,32 L52,22 M24,46 L72,26 M32,40 L40,22 M52,36 L58,24 M70,40 L74,34"/></g>
    <circle cx="50" cy="62" r="17" fill="#9d5bd2"/>${face(50, 60, 0.8, { dx: 12 })}`,
  marshmallow: () =>
    `<path d="M22,34 Q22,22 50,22 Q78,22 78,34 L78,76 Q78,88 50,88 Q22,88 22,76 Z" fill="#fff5fa" ${st()}/><ellipse cx="50" cy="34" rx="28" ry="12" fill="#ffd6e8" ${st()}/>${face(50, 62, 0.95)}`,
  candyCane: () => {
    const d = 'M60,92 L60,36 Q60,12 40,12 Q20,12 20,32';
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="30" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="#fffaf0" stroke-width="24" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="#e8364f" stroke-width="24" stroke-dasharray="10 10"/>
    <rect x="49" y="56" width="22" height="22" rx="8" fill="#fffaf0"/>${face(60, 64, 0.5, { dx: 10, noBlush: true })}`;
  },
  gummyBear:
    () => `<circle cx="33" cy="20" r="9" fill="#7fd86a" ${st()}/><circle cx="67" cy="20" r="9" fill="#7fd86a" ${st()}/>
    <ellipse cx="26" cy="60" rx="8" ry="12" fill="#7fd86a" ${st()} transform="rotate(25 26 60)"/><ellipse cx="74" cy="60" rx="8" ry="12" fill="#7fd86a" ${st()} transform="rotate(-25 74 60)"/>
    <ellipse cx="36" cy="88" rx="11" ry="7" fill="#7fd86a" ${st()}/><ellipse cx="64" cy="88" rx="11" ry="7" fill="#7fd86a" ${st()}/>
    <ellipse cx="50" cy="68" rx="24" ry="22" fill="#7fd86a" ${st()}/><circle cx="50" cy="34" r="21" fill="#7fd86a" ${st()}/>
    <ellipse cx="50" cy="70" rx="12" ry="11" fill="#b4ef9f" opacity="0.7"/><path d="M38,22 q5,-5 12,-5" fill="none" stroke="#d4f8c7" stroke-width="4" stroke-linecap="round"/>
    ${face(50, 36, 0.7, { dx: 11 })}`,
  muffin:
    () => `<path d="M24,56 L30,90 L70,90 L76,56 Z" fill="#f59aa8" ${st()}/><path d="M34,58 L37,88 M46,58 L47,88 M54,58 L53,88 M66,58 L63,88" stroke="#e0707f" stroke-width="3"/>
    <path d="M14,58 Q10,26 50,22 Q90,26 86,58 Q50,66 14,58 Z" fill="#e8c08a" ${st()}/>
    ${[
      [28, 40],
      [44, 30],
      [64, 32],
      [74, 46],
      [22, 54],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="#5b6fd6" ${st(1.8)}/>`)
      .join('')}
    ${face(50, 46, 0.85, { dx: 12 })}`,
  milkshake: () => `<path d="M64,40 L80,6" stroke="#4fb6e6" stroke-width="6" stroke-linecap="round"/>
    <path d="M30,34 L36,92 L64,92 L70,34 Z" fill="#ff9ec4" ${st()}/><path d="M33,52 L67,52" stroke="#ffc8dd" stroke-width="4"/>
    <path d="M26,36 Q24,22 38,22 Q42,12 52,16 Q62,10 66,22 Q78,22 74,36 Z" fill="#fffaf0" ${st()}/>
    <circle cx="52" cy="11" r="6" fill="#e8364f" ${st(2)}/>${face(50, 68, 0.8, { dx: 11 })}`,
};

/** The drawn themes' pictures, in sheet order (20 each). */
export const ANIMAL_NAMES = Object.keys(ANIMALS);
export const DESSERT_NAMES = Object.keys(DESSERTS);

// ---------------------------------------------------------------- cards

/** A card frame: the theme's back (colour, soft dots, a white star) or the blank cream face. */
function cardSvg(colour) {
  const s = CARD;
  const r = s * 0.14;
  const body = `<rect x="3" y="3" width="${s - 6}" height="${s - 6}" rx="${r}" fill="${colour ?? '#fffaf0'}" stroke="${INK}" stroke-width="5"/>`;
  if (colour === null) return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">${body}</svg>`;
  const dots = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (!(i === 1 && j === 1))
        dots.push(
          `<circle cx="${f(s * 0.2 + i * s * 0.3)}" cy="${f(s * 0.2 + j * s * 0.3)}" r="${f(s * 0.05)}" fill="#fff" opacity="0.4"/>`,
        );
  const c = s / 2;
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? s * 0.24 : s * 0.1;
    return `${f(c + Math.cos(a) * rr)},${f(c + Math.sin(a) * rr)}`;
  }).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">${body}${dots.join('')}
    <polygon points="${star}" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round" opacity="0.95"/></svg>`;
}

// ---------------------------------------------------------------- backdrops

/** A small motif for a theme's backdrop, centred on (0, 0), about 40 px. */
function motif(theme, colour) {
  switch (theme) {
    case 'animals': // a paw print
      return `<g fill="${colour}"><ellipse cx="0" cy="8" rx="12" ry="10"/><circle cx="-12" cy="-8" r="5"/><circle cx="-4" cy="-15" r="5"/><circle cx="5" cy="-15" r="5"/><circle cx="13" cy="-8" r="5"/></g>`;
    case 'desserts': // sprinkles
      return `<g stroke="${colour}" stroke-width="6" stroke-linecap="round"><path d="M-14,-8 l8,-6 M4,-12 l8,4 M-6,8 l6,8 M10,6 l8,-4"/></g>`;
    case 'dinosaurs': // a fern leaf
      return `<g fill="${colour}"><path d="M0,22 Q-2,0 0,-22 Q2,0 0,22 Z"/>${[-14, -6, 2, 10].map((y) => `<ellipse cx="-8" cy="${y}" rx="8" ry="3.5" transform="rotate(-30 -8 ${y})"/><ellipse cx="8" cy="${y}" rx="8" ry="3.5" transform="rotate(30 8 ${y})"/>`).join('')}</g>`;
    case 'dragons': // a little flame
      return `<path d="M0,20 Q-16,14 -12,-2 Q-8,-12 -2,-20 Q0,-8 6,-6 Q4,-14 10,-18 Q18,0 12,12 Q8,20 0,20 Z" fill="${colour}"/>`;
    case 'aliens': // a twinkle star
      return `<path d="M0,-20 Q3,-3 20,0 Q3,3 0,20 Q-3,3 -20,0 Q-3,-3 0,-20 Z" fill="${colour}"/>`;
  }
  throw new Error(`unknown theme ${theme}`);
}

/**
 * A soft pastel backdrop: a diagonal gradient, big soft bubbles, and a
 * sprinkle of the theme's motif kept to the sides (the board sits in the
 * middle and must stay calm behind the cards).
 */
function backdropSvg(theme) {
  const { bg, motif: colour } = THEME_COLOURS[theme];
  const bubbles = Array.from({ length: 18 }, (_, i) => {
    const x = (i * 211 + 40) % W;
    const y = (i * 137 + 60) % H;
    return `<circle cx="${x}" cy="${y}" r="${30 + (i % 5) * 18}" fill="#fff" opacity="${0.16 + (i % 3) * 0.06}"/>`;
  }).join('');
  // Two columns of motifs down each side, on a jittered grid (even, never clumped).
  const motifs = [];
  let n = 0;
  for (const cols of [
    [56, 156],
    [W - 156, W - 56],
  ])
    for (const cx of cols)
      for (let y = 116; y <= H - 40; y += 92) {
        const jx = ((n * 37) % 31) - 15;
        const jy = ((n * 53) % 29) - 14;
        const rot = (n * 47) % 360;
        const sc = 0.8 + (n % 3) * 0.2;
        const yy = y + (cx === cols[1] ? 46 : 0) + jy;
        if (yy < H - 30) {
          motifs.push(
            `<g transform="translate(${cx + jx},${yy}) rotate(${rot}) scale(${sc})" opacity="0.42">${motif(theme, colour)}</g>`,
          );
        }
        n++;
      }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>${bubbles}${motifs.join('')}</svg>`;
}

// ---------------------------------------------------------------- output

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

/** A drawn picture as a PICTURE-px frame. */
const pictureSvg = (draw) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PICTURE}" height="${PICTURE}" viewBox="0 0 100 100">${draw()}</svg>`;

/** The owner's cut-out, fitted into a PICTURE-px frame with a little air. */
async function photoFrame(theme, n) {
  const src = resolve(SOURCE_DIR, theme, `${String(n).padStart(2, '0')}.png`);
  if (!existsSync(src)) throw new Error(`missing ${src} (the owner's cut-outs live in .sprite-source/pair-pals/)`);
  const inner = Math.round(PICTURE * 0.96);
  const fitted = await sharp(src)
    .trim({ threshold: 1 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: { width: PICTURE, height: PICTURE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: fitted, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function grid(bufs, w, h, cols) {
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

async function themeSheet(theme) {
  let frames;
  if (theme === 'animals') frames = await Promise.all(Object.values(ANIMALS).map((d) => png(pictureSvg(d))));
  else if (theme === 'desserts') frames = await Promise.all(Object.values(DESSERTS).map((d) => png(pictureSvg(d))));
  else frames = await Promise.all(Array.from({ length: PICTURES_PER_THEME }, (_, i) => photoFrame(theme, i + 1)));
  if (frames.length !== PICTURES_PER_THEME)
    throw new Error(`${theme}: ${frames.length} pictures, want ${PICTURES_PER_THEME}`);
  return grid(frames, PICTURE, PICTURE, PICTURE_COLS);
}

async function main() {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf('--preview');
  const previewPath = previewIdx >= 0 ? args[previewIdx + 1] : null;
  const dry = args.includes('--dry');

  const sheets = await Promise.all(THEMES.map(themeSheet));
  const cards = await grid(
    await Promise.all([...THEMES.map((t) => png(cardSvg(THEME_COLOURS[t].back))), png(cardSvg(null))]),
    CARD,
    CARD,
    THEMES.length + 1,
  );
  const backdrops = await Promise.all(THEMES.map((t) => png(backdropSvg(t))));

  const webp = { quality: 90, alphaQuality: 100, effort: 6 };
  // The owner's painted creatures: lighter, a card shows them at most 180 px.
  const photoWebp = { quality: 80, alphaQuality: 90, effort: 6 };
  const files = [
    ...THEMES.map((t, i) => [
      resolve(HERO_DIR, `pairpals-pics-${t}.webp`),
      sharp(sheets[i]).webp(PHOTO_THEMES.includes(t) ? photoWebp : webp),
    ]),
    [resolve(HERO_DIR, 'pairpals-cards.webp'), sharp(cards).webp(webp)],
    ...THEMES.map((t, i) => [
      resolve(BG_DIR, `pairpals-bg-${t}.webp`),
      sharp(backdrops[i]).webp({ quality: 86, effort: 6 }),
    ]),
    [
      resolve(BG_DIR, 'pair-pals.webp'),
      sharp(backdrops[THEMES.indexOf('aliens')])
        .modulate({ brightness: MENU_BRIGHTNESS })
        .webp({ quality: 86, effort: 6 }),
    ],
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
    // A review board: every theme's 20 pictures on cards, the backs, and the backdrops.
    const cell = 132;
    const card = 120;
    const face = await sharp(await png(cardSvg(null)))
      .resize(card, card)
      .png()
      .toBuffer();
    const comps = [];
    let y = 10;
    for (let t = 0; t < THEMES.length; t++) {
      const back = await sharp(await png(cardSvg(THEME_COLOURS[THEMES[t]].back)))
        .resize(card, card)
        .png()
        .toBuffer();
      comps.push({ input: back, left: 10, top: y });
      for (let i = 0; i < PICTURES_PER_THEME; i++) {
        const col = i % 10;
        const row = Math.floor(i / 10);
        const x = 10 + (col + 1) * cell;
        const yy = y + row * cell;
        const pic = await sharp(sheets[t])
          .extract({
            left: (i % PICTURE_COLS) * PICTURE,
            top: Math.floor(i / PICTURE_COLS) * PICTURE,
            width: PICTURE,
            height: PICTURE,
          })
          .resize(Math.round(card * 0.86), Math.round(card * 0.86))
          .png()
          .toBuffer();
        comps.push(
          { input: face, left: x, top: yy },
          { input: pic, left: x + Math.round(card * 0.07), top: yy + Math.round(card * 0.07) },
        );
      }
      y += cell * 2 + 14;
    }
    const thumbs = await Promise.all(backdrops.map((b) => sharp(b).resize(320, 180).png().toBuffer()));
    thumbs.forEach((input, i) => comps.push({ input, left: 10 + i * 330, top: y }));
    await sharp({ create: { width: 10 + 11 * cell, height: y + 200, channels: 4, background: '#e9e4f5' } })
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
