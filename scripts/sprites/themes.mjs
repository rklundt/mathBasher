#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Words and Numbers puzzle art generator (sprint 2.16).
 *
 * Original kawaii vector art drawn in code for the two looks the Words and
 * Numbers puzzles play in, **Animal Pals** (kawaii and fantasy animals)
 * and **Alien Invaders**, plus the word pictures. This file IS the source
 * of the art: edit and re-run, never hand-edit the shipped images. The
 * owner may later swap in their own picture sheet: same frame size, same
 * order (`PICS`, mirrored in `src/game/systems/puzzles/wordData.ts`).
 *
 * Outputs:
 *   public/assets/sprites/hero/puzzle-pics.webp            50 word pictures, PIC px, 10 across (PICS order)
 *   public/assets/sprites/hero/theme-critters-dancers-3.webp 20 characters × 3 poses (idle, happy, oops), DANCER frames, two to a row
 *   public/assets/sprites/hero/theme-cosmos-dancers-3.webp   the same for the aliens and robots
 *   public/assets/sprites/hero/theme-cosmos-train.webp     a rocket and 4 pods (the train's geometry)
 *   public/assets/sprites/hero/theme-machines.webp         the candy machine, the robot machine, the zapper (MACHINE px)
 *   public/assets/sprites/hero/theme-counters-2.webp       Quick Count's counters: 8 critters, then 8 space ones (COUNTER px)
 *   public/assets/sprites/hero/theme-flyers.webp           things drifting across the backdrop: 4 critters, then 4 space ones (FLYER px)
 *   public/assets/sprites/hero/puzzle-icons-2.webp         the new puzzles' tile pictures, ICON px, ICON_ORDER
 *   public/assets/sprites/bg/theme-<look>-{1…6}.webp       each look's six backdrops
 *   public/assets/sprites/bg/puzzle-words.webp             the Words setup backdrop (darkened)
 *   public/assets/sprites/bg/puzzle-numbers.webp           the Numbers setup backdrop (darkened)
 *
 * Usage:
 *   pnpm sprite:themes                       # writes the files above
 *   pnpm sprite:themes --preview <png> --dry # review board only, ships nothing
 *   pnpm sprite:themes --force               # re-render over the shipped files
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BG_DIR = resolve(ROOT, 'public/assets/sprites/bg');
const HERO_DIR = resolve(ROOT, 'public/assets/sprites/hero');
const MENU_BRIGHTNESS = 0.3;

export const W = 1280;
export const H = 720;
export const PIC = 128;
export const PIC_COLS = 10;
export const DANCER = { w: 200, h: 230 };
export const TRAIN = { w: 220, h: 180 };
export const MACHINE = 260;
export const COUNTER = 96;
export const ICON = 96;
export const BACKDROPS = 6;
export const FLYER = 96;
export const LOOKS = ['critters', 'cosmos'];

/** The word pictures, in frame order. Mirrored in wordData.PICTURE_WORDS (a test checks). */
export const PICS = [
  'cat',
  'dog',
  'pig',
  'cow',
  'hen',
  'fox',
  'bee',
  'owl',
  'bug',
  'ant',
  'sun',
  'cup',
  'hat',
  'bus',
  'car',
  'bed',
  'box',
  'egg',
  'key',
  'web',
  'fish',
  'frog',
  'duck',
  'bird',
  'bear',
  'lion',
  'moon',
  'star',
  'tree',
  'ball',
  'cake',
  'kite',
  'boat',
  'book',
  'sock',
  'drum',
  'bell',
  'leaf',
  'apple',
  'house',
  'clock',
  'horse',
  'snake',
  'mouse',
  'train',
  'robot',
  'pizza',
  'cloud',
  'rocket',
  'flower',
];
/** Each look's dancers, in sheet row order. */
export const DANCERS = {
  critters: [
    ...['unicorn', 'dragon', 'bunny', 'kitten', 'panda', 'yeti', 'puppy', 'fox', 'pegasus', 'phoenix'],
    ...['owl', 'penguin', 'koala', 'frog', 'hedgehog', 'lamb', 'raccoon', 'tiger', 'narwhal', 'fairymouse'],
  ],
  cosmos: [
    ...['blip', 'zorp', 'goo', 'boxbot', 'domebot', 'tallbot', 'cyclops', 'jelly', 'dronebot', 'roverbot'],
    ...['stalky', 'shroom', 'starry', 'twins', 'tvbot', 'spinbot', 'crabbot', 'ufopilot', 'puffball', 'springbot'],
  ],
};
export const COUNTERS = [
  'ladybug',
  'chick',
  'star',
  'blossom',
  'bee',
  'butterfly',
  'strawberry',
  'acorn',
  'alien',
  'planet',
  'ufo',
  'bothead',
  'rocket',
  'comet',
  'gem',
  'satellite',
];
/** Things that drift across the backdrop (sprint 2.16): Animal Pals' four, then Alien Invaders'. */
export const FLYERS = ['butterfly', 'balloon', 'bird', 'leaf', 'ufo', 'comet', 'satellite', 'rocket'];
export const MACHINES = ['candy', 'robot', 'zapper'];
/** The new puzzles' tile pictures. Mirrored in spriteKeys PUZZLE_ICON_SHEETS (a test checks). */
export const ICON_ORDER = [
  'word-train',
  'odd-word-out',
  'word-wand',
  'missing-letter',
  'word-snap',
  'letter-garden',
  'number-train',
  'number-machine',
  'odd-number-out',
  'make-ten',
  'quick-count',
];

// ---------------------------------------------------------------- helpers

const INK = '#3a2420';
const BLUSH = '#ff8fa3';
const f = (n) => Number(n).toFixed(1);
const st = (w = 3, c = INK) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/** A kawaii face at (x, y), s = scale. mood: 'smile' | 'happy' (^^, open mouth) | 'oops' (O mouth). */
function face(x, y, s = 1, mood = 'smile', ink = '#2a1a17') {
  const dx = 9 * s;
  let eyes;
  if (mood === 'happy') {
    eyes = [-1, 1]
      .map(
        (d) =>
          `<path d="M${f(x + d * dx - 4 * s)},${f(y + 1 * s)} q${f(4 * s)},${f(-6 * s)} ${f(8 * s)},0" fill="none" ${st(2.2 * s, ink)}/>`,
      )
      .join('');
  } else {
    eyes = [-1, 1]
      .map(
        (d) =>
          `<ellipse cx="${f(x + d * dx)}" cy="${f(y)}" rx="${f(3.6 * s)}" ry="${f(4.2 * s)}" fill="${ink}"/><circle cx="${f(x + d * dx - 1.3 * s)}" cy="${f(y - 1.6 * s)}" r="${f(1.4 * s)}" fill="#fff"/>`,
      )
      .join('');
  }
  const blush = [-1, 1]
    .map(
      (d) =>
        `<ellipse cx="${f(x + d * (dx + 6 * s))}" cy="${f(y + 5 * s)}" rx="${f(3.6 * s)}" ry="${f(2.3 * s)}" fill="${BLUSH}" opacity="0.8"/>`,
    )
    .join('');
  let mouth;
  if (mood === 'happy') {
    mouth = `<path d="M${f(x - 4.5 * s)},${f(y + 5 * s)} q${f(4.5 * s)},${f(7 * s)} ${f(9 * s)},0 Z" fill="#c2414d" ${st(1.4 * s, ink)}/>`;
  } else if (mood === 'oops') {
    mouth = `<ellipse cx="${f(x)}" cy="${f(y + 7 * s)}" rx="${f(2.8 * s)}" ry="${f(3.6 * s)}" fill="#c2414d" ${st(1.4 * s, ink)}/>`;
  } else {
    mouth = `<path d="M${f(x - 3 * s)},${f(y + 5 * s)} q${f(1.5 * s)},${f(2.4 * s)} ${f(3 * s)},0 q${f(1.5 * s)},${f(2.4 * s)} ${f(3 * s)},0" fill="none" ${st(1.6 * s, ink)}/>`;
  }
  return blush + eyes + mouth;
}

const svg = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${inner}</svg>`;
/** Inner drawn around (0, 0), centred in a size-px frame. */
const centred = (inner, size) => svg(size, size, `<g transform="translate(${size / 2},${size / 2})">${inner}</g>`);
const star5 = (r, inner = 0.48, cx = 0, cy = 0) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * inner;
    return `${f(cx + Math.cos(a) * rr)},${f(cy + Math.sin(a) * rr)}`;
  }).join(' ');
const sparkle = (x, y, s, c = '#fff') =>
  `<path d="M${f(x)},${f(y - s)} Q${f(x + s * 0.18)},${f(y - s * 0.18)} ${f(x + s)},${f(y)} Q${f(x + s * 0.18)},${f(y + s * 0.18)} ${f(x)},${f(y + s)} Q${f(x - s * 0.18)},${f(y + s * 0.18)} ${f(x - s)},${f(y)} Q${f(x - s * 0.18)},${f(y - s * 0.18)} ${f(x)},${f(y - s)} Z" fill="${c}"/>`;

// ---------------------------------------------------------------- word pictures

/** Each picture drawn around (0, 0), about 100 px across. */
const PIC_ART = {
  cat: () =>
    `<path d="M-34,-18 L-30,-46 L-10,-30 Z M34,-18 L30,-46 L10,-30 Z" fill="#ffa94d" ${st()}/><ellipse cx="0" cy="4" rx="40" ry="34" fill="#ffa94d" ${st()}/>
     <path d="M-26,-40 l4,10 M26,-40 l-4,10" ${st(2)}/><path d="M-44,8 h-14 M-44,14 h-12 M44,8 h14 M44,14 h12" ${st(2)}/>${face(0, 4, 1.4)}`,
  dog: () =>
    `<ellipse cx="0" cy="4" rx="36" ry="34" fill="#e8c39e" ${st()}/><ellipse cx="-36" cy="-2" rx="11" ry="24" fill="#a0724e" ${st()} transform="rotate(14 -36 -2)"/>
     <ellipse cx="36" cy="-2" rx="11" ry="24" fill="#a0724e" ${st()} transform="rotate(-14 36 -2)"/><ellipse cx="0" cy="16" rx="16" ry="11" fill="#fff4e6" ${st(2)}/><ellipse cx="0" cy="11" rx="6" ry="4" fill="#3a2420"/>${face(0, -4, 1.3)}`,
  pig: () =>
    `<path d="M-30,-22 L-34,-42 L-14,-30 Z M30,-22 L34,-42 L14,-30 Z" fill="#faa2c1" ${st()}/><circle cx="0" cy="4" r="38" fill="#fcc2d7" ${st()}/>
     <ellipse cx="0" cy="16" rx="15" ry="11" fill="#faa2c1" ${st(2.5)}/><ellipse cx="-5" cy="16" rx="2.6" ry="4" fill="#3a2420"/><ellipse cx="5" cy="16" rx="2.6" ry="4" fill="#3a2420"/>${face(0, -6, 1.3)}`,
  cow: () =>
    `<path d="M-30,-30 q-10,-14 -2,-20 M30,-30 q10,-14 2,-20" fill="none" ${st(5)}/><ellipse cx="0" cy="0" rx="38" ry="36" fill="#fff" ${st()}/>
     <path d="M-30,-20 q10,-6 14,6 q-4,12 -16,6 Z M18,-26 q14,0 14,14 q-12,4 -14,-14 Z" fill="#3a2420"/><ellipse cx="0" cy="20" rx="24" ry="14" fill="#fcc2d7" ${st(2.5)}/>
     <circle cx="-8" cy="20" r="3" fill="#3a2420"/><circle cx="8" cy="20" r="3" fill="#3a2420"/>${face(0, -6, 1.2)}`,
  hen: () =>
    `<path d="M-6,-44 q6,-12 12,0 q8,-10 12,2 q-12,6 -24,-2 Z" fill="#ff6b6b" ${st(2.5)}/><ellipse cx="0" cy="4" rx="34" ry="38" fill="#fff" ${st()}/>
     <path d="M-4,2 L0,10 L4,2 Z" fill="#ffd43b" ${st(2)}/><path d="M-2,12 q2,10 4,0" fill="#ff6b6b" ${st(1.5)}/><path d="M28,8 q14,4 10,18 q-10,-2 -12,-8" fill="#fff" ${st(2.5)}/>${face(0, -8, 1.1)}`,
  fox: () =>
    `<path d="M-36,-14 L-32,-48 L-8,-28 Z M36,-14 L32,-48 L8,-28 Z" fill="#ff922b" ${st()}/><path d="M-42,-10 Q-40,30 0,40 Q40,30 42,-10 Q20,-34 0,-30 Q-20,-34 -42,-10 Z" fill="#ff922b" ${st()}/>
     <path d="M-30,10 Q-10,14 0,40 Q10,14 30,10 Q20,32 0,40 Q-20,32 -30,10 Z" fill="#fff"/><circle cx="0" cy="30" r="5" fill="#3a2420"/>${face(0, 0, 1.2)}`,
  bee: () =>
    `<ellipse cx="-14" cy="-30" rx="16" ry="12" fill="#e7f5ff" ${st(2.5)}/><ellipse cx="14" cy="-30" rx="16" ry="12" fill="#e7f5ff" ${st(2.5)}/><ellipse cx="0" cy="6" rx="42" ry="32" fill="#ffd43b" ${st()}/>
     <path d="M-14,-22 q-4,30 0,56 M10,-24 q4,30 0,58" fill="none" stroke="#3a2420" stroke-width="9"/><path d="M38,6 L52,6" ${st(4)}/>${face(-22, 2, 1)}`,
  owl: () =>
    `<path d="M-34,-30 L-30,-46 L-16,-36 Z M34,-30 L30,-46 L16,-36 Z" fill="#a0724e" ${st()}/><ellipse cx="0" cy="4" rx="38" ry="42" fill="#a0724e" ${st()}/><ellipse cx="0" cy="14" rx="24" ry="26" fill="#e8c39e"/>
     <circle cx="-14" cy="-12" r="14" fill="#fff" ${st(2.5)}/><circle cx="14" cy="-12" r="14" fill="#fff" ${st(2.5)}/><circle cx="-14" cy="-12" r="6" fill="#2a1a17"/><circle cx="14" cy="-12" r="6" fill="#2a1a17"/>
     <circle cx="-16" cy="-14" r="2" fill="#fff"/><circle cx="12" cy="-14" r="2" fill="#fff"/><path d="M-5,0 L0,10 L5,0 Z" fill="#ffa94d" ${st(2)}/>`,
  bug: () =>
    `<path d="M-10,-34 q-8,-14 -16,-12 M10,-34 q8,-14 16,-12" fill="none" ${st(3)}/><circle cx="0" cy="-26" r="14" fill="#3a2420"/><circle cx="0" cy="8" r="36" fill="#ff6b6b" ${st()}/>
     <path d="M0,-28 L0,44" ${st(3)}/><circle cx="-16" cy="0" r="6" fill="#3a2420"/><circle cx="16" cy="0" r="6" fill="#3a2420"/><circle cx="-14" cy="24" r="5" fill="#3a2420"/><circle cx="14" cy="24" r="5" fill="#3a2420"/>${face(0, -24, 0.7, 'smile', '#fff')}`,
  ant: () =>
    `<path d="M-30,-10 q-10,-20 -4,-30 M-22,-14 q-2,-20 8,-26" fill="none" ${st(3)}/><circle cx="-26" cy="0" r="18" fill="#a0724e" ${st()}/><circle cx="4" cy="10" r="12" fill="#a0724e" ${st()}/><ellipse cx="34" cy="14" rx="20" ry="16" fill="#a0724e" ${st()}/>
     <path d="M-4,22 l-10,20 M6,22 l0,22 M16,20 l10,20" fill="none" ${st(3)}/>${face(-26, 0, 0.9)}`,
  sun: () =>
    Array.from({ length: 10 }, (_, i) => {
      const a = (i * Math.PI) / 5;
      return `<path d="M${f(Math.cos(a) * 34)},${f(Math.sin(a) * 34)} L${f(Math.cos(a + 0.16) * 52)},${f(Math.sin(a + 0.16) * 52)} L${f(Math.cos(a + 0.32) * 34)},${f(Math.sin(a + 0.32) * 34)} Z" fill="#ffa94d" ${st(2.5)}/>`;
    }).join('') + `<circle cx="0" cy="0" r="36" fill="#ffd43b" ${st()}/>${face(0, 2, 1.3)}`,
  cup: () =>
    `<path d="M30,-10 q24,0 22,20 q-2,18 -26,14" fill="none" ${st(7)}/><path d="M30,-10 q24,0 22,20 q-2,18 -26,14" fill="none" stroke="#74c0fc" stroke-width="3"/>
     <path d="M-36,-24 L36,-24 L30,34 Q0,44 -30,34 Z" fill="#74c0fc" ${st()}/><path d="M-10,-34 q6,-8 0,-16 M8,-34 q6,-8 0,-16" fill="none" ${st(2.5, '#adb5bd')}/>${face(0, 6, 1.2)}`,
  hat: () =>
    `<ellipse cx="0" cy="26" rx="52" ry="14" fill="#9775fa" ${st()}/><path d="M-30,26 L-26,-30 Q0,-40 26,-30 L30,26 Z" fill="#9775fa" ${st()}/><path d="M-28,10 L28,10 L29,22 L-29,22 Z" fill="#ffd43b" ${st(2.5)}/>`,
  bus: () =>
    `<rect x="-50" y="-34" width="100" height="62" rx="12" fill="#ffd43b" ${st()}/><rect x="-42" y="-26" width="22" height="20" rx="4" fill="#d0ebff" ${st(2.5)}/><rect x="-14" y="-26" width="22" height="20" rx="4" fill="#d0ebff" ${st(2.5)}/>
     <rect x="14" y="-26" width="28" height="20" rx="4" fill="#d0ebff" ${st(2.5)}/><circle cx="-28" cy="30" r="11" fill="#5a4a4a" ${st()}/><circle cx="28" cy="30" r="11" fill="#5a4a4a" ${st()}/>${face(0, 10, 0.9)}`,
  car: () =>
    `<path d="M-50,14 L-50,0 Q-48,-10 -36,-10 L-24,-30 Q-20,-34 -12,-34 L18,-34 Q26,-34 30,-28 L40,-10 Q52,-8 52,4 L52,14 Z" fill="#ff6b6b" ${st()}/>
     <path d="M-18,-26 L-8,-26 L-8,-12 L-26,-12 Z M0,-26 L16,-26 L26,-12 L0,-12 Z" fill="#d0ebff" ${st(2.5)}/><circle cx="-28" cy="18" r="12" fill="#5a4a4a" ${st()}/><circle cx="30" cy="18" r="12" fill="#5a4a4a" ${st()}/>${face(10, 2, 0.8)}`,
  bed: () =>
    `<rect x="-52" y="-30" width="14" height="66" rx="4" fill="#a0724e" ${st()}/><rect x="38" y="0" width="14" height="36" rx="4" fill="#a0724e" ${st()}/><rect x="-42" y="0" width="86" height="22" rx="6" fill="#a0724e" ${st()}/>
     <rect x="-38" y="-12" width="80" height="16" rx="8" fill="#74c0fc" ${st()}/><ellipse cx="-24" cy="-16" rx="14" ry="9" fill="#fff" ${st(2.5)}/>`,
  box: () =>
    `<path d="M-40,-14 L40,-14 L40,40 L-40,40 Z" fill="#e8c39e" ${st()}/><path d="M-40,-14 L-50,-34 L30,-34 L40,-14 Z M40,-14 L50,-34" fill="#d9a066" ${st()}/><path d="M0,-14 L0,40" ${st(2.5)}/>${face(0, 16, 1.1)}`,
  egg: () =>
    `<path d="M0,-46 C28,-46 40,6 36,22 C30,44 -30,44 -36,22 C-40,6 -28,-46 0,-46 Z" fill="#fff4e6" ${st()}/>${face(0, 10, 1.2)}`,
  key: () =>
    `<circle cx="-24" cy="0" r="22" fill="#ffd43b" ${st()}/><circle cx="-24" cy="0" r="8" fill="#fff" ${st(2.5)}/><path d="M-2,-6 L48,-6 L48,6 L40,6 L40,18 L32,18 L32,6 L24,6 L24,14 L16,14 L16,6 L-2,6 Z" fill="#ffd43b" ${st()}/>`,
  web: () =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return `<path d="M0,0 L${f(Math.cos(a) * 50)},${f(Math.sin(a) * 50)}" ${st(2.5, '#7a849c')}/>`;
    }).join('') +
    [16, 30, 44]
      .map(
        (r) =>
          `<polygon points="${Array.from({ length: 8 }, (_, i) => `${f(Math.cos((i * Math.PI) / 4) * r)},${f(Math.sin((i * Math.PI) / 4) * r)}`).join(' ')}" fill="none" ${st(2.5, '#7a849c')}/>`,
      )
      .join('') +
    `<circle cx="18" cy="16" r="10" fill="#3a2420"/>${face(18, 16, 0.45, 'smile', '#fff')}`,
  fish: () =>
    `<path d="M30,0 L54,-22 L54,22 Z" fill="#4dabf7" ${st()}/><ellipse cx="-4" cy="0" rx="40" ry="30" fill="#74c0fc" ${st()}/><path d="M-4,-30 q14,-14 24,-4" fill="#4dabf7" ${st(2.5)}/>${face(-14, -2, 1.1)}`,
  frog: () =>
    `<circle cx="-22" cy="-24" r="16" fill="#69db7c" ${st()}/><circle cx="22" cy="-24" r="16" fill="#69db7c" ${st()}/><ellipse cx="0" cy="8" rx="44" ry="34" fill="#69db7c" ${st()}/>
     <circle cx="-22" cy="-26" r="7" fill="#2a1a17"/><circle cx="22" cy="-26" r="7" fill="#2a1a17"/><circle cx="-24" cy="-28" r="2.4" fill="#fff"/><circle cx="20" cy="-28" r="2.4" fill="#fff"/>
     <path d="M-20,10 q20,18 40,0" fill="none" ${st(3)}/><ellipse cx="-30" cy="6" rx="6" ry="4" fill="${BLUSH}" opacity="0.8"/><ellipse cx="30" cy="6" rx="6" ry="4" fill="${BLUSH}" opacity="0.8"/>`,
  duck: () =>
    `<ellipse cx="6" cy="20" rx="42" ry="26" fill="#ffd43b" ${st()}/><circle cx="-14" cy="-18" r="24" fill="#ffd43b" ${st()}/><path d="M-36,-14 q-18,4 -16,10 q8,4 18,-2 Z" fill="#ff922b" ${st(2.5)}/>
     <path d="M10,14 q16,-10 26,4" fill="none" ${st(2.5)}/>${face(-12, -20, 0.9)}`,
  bird: () =>
    `<circle cx="0" cy="4" r="38" fill="#74c0fc" ${st()}/><path d="M-10,12 q-28,-6 -22,22 q16,0 22,-22 Z" fill="#4dabf7" ${st(2.5)}/><path d="M34,-2 L52,4 L34,10 Z" fill="#ffa94d" ${st(2.5)}/>
     <path d="M-8,-34 q4,-14 14,-8" fill="none" ${st(3)}/>${face(14, -4, 1)}`,
  bear: () =>
    `<circle cx="-30" cy="-30" r="14" fill="#a0724e" ${st()}/><circle cx="30" cy="-30" r="14" fill="#a0724e" ${st()}/><circle cx="0" cy="4" r="40" fill="#a0724e" ${st()}/>
     <ellipse cx="0" cy="18" rx="16" ry="12" fill="#e8c39e" ${st(2)}/><ellipse cx="0" cy="13" rx="6" ry="4" fill="#3a2420"/>${face(0, -6, 1.3)}`,
  lion: () =>
    Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6;
      return `<circle cx="${f(Math.cos(a) * 38)}" cy="${f(Math.sin(a) * 38)}" r="16" fill="#e8590c" ${st(2.5)}/>`;
    }).join('') +
    `<circle cx="0" cy="0" r="38" fill="#ffc078" ${st()}/><ellipse cx="0" cy="14" rx="5" ry="3.5" fill="#3a2420"/>${face(0, 0, 1.2)}`,
  moon: () => {
    // A crescent: the big circle minus a smaller one to its right.
    const r = 46;
    const R2 = r * 0.8;
    const d = r * 0.55;
    const ix = (d * d + r * r - R2 * R2) / (2 * d);
    const iy = Math.sqrt(r * r - ix * ix);
    return `<g transform="translate(10,0)"><path d="M${f(ix)},${f(-iy)} A${r},${r} 0 1 0 ${f(ix)},${f(iy)} A${f(R2)},${f(R2)} 0 0 1 ${f(ix)},${f(-iy)} Z" fill="#ffe066" ${st()}/>${face(-26, 4, 1)}</g>${sparkle(40, -30, 8, '#ffd43b')}`;
  },
  star: () => `<polygon points="${star5(50)}" fill="#ffd43b" ${st(3.5)}/>${face(0, 4, 1.2)}`,
  tree: () =>
    `<rect x="-10" y="10" width="20" height="40" rx="5" fill="#a0724e" ${st()}/><circle cx="-22" cy="-6" r="24" fill="#69db7c" ${st()}/><circle cx="22" cy="-6" r="24" fill="#69db7c" ${st()}/>
     <circle cx="0" cy="-26" r="28" fill="#69db7c" ${st()}/><circle cx="0" cy="-8" r="20" fill="#69db7c"/>${face(0, -12, 1.1)}`,
  ball: () =>
    `<circle cx="0" cy="0" r="46" fill="#fff" ${st()}/><path d="M-46,0 Q0,-20 46,0 Q0,20 -46,0 Z" fill="#ff6b6b"/><path d="M0,-46 Q-18,0 0,46" fill="none" ${st(2.5)}/><circle cx="0" cy="0" r="46" fill="none" ${st()}/>`,
  cake: () =>
    `<rect x="-42" y="-6" width="84" height="44" rx="8" fill="#fcc2d7" ${st()}/><path d="M-42,4 q10,10 21,0 q10,10 21,0 q10,10 21,0 q10,10 21,0" fill="none" stroke="#fff" stroke-width="5"/>
     <rect x="-4" y="-30" width="8" height="22" rx="3" fill="#74c0fc" ${st(2)}/><path d="M0,-42 q6,6 0,10 q-6,-4 0,-10 Z" fill="#ffd43b" ${st(1.5)}/>${face(0, 22, 0.9)}`,
  kite: () =>
    `<path d="M0,-48 L32,-8 L0,30 L-32,-8 Z" fill="#f783ac" ${st()}/><path d="M0,-48 L0,30 M-32,-8 L32,-8" ${st(2.5)}/><path d="M0,30 q-10,10 0,18 q10,8 0,16" fill="none" ${st(2.5)}/>
     <path d="M-4,42 l-8,-4 l2,8 Z M4,52 l8,-4 l-2,8 Z" fill="#74c0fc" ${st(1.5)}/>${face(0, -14, 0.8)}`,
  boat: () =>
    `<path d="M2,-46 L2,14 L38,14 Z" fill="#fff" ${st()}/><path d="M-4,-36 L-4,14 L-30,14 Z" fill="#ffd43b" ${st()}/><path d="M-50,18 L50,18 L38,42 L-38,42 Z" fill="#ff6b6b" ${st()}/>${face(0, 30, 0.8)}`,
  book: () =>
    `<path d="M0,-30 Q-24,-42 -50,-30 L-50,34 Q-24,22 0,34 Z" fill="#74c0fc" ${st()}/><path d="M0,-30 Q24,-42 50,-30 L50,34 Q24,22 0,34 Z" fill="#4dabf7" ${st()}/>
     <path d="M-40,-16 q16,-6 32,0 M-40,-2 q16,-6 32,0 M8,-16 q16,-6 32,0" fill="none" ${st(2, '#fff')}/>${face(26, 8, 0.8)}`,
  sock: () =>
    `<path d="M-14,-46 L18,-46 L18,14 Q46,10 46,30 Q46,46 24,46 L-6,46 Q-20,46 -20,30 Z" fill="#69db7c" ${st()}/><rect x="-16" y="-46" width="36" height="14" rx="4" fill="#fff" ${st(2.5)}/>
     <path d="M-18,-6 L18,-6 M-18,8 L18,8" stroke="#ffd43b" stroke-width="6"/>`,
  drum: () =>
    `<path d="M-40,-14 L-40,26 Q0,44 40,26 L40,-14" fill="#ff6b6b" ${st()}/><ellipse cx="0" cy="-14" rx="40" ry="14" fill="#fff4e6" ${st()}/><path d="M-40,-8 L-20,30 L0,-2 L20,30 L40,-8" fill="none" stroke="#ffd43b" stroke-width="4"/>
     <path d="M-30,-48 L-6,-20 M30,-48 L6,-20" ${st(5, '#a0724e')}/>`,
  bell: () =>
    `<path d="M-38,26 Q-34,-36 0,-38 Q34,-36 38,26 Z" fill="#ffd43b" ${st()}/><rect x="-44" y="22" width="88" height="10" rx="5" fill="#ffd43b" ${st()}/><circle cx="0" cy="40" r="8" fill="#ffa94d" ${st(2.5)}/>
     <circle cx="0" cy="-42" r="6" fill="#ffd43b" ${st(2.5)}/>${face(0, -2, 1.1)}`,
  leaf: () =>
    `<path d="M-40,40 Q-46,-30 40,-44 Q44,30 -40,40 Z" fill="#69db7c" ${st()}/><path d="M-40,40 Q0,0 36,-38 M-10,10 L-18,-12 M8,-8 L20,10" fill="none" ${st(2.5)}/>`,
  apple: () =>
    `<path d="M0,-30 C30,-48 52,-16 42,14 C34,40 12,46 0,36 C-12,46 -34,40 -42,14 C-52,-16 -30,-48 0,-30 Z" fill="#ff6b6b" ${st()}/><path d="M0,-30 q-2,-14 6,-20" fill="none" ${st(4, '#a0724e')}/>
     <path d="M6,-40 q16,-12 24,0 q-14,8 -24,0 Z" fill="#69db7c" ${st(2.5)}/>${face(0, 4, 1.1)}`,
  house: () =>
    `<path d="M-40,-4 L-40,44 L40,44 L40,-4" fill="#ffe8cc" ${st()}/><path d="M-52,0 L0,-44 L52,0 Z" fill="#ff6b6b" ${st()}/><rect x="-12" y="14" width="24" height="30" rx="4" fill="#a0724e" ${st(2.5)}/>
     <rect x="18" y="4" width="16" height="16" rx="2" fill="#d0ebff" ${st(2.5)}/><rect x="-34" y="4" width="16" height="16" rx="2" fill="#d0ebff" ${st(2.5)}/>`,
  clock: () =>
    `<circle cx="-30" cy="-36" r="12" fill="#ff6b6b" ${st()}/><circle cx="30" cy="-36" r="12" fill="#ff6b6b" ${st()}/><circle cx="0" cy="4" r="42" fill="#fff" ${st()}/>
     ${Array.from({ length: 12 }, (_, i) => {
       const a = (i * Math.PI) / 6;
       return `<circle cx="${f(Math.cos(a) * 34)}" cy="${f(4 + Math.sin(a) * 34)}" r="2.4" fill="#3a2420"/>`;
     }).join('')}<path d="M0,4 L0,-20 M0,4 L18,12" ${st(4)}/><circle cx="0" cy="4" r="4" fill="#3a2420"/>`,
  horse: () =>
    `<path d="M-30,46 L-30,-6 Q-30,-40 0,-44 Q30,-44 34,-20 L44,20 Q44,30 30,30 L14,14 L14,46 Z" fill="#c8915e" ${st()}/><path d="M-4,-44 Q-24,-50 -36,-30 Q-40,-6 -30,10 Q-34,-14 -18,-26" fill="#5a3c28" ${st(2.5)}/>
     <path d="M0,-44 L-6,-58 L8,-48 Z" fill="#c8915e" ${st(2.5)}/><ellipse cx="38" cy="22" rx="3" ry="2.4" fill="#3a2420"/>${face(10, -14, 0.9)}`,
  snake: () =>
    `<path d="M-46,30 Q-46,10 -20,14 Q8,18 8,0 Q8,-18 -16,-18 Q-30,-18 -30,-30 Q-30,-44 -6,-44 L22,-44" fill="none" ${st(24)}/><path d="M-46,30 Q-46,10 -20,14 Q8,18 8,0 Q8,-18 -16,-18 Q-30,-18 -30,-30 Q-30,-44 -6,-44 L22,-44" fill="none" stroke="#69db7c" stroke-width="18" stroke-linecap="round"/>
     <circle cx="30" cy="-40" r="18" fill="#69db7c" ${st()}/><path d="M46,-36 l10,0 l4,-4 M56,-36 l4,4" fill="none" ${st(2, '#ff6b6b')}/>${face(30, -42, 0.8)}`,
  mouse: () =>
    `<circle cx="-28" cy="-24" r="20" fill="#ced4da" ${st()}/><circle cx="28" cy="-24" r="20" fill="#ced4da" ${st()}/><circle cx="-28" cy="-24" r="11" fill="#fcc2d7"/><circle cx="28" cy="-24" r="11" fill="#fcc2d7"/>
     <ellipse cx="0" cy="10" rx="36" ry="32" fill="#ced4da" ${st()}/><circle cx="0" cy="18" r="5" fill="#f783ac"/>${face(0, 2, 1.2)}`,
  train: () =>
    `<rect x="-44" y="-20" width="60" height="50" rx="10" fill="#ff6b6b" ${st()}/><rect x="-40" y="-44" width="30" height="26" rx="6" fill="#f783ac" ${st()}/><rect x="14" y="0" width="34" height="30" rx="8" fill="#ff6b6b" ${st()}/>
     <rect x="-30" y="-56" width="12" height="14" rx="3" fill="#5a4a4a" ${st(2.5)}/><circle cx="-26" cy="36" r="11" fill="#5a4a4a" ${st()}/><circle cx="20" cy="36" r="11" fill="#5a4a4a" ${st()}/>${face(-14, 6, 0.9)}`,
  robot: () =>
    `<path d="M0,-40 L0,-52" ${st(3)}/><circle cx="0" cy="-54" r="5" fill="#ff6b6b" ${st(2)}/><rect x="-36" y="-40" width="72" height="56" rx="14" fill="#adb5bd" ${st()}/>
     <rect x="-28" y="-30" width="56" height="34" rx="10" fill="#d0ebff" ${st(2.5)}/><rect x="-26" y="18" width="52" height="30" rx="8" fill="#868e96" ${st()}/><circle cx="0" cy="32" r="6" fill="#ffd43b" ${st(2)}/>${face(0, -14, 1)}`,
  pizza: () =>
    `<path d="M0,46 L-44,-30 Q0,-50 44,-30 Z" fill="#ffd43b" ${st()}/><path d="M-44,-30 Q0,-50 44,-30 L40,-22 Q0,-40 -40,-22 Z" fill="#e8a25e" ${st(2.5)}/>
     <circle cx="-12" cy="-14" r="7" fill="#ff6b6b" ${st(2)}/><circle cx="14" cy="-10" r="7" fill="#ff6b6b" ${st(2)}/><circle cx="0" cy="16" r="7" fill="#ff6b6b" ${st(2)}/>${face(0, -2, 0.7)}`,
  cloud: () =>
    `<path d="M-44,26 Q-58,4 -36,-4 Q-36,-34 -6,-28 Q10,-48 30,-26 Q54,-24 46,4 Q58,26 36,30 Z" fill="#fff" ${st()}/>${face(0, 4, 1.1)}`,
  rocket: () =>
    `<path d="M-14,26 L-30,40 L-22,10 Z M14,26 L30,40 L22,10 Z" fill="#ff6b6b" ${st()}/><path d="M0,-50 Q24,-26 18,30 L-18,30 Q-24,-26 0,-50 Z" fill="#e9ecef" ${st()}/>
     <circle cx="0" cy="-6" r="11" fill="#74c0fc" ${st(2.5)}/><path d="M-10,30 L0,52 L10,30 Z" fill="#ffa94d" ${st(2)}/>${face(0, 14, 0.6)}`,
  flower: () =>
    `<path d="M0,10 L0,50" ${st(5, '#40c057')}/><path d="M0,34 q-22,-4 -24,8 q14,6 24,-8 Z" fill="#69db7c" ${st(2.5)}/>` +
    Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 3;
      return `<circle cx="${f(Math.cos(a) * 24)}" cy="${f(-10 + Math.sin(a) * 24)}" r="16" fill="#f783ac" ${st(2.5)}/>`;
    }).join('') +
    `<circle cx="0" cy="-10" r="17" fill="#ffd43b" ${st(2.5)}/>${face(0, -10, 0.8)}`,
};

// ---------------------------------------------------------------- dancers

/** Arms per pose: idle down at the sides, happy up, oops hands to cheeks. */
function arms(pose, colour, y = 120, spread = 48) {
  const L =
    pose === 1
      ? `M${-spread + 10},${y} q-18,-30 -14,-56`
      : pose === 2
        ? `M${-spread + 10},${y} q-6,-24 14,-34`
        : `M${-spread + 10},${y} q-14,16 -10,34`;
  const mirror = (d) => {
    let k = 0;
    return d.replace(/-?\d+(\.\d+)?/g, (m) => (k++ % 2 === 0 ? String(-Number(m)) : m));
  };
  return `<path d="${L}" fill="none" ${st(16)}/><path d="${L}" fill="none" stroke="${colour}" stroke-width="10" stroke-linecap="round"/>
    <path d="${mirror(L)}" fill="none" ${st(16)}/><path d="${mirror(L)}" fill="none" stroke="${colour}" stroke-width="10" stroke-linecap="round"/>`;
}

const mood = (pose) => (pose === 1 ? 'happy' : pose === 2 ? 'oops' : 'smile');
/** Two eyes at x ±d, y (pupils, or happy arcs), for dancers with their own eye whites. */
const eyes = (d, y, r, pose) =>
  [-1, 1]
    .map((k) =>
      pose === 1
        ? `<path d="M${k * d - r * 0.6},${y + 2} q${r * 0.6},${-r * 0.8} ${r * 1.2},0" fill="none" ${st(3)}/>`
        : `<circle cx="${k * d}" cy="${y + 1}" r="${r * 0.5}" fill="#2a1a17"/><circle cx="${k * d - r * 0.18}" cy="${y - r * 0.15}" r="${r * 0.18}" fill="#fff"/>`,
    )
    .join('');
/** A mouth `w` wide at y, by pose: a smile, an open happy mouth, an "Oh!". */
const mouth = (y, w, pose) =>
  pose === 1
    ? `<path d="M${-w},${y} q${w},${w * 1.4} ${2 * w},0 Z" fill="#c2414d" ${st(2)}/>`
    : pose === 2
      ? `<ellipse cx="0" cy="${y + w * 0.5}" rx="${w * 0.55}" ry="${w * 0.75}" fill="#c2414d" ${st(2)}/>`
      : `<path d="M${-w},${y} q${w},${w} ${2 * w},0" fill="none" ${st(2.5)}/>`;
/** A spiky ring around (cx, cy): `n` points between radius `r1` and `r2` (a hedgehog's back, a puffball). */
const spikes = (cx, cy, r1, r2, n) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    return `${f(cx + Math.cos(a) * r)},${f(cy + Math.sin(a) * r)}`;
  }).join(' ');
const sweat = (x, y) => `<path d="M${x},${y} q6,10 0,14 q-6,-4 0,-14 Z" fill="#74c0fc" ${st(1.5)}/>`;
const cheers = (pose) => (pose === 1 ? sparkle(-70, -40, 10, '#ffd43b') + sparkle(72, -54, 8, '#ff8fa3') : '');

/** One dancer (pose 0 idle, 1 happy, 2 oops), drawn around (0, 0) with its feet near y 108. */
function dancerArt(name, pose) {
  const m = mood(pose);
  const o = pose === 2 ? sweat(40, -30) : '';
  switch (name) {
    case 'unicorn':
      return `${arms(pose, '#fff', 40)}<ellipse cx="0" cy="60" rx="44" ry="46" fill="#fff" ${st()}/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <path d="M-50,-34 q-30,40 -6,70 q4,-30 20,-46 Z" fill="#b197fc" ${st(2.5)}/><path d="M-44,-40 q-20,30 -2,58" fill="none" stroke="#f783ac" stroke-width="6"/>
        <ellipse cx="0" cy="-20" rx="50" ry="44" fill="#fff" ${st()}/><path d="M-6,-62 L0,-100 L8,-62 Z" fill="#ffd43b" ${st(2.5)}/><path d="M-3,-74 l9,-3 M-1,-86 l7,-2" ${st(1.5)}/>
        <path d="M-40,-50 L-34,-74 L-20,-56 Z M40,-50 L34,-74 L20,-56 Z" fill="#fff" ${st()}/>${face(0, -16, 1.6, m)}${o}${cheers(pose)}`;
    case 'dragon':
      return `<path d="M30,70 q50,10 52,-24 q-10,6 -20,0" fill="#69db7c" ${st()}/><path d="M-36,0 q-50,-30 -56,10 q24,-10 30,14 Z M36,0 q50,-30 56,10 q-24,-10 -30,14 Z" fill="#b2f2bb" ${st()}/>
        ${arms(pose, '#69db7c', 40)}<ellipse cx="0" cy="60" rx="44" ry="46" fill="#69db7c" ${st()}/><ellipse cx="0" cy="68" rx="26" ry="30" fill="#fff3bf"/>
        <path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/><ellipse cx="0" cy="-20" rx="50" ry="44" fill="#69db7c" ${st()}/>
        <path d="M-26,-60 L-20,-84 L-10,-62 Z M26,-60 L20,-84 L10,-62 Z" fill="#ffd43b" ${st(2.5)}/><path d="M-6,-64 l6,-10 l6,10" fill="#40c057" ${st(2)}/>${face(0, -16, 1.6, m)}${o}${cheers(pose)}`;
    case 'bunny':
      return `${arms(pose, '#fff', 40)}<ellipse cx="0" cy="60" rx="42" ry="46" fill="#fff" ${st()}/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <ellipse cx="-22" cy="-74" rx="14" ry="40" fill="#fff" ${st()}/><ellipse cx="22" cy="-74" rx="14" ry="40" fill="#fff" ${st()}/><ellipse cx="-22" cy="-74" rx="6" ry="28" fill="#fcc2d7"/><ellipse cx="22" cy="-74" rx="6" ry="28" fill="#fcc2d7"/>
        <ellipse cx="0" cy="-16" rx="50" ry="42" fill="#fff" ${st()}/>${face(0, -12, 1.6, m)}${o}${cheers(pose)}`;
    case 'kitten':
      return `<path d="M36,80 q44,0 40,-40" fill="none" ${st(16)}/><path d="M36,80 q44,0 40,-40" fill="none" stroke="#ffa94d" stroke-width="10" stroke-linecap="round"/>
        ${arms(pose, '#ffa94d', 40)}<ellipse cx="0" cy="60" rx="42" ry="46" fill="#ffa94d" ${st()}/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <path d="M-46,-40 L-40,-78 L-16,-56 Z M46,-40 L40,-78 L16,-56 Z" fill="#ffa94d" ${st()}/><ellipse cx="0" cy="-18" rx="52" ry="42" fill="#ffa94d" ${st()}/>
        <path d="M-54,-10 h-16 M-54,-2 h-14 M54,-10 h16 M54,-2 h14" ${st(2)}/>${face(0, -14, 1.6, m)}${o}${cheers(pose)}`;
    case 'panda':
      return `${arms(pose, '#3a2420', 40)}<ellipse cx="0" cy="60" rx="44" ry="46" fill="#fff" ${st()}/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <circle cx="-38" cy="-56" r="16" fill="#3a2420"/><circle cx="38" cy="-56" r="16" fill="#3a2420"/><ellipse cx="0" cy="-18" rx="52" ry="44" fill="#fff" ${st()}/>
        <ellipse cx="-18" cy="-18" rx="13" ry="16" fill="#3a2420" transform="rotate(-20 -18 -18)"/><ellipse cx="18" cy="-18" rx="13" ry="16" fill="#3a2420" transform="rotate(20 18 -18)"/>${face(
          0,
          -16,
          1.6,
          m,
          '#2a1a17',
        )
          .replace(/fill="#2a1a17"/g, 'fill="#fff"')
          .replace(/fill="#fff" ?\/>(?=<\/?)/, 'fill="#fff"/>')}${o}${cheers(pose)}`;
    case 'yeti':
      return `${arms(pose, '#e7f5ff', 40)}<ellipse cx="0" cy="56" rx="48" ry="52" fill="#e7f5ff" ${st()}/><path d="M-22,104 l0,6 M22,104 l0,6" ${st(14)}/>
        <path d="M-50,-10 q-8,-30 10,-50 q-4,-20 22,-22 q14,-12 36,0 q26,2 22,22 q18,20 10,50 Z" fill="#e7f5ff" ${st()}/><ellipse cx="0" cy="-12" rx="34" ry="28" fill="#a5d8ff" ${st(2.5)}/>
        <path d="M-10,-58 l4,-12 l6,10 l6,-12 l4,12" fill="none" ${st(2.5)}/>${face(0, -14, 1.5, m)}${o}${cheers(pose)}`;
    // ---- cosmos
    case 'blip':
      return `${arms(pose, '#8ce99a', 40)}<path d="M-44,104 Q-50,10 0,6 Q50,10 44,104 Z" fill="#8ce99a" ${st()}/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <path d="M0,-56 L0,-90" ${st(4)}/><circle cx="0" cy="-94" r="9" fill="#ffd43b" ${st(2.5)}/><ellipse cx="0" cy="-16" rx="52" ry="44" fill="#8ce99a" ${st()}/>
        ${pose === 1 ? `<path d="M-18,-22 q18,-22 36,0" fill="none" ${st(4)}/>` : `<circle cx="0" cy="-22" r="18" fill="#fff" ${st(2.5)}/><circle cx="0" cy="-20" r="9" fill="#2a1a17"/><circle cx="-3" cy="-24" r="3" fill="#fff"/>`}
        ${pose === 2 ? `<ellipse cx="0" cy="10" rx="6" ry="8" fill="#c2414d" ${st(1.5)}/>` : `<path d="M-12,4 q12,12 24,0" fill="${pose === 1 ? '#c2414d' : 'none'}" ${st(2.5)}/>`}
        <ellipse cx="-30" cy="0" rx="7" ry="4" fill="${BLUSH}" opacity="0.8"/><ellipse cx="30" cy="0" rx="7" ry="4" fill="${BLUSH}" opacity="0.8"/>${o}${cheers(pose)}`;
    case 'zorp':
      return `${[-30, -10, 10, 30].map((x) => `<path d="M${x},90 q${x / 3},20 ${x / 2},22" fill="none" ${st(14)}/><path d="M${x},90 q${x / 3},20 ${x / 2},22" fill="none" stroke="#b197fc" stroke-width="8" stroke-linecap="round"/>`).join('')}
        ${arms(pose, '#b197fc', 30)}<ellipse cx="0" cy="54" rx="44" ry="42" fill="#b197fc" ${st()}/><path d="M-30,-50 q-20,-30 -30,-30 M30,-50 q20,-30 30,-30" fill="none" ${st(4)}/>
        <circle cx="-60" cy="-80" r="8" fill="#63e6be" ${st(2)}/><circle cx="60" cy="-80" r="8" fill="#63e6be" ${st(2)}/><ellipse cx="0" cy="-16" rx="54" ry="44" fill="#b197fc" ${st()}/>${face(0, -16, 1.7, m)}${o}${cheers(pose)}`;
    case 'goo':
      return `${arms(pose, '#faa2c1', 40)}<path d="M-56,108 Q-60,30 -40,-20 Q-30,-70 0,-70 Q30,-70 40,-20 Q60,30 56,108 Q40,96 28,108 Q14,96 0,108 Q-14,96 -28,108 Q-40,96 -56,108 Z" fill="#faa2c1" ${st()}/>
        <circle cx="-22" cy="-8" r="16" fill="#fff" ${st(2.5)}/><circle cx="22" cy="-8" r="16" fill="#fff" ${st(2.5)}/><circle cx="0" cy="-40" r="12" fill="#fff" ${st(2.5)}/>
        ${pose === 1 ? `<path d="M-30,-8 q8,-10 16,0 M14,-8 q8,-10 16,0 M-6,-40 q6,-8 12,0" fill="none" ${st(3)}/>` : `<circle cx="-22" cy="-6" r="7" fill="#2a1a17"/><circle cx="22" cy="-6" r="7" fill="#2a1a17"/><circle cx="0" cy="-38" r="5" fill="#2a1a17"/>`}
        ${pose === 2 ? `<ellipse cx="0" cy="26" rx="7" ry="9" fill="#c2414d" ${st(1.5)}/>` : `<path d="M-14,20 q14,16 28,0" fill="${pose === 1 ? '#c2414d' : 'none'}" ${st(2.5)}/>`}${o}${cheers(pose)}`;
    case 'boxbot':
      return `${arms(pose, '#adb5bd', 40, 52)}<rect x="-46" y="20" width="92" height="80" rx="12" fill="#adb5bd" ${st()}/><rect x="-30" y="36" width="60" height="30" rx="6" fill="#495057" ${st(2.5)}/>
        <circle cx="-16" cy="51" r="5" fill="#ff6b6b"/><circle cx="0" cy="51" r="5" fill="#ffd43b"/><circle cx="16" cy="51" r="5" fill="#69db7c"/><path d="M-24,100 l0,10 M24,100 l0,10" ${st(14)}/>
        <path d="M0,-64 L0,-88" ${st(4)}/><circle cx="0" cy="-92" r="8" fill="#ff6b6b" ${st(2.5)}/><rect x="-54" y="-64" width="108" height="80" rx="16" fill="#ced4da" ${st()}/>
        <rect x="-42" y="-52" width="84" height="56" rx="12" fill="#d0ebff" ${st(2.5)}/>${face(0, -28, 1.5, m)}${o}${cheers(pose)}`;
    case 'domebot':
      return `${arms(pose, '#ffa94d', 40)}<path d="M-44,104 L-40,30 Q0,14 40,30 L44,104 Z" fill="#ffa94d" ${st()}/><circle cx="0" cy="64" r="12" fill="#ffd43b" ${st(2.5)}/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <ellipse cx="0" cy="-4" rx="60" ry="16" fill="#868e96" ${st()}/><path d="M-50,-8 Q-50,-80 0,-80 Q50,-80 50,-8 Z" fill="#a5d8ff" fill-opacity="0.85" ${st()}/>
        <circle cx="0" cy="-34" r="30" fill="#fff4e6" ${st(2.5)}/>${face(0, -34, 1.1, m)}<path d="M-30,-66 q10,-6 18,-4" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>${o}${cheers(pose)}`;
    case 'tallbot':
      return `${arms(pose, '#63e6be', 20, 40)}<rect x="-34" y="0" width="68" height="100" rx="14" fill="#63e6be" ${st()}/><path d="M-16,100 l0,10 M16,100 l0,10" ${st(14)}/>
        <rect x="-20" y="24" width="40" height="12" rx="6" fill="#0ca678" ${st(2)}/><rect x="-20" y="46" width="40" height="12" rx="6" fill="#0ca678" ${st(2)}/>
        <rect x="-44" y="-90" width="88" height="86" rx="20" fill="#e9ecef" ${st()}/><rect x="-34" y="-78" width="68" height="60" rx="14" fill="#212529" ${st(2.5)}/>
        ${face(0, -50, 1.4, m, '#63e6be').replace(/#c2414d/g, '#63e6be')}${o}${cheers(pose)}`;
    case 'puppy':
      return `${arms(pose, '#e8c39e', 40)}<ellipse cx="0" cy="60" rx="42" ry="46" fill="#e8c39e" ${st()}/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <ellipse cx="18" cy="70" rx="12" ry="10" fill="#c8915e"/>
        <ellipse cx="-50" cy="-12" rx="15" ry="32" fill="#a0724e" ${st()} transform="rotate(16 -50 -12)"/><ellipse cx="50" cy="-12" rx="15" ry="32" fill="#a0724e" ${st()} transform="rotate(-16 50 -12)"/>
        <ellipse cx="0" cy="-18" rx="50" ry="44" fill="#e8c39e" ${st()}/><ellipse cx="0" cy="0" rx="18" ry="12" fill="#fff4e6"/><ellipse cx="0" cy="-4" rx="7" ry="5" fill="#3a2420"/>${face(0, -20, 1.5, m)}${o}${cheers(pose)}`;
    case 'fox':
      return `<path d="M34,86 q60,-6 52,-60 q-18,20 -40,22" fill="#ff922b" ${st()}/><path d="M78,40 q8,-10 8,-14 q-10,6 -16,4 Z" fill="#fff"/>
        ${arms(pose, '#ff922b', 40)}<ellipse cx="0" cy="60" rx="40" ry="46" fill="#ff922b" ${st()}/><ellipse cx="0" cy="70" rx="22" ry="28" fill="#fff4e6"/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <path d="M-48,-34 L-40,-84 L-12,-56 Z M48,-34 L40,-84 L12,-56 Z" fill="#ff922b" ${st()}/><path d="M-40,-44 L-37,-70 L-22,-55 Z M40,-44 L37,-70 L22,-55 Z" fill="#fff4e6"/>
        <path d="M-56,-20 Q-50,30 0,34 Q50,30 56,-20 Q30,-62 0,-58 Q-30,-62 -56,-20 Z" fill="#ff922b" ${st()}/><path d="M-36,4 Q-14,8 0,32 Q14,8 36,4 Q24,28 0,34 Q-24,28 -36,4 Z" fill="#fff4e6"/>
        <circle cx="0" cy="22" r="5" fill="#3a2420"/>${face(0, -12, 1.5, m)}${o}${cheers(pose)}`;
    case 'pegasus':
      return `<path d="M-34,10 q-46,-34 -54,8 q22,-8 28,8 q-18,0 -20,14 q18,-6 32,0 Z M34,10 q46,-34 54,8 q-22,-8 -28,8 q18,0 20,14 q-18,-6 -32,0 Z" fill="#fff" ${st()}/>
        ${arms(pose, '#e5dbff', 40)}<ellipse cx="0" cy="60" rx="42" ry="46" fill="#e5dbff" ${st()}/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <path d="M-42,-46 q-14,-30 6,-44 q-4,22 12,24 q-6,-26 18,-30 q-4,20 10,22 q4,-22 26,-18 q-12,14 -2,26 Z" fill="#74c0fc" ${st(2.5)}/>
        <ellipse cx="0" cy="-18" rx="50" ry="44" fill="#e5dbff" ${st()}/><path d="M-40,-48 L-32,-72 L-20,-54 Z M40,-48 L32,-72 L20,-54 Z" fill="#e5dbff" ${st()}/>${face(0, -14, 1.6, m)}${o}${cheers(pose)}`;
    case 'phoenix':
      return `<path d="M-30,30 q-56,-30 -64,20 q20,-4 28,10 q-18,6 -18,22 q24,-14 54,-14 Z M30,30 q56,-30 64,20 q-20,-4 -28,10 q18,6 18,22 q-24,-14 -54,-14 Z" fill="#ffa94d" ${st()}/>
        <ellipse cx="0" cy="38" rx="56" ry="68" fill="#ff6b6b" ${st()}/><ellipse cx="0" cy="56" rx="32" ry="40" fill="#ffd43b"/><path d="M-20,104 l0,6 M20,104 l0,6" stroke="#ffa94d" stroke-width="10" stroke-linecap="round"/>
        <path d="M-20,-30 q-10,-40 6,-52 q0,24 14,26 q-2,-30 18,-40 q-2,28 10,34 q12,-14 22,-6 q-20,14 -14,38 Z" fill="#ffa94d" ${st(2.5)}/><path d="M-6,-6 L0,6 L6,-6 Z" fill="#ffd43b" ${st(2)}/>
        ${face(0, -12, 1.5, m)}${o}${cheers(pose)}`;
    case 'cyclops':
      return `${arms(pose, '#ffa94d', 30)}<ellipse cx="0" cy="34" rx="58" ry="72" fill="#ffa94d" ${st()}/><path d="M-22,104 l0,6 M22,104 l0,6" ${st(14)}/>
        <path d="M-30,-30 L-40,-56 L-18,-38 Z M30,-30 L40,-56 L18,-38 Z" fill="#fff4e6" ${st(2.5)}/>
        ${pose === 1 ? `<path d="M-22,0 q22,-26 44,0" fill="none" ${st(5)}/>` : `<circle cx="0" cy="0" r="26" fill="#fff" ${st(3)}/><circle cx="0" cy="2" r="13" fill="#2a1a17"/><circle cx="-5" cy="-4" r="4.5" fill="#fff"/>`}
        ${pose === 2 ? `<ellipse cx="0" cy="44" rx="8" ry="10" fill="#c2414d" ${st(2)}/>` : `<path d="M-18,38 q18,18 36,0" fill="${pose === 1 ? '#c2414d' : 'none'}" ${st(3)}/>`}
        <ellipse cx="-38" cy="26" rx="8" ry="5" fill="${BLUSH}" opacity="0.8"/><ellipse cx="38" cy="26" rx="8" ry="5" fill="${BLUSH}" opacity="0.8"/>${o}${cheers(pose)}`;
    case 'jelly':
      return `${[-36, -18, 0, 18, 36].map((x, i) => `<path d="M${x},20 q${i % 2 ? 10 : -10},30 0,${60 + (i % 2) * 18} q${i % 2 ? -10 : 10},10 0,20" fill="none" ${st(10)}/><path d="M${x},20 q${i % 2 ? 10 : -10},30 0,${60 + (i % 2) * 18} q${i % 2 ? -10 : 10},10 0,20" fill="none" stroke="#99e9f2" stroke-width="5" stroke-linecap="round"/>`).join('')}
        <path d="M-58,24 Q-62,-70 0,-72 Q62,-70 58,24 Q40,16 30,26 Q14,14 0,26 Q-14,14 -30,26 Q-40,16 -58,24 Z" fill="#66d9e8" fill-opacity="0.9" ${st()}/>
        <path d="M0,-72 L0,-94" ${st(3)}/><circle cx="0" cy="-98" r="7" fill="#f783ac" ${st(2)}/>
        ${pose === 1 ? sparkle(-70, -40, 10, '#ffd43b') + sparkle(70, -50, 8, '#f783ac') : ''}${face(0, -22, 1.6, m)}${o}`;
    case 'dronebot':
      return `<path d="M-50,-78 L50,-78" ${st(8)}/><path d="M-50,-78 L50,-78" stroke="#ced4da" stroke-width="4" stroke-linecap="round"/><rect x="-6" y="-80" width="12" height="20" fill="#868e96" ${st(2)}/>
        ${arms(pose, '#adb5bd', 10, 56)}<circle cx="0" cy="0" r="60" fill="#e9ecef" ${st()}/><circle cx="0" cy="-4" r="42" fill="#212529" ${st(2.5)}/>
        ${face(0, -6, 1.5, m, '#63e6be').replace(/#c2414d/g, '#63e6be')}
        <path d="M-24,70 l-6,22 M0,70 l0,26 M24,70 l6,22" stroke="#74c0fc" stroke-width="6" stroke-linecap="round" opacity="0.7"/><path d="M-36,52 Q0,74 36,52" fill="#ced4da" ${st()}/>${o}${cheers(pose)}`;
    case 'roverbot':
      return `${arms(pose, '#ffd43b', 20, 52)}<rect x="-56" y="0" width="112" height="66" rx="16" fill="#ffd43b" ${st()}/><rect x="-38" y="16" width="76" height="22" rx="8" fill="#495057" ${st(2)}/>
        <circle cx="-22" cy="27" r="5" fill="#63e6be"/><circle cx="0" cy="27" r="5" fill="#ff8787"/><circle cx="22" cy="27" r="5" fill="#74c0fc"/>
        ${[-38, 0, 38].map((x) => `<circle cx="${x}" cy="88" r="18" fill="#495057" ${st()}/><circle cx="${x}" cy="88" r="7" fill="#ced4da"/>`).join('')}
        <path d="M0,0 L0,-26" ${st(8)}/><rect x="-46" y="-96" width="92" height="72" rx="20" fill="#e9ecef" ${st()}/><rect x="-36" y="-86" width="72" height="52" rx="14" fill="#d0ebff" ${st(2.5)}/>
        ${face(0, -60, 1.4, m)}${o}${cheers(pose)}`;
    // ---- sprint 2.16, more dancers (owner: "we need a lot more variety")
    case 'owl':
      return `${arms(pose, '#8b5e3c', 30, 58)}<ellipse cx="0" cy="22" rx="60" ry="88" fill="#a9744f" ${st()}/><ellipse cx="0" cy="58" rx="36" ry="46" fill="#ffe8cc"/>
        <path d="M-16,46 q5,7 10,0 M6,46 q5,7 10,0 M-16,66 q5,7 10,0 M6,66 q5,7 10,0" fill="none" stroke="#d9a066" stroke-width="3"/>
        <path d="M-20,106 l0,6 M20,106 l0,6" stroke="#ffa94d" stroke-width="10" stroke-linecap="round"/>
        <path d="M-50,-40 L-46,-82 L-22,-58 Z M50,-40 L46,-82 L22,-58 Z" fill="#a9744f" ${st()}/>
        <circle cx="-22" cy="-16" r="22" fill="#fff4e6" ${st(2.5)}/><circle cx="22" cy="-16" r="22" fill="#fff4e6" ${st(2.5)}/>${face(0, -16, 2.4, m)}${o}${cheers(pose)}`;
    case 'penguin':
      return `${arms(pose, '#343a40', 30, 56)}<ellipse cx="0" cy="26" rx="56" ry="84" fill="#343a40" ${st()}/><ellipse cx="0" cy="44" rx="38" ry="60" fill="#fff"/>
        <ellipse cx="0" cy="-22" rx="38" ry="32" fill="#fff"/><ellipse cx="-20" cy="108" rx="16" ry="7" fill="#ffa94d" ${st(2.5)}/><ellipse cx="20" cy="108" rx="16" ry="7" fill="#ffa94d" ${st(2.5)}/>
        <path d="M-44,8 Q0,26 44,8 L44,20 Q0,38 -44,20 Z" fill="#ff6b6b" ${st(2.5)}/><path d="M22,22 l6,30 l12,-4 l-6,-28 Z" fill="#ff6b6b" ${st(2.5)}/>${face(0, -22, 1.6, m)}${o}${cheers(pose)}`;
    case 'koala':
      return `${arms(pose, '#adb5bd', 40)}<ellipse cx="0" cy="60" rx="42" ry="46" fill="#adb5bd" ${st()}/><ellipse cx="0" cy="68" rx="24" ry="28" fill="#e9ecef"/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <circle cx="-50" cy="-40" r="28" fill="#adb5bd" ${st()}/><circle cx="50" cy="-40" r="28" fill="#adb5bd" ${st()}/><circle cx="-50" cy="-40" r="16" fill="#fcc2d7"/><circle cx="50" cy="-40" r="16" fill="#fcc2d7"/>
        <ellipse cx="0" cy="-16" rx="52" ry="44" fill="#adb5bd" ${st()}/>${face(0, -26, 1.5, m)}<ellipse cx="0" cy="-8" rx="11" ry="13" fill="#3a2420"/>${mouth(10, 7, pose)}${o}${cheers(pose)}`;
    case 'frog':
      return `${arms(pose, '#69db7c', 40)}<ellipse cx="0" cy="62" rx="46" ry="44" fill="#69db7c" ${st()}/><ellipse cx="0" cy="68" rx="28" ry="28" fill="#e6fcf5"/>
        <path d="M-34,106 q-10,4 -16,0 M34,106 q10,4 16,0" ${st(10)}/><path d="M-34,106 q-10,4 -16,0 M34,106 q10,4 16,0" stroke="#69db7c" stroke-width="5" stroke-linecap="round"/>
        <circle cx="-30" cy="-44" r="22" fill="#69db7c" ${st()}/><circle cx="30" cy="-44" r="22" fill="#69db7c" ${st()}/><ellipse cx="0" cy="-8" rx="62" ry="40" fill="#69db7c" ${st()}/>
        <circle cx="-30" cy="-46" r="14" fill="#fff" ${st(2)}/><circle cx="30" cy="-46" r="14" fill="#fff" ${st(2)}/>${eyes(30, -46, 14, pose)}${mouth(2, 16, pose)}
        <ellipse cx="-42" cy="-2" rx="8" ry="5" fill="${BLUSH}" opacity="0.8"/><ellipse cx="42" cy="-2" rx="8" ry="5" fill="${BLUSH}" opacity="0.8"/>${o}${cheers(pose)}`;
    case 'hedgehog':
      return `<polygon points="${spikes(0, 0, 76, 58, 22)}" fill="#8d6e63" ${st()}/>${arms(pose, '#ffe8cc', 40)}<ellipse cx="0" cy="62" rx="42" ry="44" fill="#ffe8cc" ${st()}/>
        <path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/><ellipse cx="0" cy="-10" rx="46" ry="40" fill="#ffe8cc" ${st()}/><circle cx="-34" cy="-44" r="10" fill="#ffe8cc" ${st(2.5)}/><circle cx="34" cy="-44" r="10" fill="#ffe8cc" ${st(2.5)}/>
        ${face(0, -10, 1.5, m)}<circle cx="0" cy="-2" r="4" fill="#3a2420"/>${o}${cheers(pose)}`;
    case 'lamb':
      return `${arms(pose, '#495057', 40)}${[
        [-30, 50],
        [0, 40],
        [30, 50],
        [-34, 78],
        [0, 86],
        [34, 78],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="26" fill="#fff" ${st(2.5)}/>`)
        .join('')}<path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <ellipse cx="-52" cy="-14" rx="22" ry="10" fill="#ffe8cc" ${st(2.5)} transform="rotate(20 -52 -14)"/><ellipse cx="52" cy="-14" rx="22" ry="10" fill="#ffe8cc" ${st(2.5)} transform="rotate(-20 52 -14)"/>
        <ellipse cx="0" cy="-14" rx="42" ry="40" fill="#fff4e6" ${st()}/>${[-22, 0, 22].map((x) => `<circle cx="${x}" cy="${x === 0 ? -56 : -50}" r="18" fill="#fff" ${st(2.5)}/>`).join('')}
        ${face(0, -10, 1.5, m)}${o}${cheers(pose)}`;
    case 'raccoon':
      return `<ellipse cx="62" cy="58" rx="16" ry="42" fill="#868e96" ${st()} transform="rotate(-34 62 58)"/><ellipse cx="80" cy="30" rx="10" ry="12" fill="#495057" transform="rotate(-34 80 30)"/>
        ${arms(pose, '#868e96', 40)}<ellipse cx="0" cy="60" rx="42" ry="46" fill="#868e96" ${st()}/><ellipse cx="0" cy="68" rx="24" ry="28" fill="#dee2e6"/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <path d="M-48,-36 L-40,-76 L-16,-54 Z M48,-36 L40,-76 L16,-54 Z" fill="#868e96" ${st()}/><ellipse cx="0" cy="-16" rx="52" ry="44" fill="#868e96" ${st()}/>
        <path d="M-48,-26 Q0,-8 48,-26 Q52,0 22,-2 Q0,-10 -22,-2 Q-52,0 -48,-26 Z" fill="#343a40"/><ellipse cx="0" cy="-2" rx="22" ry="16" fill="#f1f3f5"/>
        <circle cx="-14.4" cy="-16" r="9" fill="#fff"/><circle cx="14.4" cy="-16" r="9" fill="#fff"/>${face(0, -16, 1.6, m)}<circle cx="0" cy="-12" r="3.5" fill="#3a2420"/>${o}${cheers(pose)}`;
    case 'tiger':
      return `<path d="M36,80 q44,0 40,-40" fill="none" ${st(16)}/><path d="M36,80 q44,0 40,-40" fill="none" stroke="#ff922b" stroke-width="10" stroke-linecap="round"/><path d="M70,56 l10,2 M74,44 l10,-2" ${st(4)}/>
        ${arms(pose, '#ff922b', 40)}<ellipse cx="0" cy="60" rx="42" ry="46" fill="#ff922b" ${st()}/><ellipse cx="0" cy="70" rx="22" ry="28" fill="#fff4e6"/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        <path d="M-40,40 l12,6 M40,40 l-12,6 M-42,62 l12,4 M42,62 l-12,4" ${st(5)}/>
        <circle cx="-40" cy="-54" r="16" fill="#ff922b" ${st()}/><circle cx="40" cy="-54" r="16" fill="#ff922b" ${st()}/><circle cx="-40" cy="-54" r="8" fill="#fff4e6"/><circle cx="40" cy="-54" r="8" fill="#fff4e6"/>
        <ellipse cx="0" cy="-18" rx="52" ry="44" fill="#ff922b" ${st()}/><path d="M-8,-60 l4,12 M0,-62 l0,14 M8,-60 l-4,12 M-52,-14 l12,2 M-52,-4 l12,0 M52,-14 l-12,2 M52,-4 l-12,0" ${st(4)}/>
        <ellipse cx="0" cy="-4" rx="22" ry="13" fill="#fff4e6"/>${face(0, -18, 1.5, m)}<path d="M-4,-14 L4,-14 L0,-10 Z" fill="#3a2420"/>${o}${cheers(pose)}`;
    case 'narwhal':
      return `<path d="M54,70 q36,-10 42,-36 q-16,10 -26,4 q4,16 -16,30 Z" fill="#74c0fc" ${st()}/>${arms(pose, '#74c0fc', 30, 60)}
        <path d="M-62,104 Q-72,-30 0,-50 Q72,-30 62,104 Q0,118 -62,104 Z" fill="#a5d8ff" ${st()}/><path d="M-40,100 Q-46,30 0,24 Q46,30 40,100 Q0,110 -40,100 Z" fill="#e7f5ff"/>
        <path d="M-7,-48 L0,-106 L7,-48 Z" fill="#fff3bf" ${st(2.5)}/><path d="M-5,-62 l10,-4 M-3,-76 l7,-3 M-2,-90 l4,-2" ${st(1.5)}/>
        <circle cx="-30" cy="40" r="5" fill="#74c0fc"/><circle cx="26" cy="56" r="4" fill="#74c0fc"/><circle cx="-12" cy="72" r="3.5" fill="#74c0fc"/>${face(0, -6, 1.7, m)}${o}${cheers(pose)}`;
    case 'fairymouse':
      return `<ellipse cx="-50" cy="10" rx="34" ry="22" fill="#d0ebff" fill-opacity="0.85" ${st(2.5)} transform="rotate(-30 -50 10)"/><ellipse cx="50" cy="10" rx="34" ry="22" fill="#d0ebff" fill-opacity="0.85" ${st(2.5)} transform="rotate(30 50 10)"/>
        ${sparkle(-80, -14, 8, '#ffd43b')}${sparkle(80, -14, 8, '#f783ac')}<path d="M30,96 q40,10 34,-24 q-4,-14 -16,-8" fill="none" ${st(5)}/>
        ${arms(pose, '#dee2e6', 40)}<ellipse cx="0" cy="62" rx="38" ry="44" fill="#dee2e6" ${st()}/><ellipse cx="0" cy="70" rx="20" ry="26" fill="#fff0f6"/><path d="M-18,104 l0,6 M18,104 l0,6" ${st(14)}/>
        <circle cx="-42" cy="-50" r="26" fill="#dee2e6" ${st()}/><circle cx="42" cy="-50" r="26" fill="#dee2e6" ${st()}/><circle cx="-42" cy="-50" r="15" fill="#fcc2d7"/><circle cx="42" cy="-50" r="15" fill="#fcc2d7"/>
        <ellipse cx="0" cy="-12" rx="46" ry="40" fill="#dee2e6" ${st()}/><path d="M-30,-2 h-24 M-30,6 h-22 M30,-2 h24 M30,6 h22" ${st(1.8)}/>${face(0, -12, 1.5, m)}<circle cx="0" cy="-4" r="4" fill="#f783ac"/>${o}${cheers(pose)}`;
    case 'stalky':
      return `${[-1, 0, 1].map((k) => `<path d="M${k * 22},${k === 0 ? -6 : 0} L${k * 36},${k === 0 ? -74 : -56}" ${st(8)}/><path d="M${k * 22},${k === 0 ? -6 : 0} L${k * 36},${k === 0 ? -74 : -56}" stroke="#74c0fc" stroke-width="4" stroke-linecap="round"/>`).join('')}
        ${arms(pose, '#74c0fc', 56, 52)}<path d="M-52,108 Q-60,-6 0,-12 Q60,-6 52,108 Z" fill="#74c0fc" ${st()}/><path d="M-22,108 l0,4 M22,108 l0,4" ${st(12)}/>
        ${[
          [-36, -56],
          [0, -74],
          [36, -56],
        ]
          .map(
            ([x, y]) =>
              `<circle cx="${x}" cy="${y}" r="15" fill="#fff" ${st(2.5)}/>${pose === 1 ? `<path d="M${x - 8},${y + 2} q8,-10 16,0" fill="none" ${st(3)}/>` : `<circle cx="${x}" cy="${y + 1}" r="7" fill="#2a1a17"/><circle cx="${x - 2.5}" cy="${y - 2}" r="2.5" fill="#fff"/>`}`,
          )
          .join('')}${mouth(36, 14, pose)}
        <ellipse cx="-30" cy="48" rx="8" ry="5" fill="${BLUSH}" opacity="0.8"/><ellipse cx="30" cy="48" rx="8" ry="5" fill="${BLUSH}" opacity="0.8"/>${o}${cheers(pose)}`;
    case 'shroom':
      return `${arms(pose, '#fff4e6', 60, 46)}<ellipse cx="0" cy="58" rx="38" ry="50" fill="#fff4e6" ${st()}/><path d="M-18,104 l0,6 M18,104 l0,6" ${st(14)}/>
        <path d="M-84,-6 Q-80,-100 0,-102 Q80,-100 84,-6 Q0,12 -84,-6 Z" fill="#b197fc" ${st()}/>
        ${[
          [-44, -48, 13],
          [0, -78, 15],
          [44, -44, 12],
          [-14, -36, 8],
          [26, -72, 8],
          [-50, -20, 6],
        ]
          .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#63e6be" ${st(2)}/>`)
          .join('')}${face(0, 30, 1.6, m)}${o}${cheers(pose)}`;
    case 'starry':
      return `${arms(pose, '#ffd43b', 50, 40)}<polygon points="${star5(92, 0.55, 0, 26)}" fill="#ffd43b" ${st()}/><path d="M-22,96 l-4,12 M22,96 l4,12" ${st(12)}/>
        ${face(0, 28, 1.9, m)}${sparkle(-62, -56, 8, '#b197fc')}${o}${cheers(pose)}`;
    case 'twins':
      return `${arms(pose, '#63e6be', 50, 58)}<ellipse cx="0" cy="66" rx="52" ry="42" fill="#63e6be" ${st()}/><path d="M-20,104 l0,6 M20,104 l0,6" ${st(14)}/>
        ${[-32, 32]
          .map(
            (x) =>
              `<path d="M${x},-48 L${x + Math.sign(x) * 10},-80" ${st(4)}/><circle cx="${x + Math.sign(x) * 10}" cy="-84" r="7" fill="${x < 0 ? '#ffd43b' : '#f783ac'}" ${st(2)}/>
              <circle cx="${x}" cy="-14" r="36" fill="#63e6be" ${st()}/>${face(x, -12, 1.15, m)}`,
          )
          .join('')}${o}${cheers(pose)}`;
    case 'tvbot':
      return `<path d="M-20,-78 L-44,-104 M20,-78 L44,-104" ${st(4)}/><circle cx="-44" cy="-104" r="6" fill="#ff6b6b" ${st(2)}/><circle cx="44" cy="-104" r="6" fill="#ffd43b" ${st(2)}/>
        ${arms(pose, '#adb5bd', 50, 46)}<rect x="-36" y="26" width="72" height="74" rx="12" fill="#ffa94d" ${st()}/><circle cx="0" cy="62" r="10" fill="#fff3bf" ${st(2)}/><path d="M-18,100 l0,10 M18,100 l0,10" ${st(14)}/>
        <rect x="-62" y="-80" width="124" height="104" rx="16" fill="#868e96" ${st()}/><rect x="-52" y="-70" width="86" height="84" rx="12" fill="#212529" ${st(2.5)}/>
        <circle cx="48" cy="-50" r="6" fill="#ced4da" ${st(2)}/><circle cx="48" cy="-28" r="6" fill="#ced4da" ${st(2)}/>${face(-9, -32, 1.6, m, '#63e6be').replace(/#c2414d/g, '#63e6be')}${o}${cheers(pose)}`;
    case 'spinbot':
      return `<path d="M-84,40 h-14 M-80,56 h-10 M84,40 h14 M80,56 h10" stroke="#ced4da" stroke-width="4" stroke-linecap="round"/>${arms(pose, '#adb5bd', 10, 62)}
        <path d="M-70,20 Q0,-6 70,20 L10,96 L0,112 L-10,96 Z" fill="#b197fc" ${st()}/><path d="M-58,36 Q0,16 58,36" fill="none" stroke="#e5dbff" stroke-width="6"/>
        <circle cx="0" cy="-30" r="44" fill="#e9ecef" ${st()}/><rect x="-32" y="-54" width="64" height="44" rx="14" fill="#d0ebff" ${st(2.5)}/>${face(0, -36, 1.3, m)}
        <path d="M0,-74 L0,-96" ${st(4)}/><circle cx="0" cy="-100" r="7" fill="#63e6be" ${st(2)}/>${o}${cheers(pose)}`;
    case 'crabbot': {
      const claw = pose === 1 ? [74, -30] : pose === 2 ? [44, -6] : [80, 30];
      const pincer = (x, y) =>
        `<ellipse cx="${x}" cy="${y - 7}" rx="16" ry="8" fill="#ff8787" ${st(2.5)} transform="rotate(-20 ${x} ${y - 7})"/><ellipse cx="${x}" cy="${y + 7}" rx="16" ry="8" fill="#ff8787" ${st(2.5)} transform="rotate(20 ${x} ${y + 7})"/>`;
      return `${[-1, 1].map((k) => `<path d="M${k * 30},70 l${k * 16},38 M${k * 44},60 l${k * 22},34" ${st(6)}/><path d="M${k * 56},36 L${k * claw[0]},${claw[1]}" ${st(8)}/><path d="M${k * 56},36 L${k * claw[0]},${claw[1]}" stroke="#adb5bd" stroke-width="4" stroke-linecap="round"/>${pincer(k * claw[0], claw[1])}`).join('')}
        <path d="M-24,-6 L-28,-40 M24,-6 L28,-40" ${st(5)}/><ellipse cx="0" cy="40" rx="66" ry="44" fill="#ff8787" ${st()}/><rect x="-40" y="24" width="80" height="10" rx="5" fill="#c92a2a" opacity="0.5"/>
        <circle cx="-28" cy="-44" r="16" fill="#fff" ${st(2.5)}/><circle cx="28" cy="-44" r="16" fill="#fff" ${st(2.5)}/>${eyes(28, -44, 16, pose)}${mouth(52, 14, pose)}${o}${cheers(pose)}`;
    }
    case 'ufopilot':
      return `<ellipse cx="0" cy="40" rx="30" ry="30" fill="#8ce99a" ${st()}/>${arms(pose, '#8ce99a', 40, 44)}
        <path d="M-14,-46 L-24,-66 M14,-46 L24,-66" ${st(4)}/><circle cx="-24" cy="-68" r="6" fill="#ffd43b" ${st(2)}/><circle cx="24" cy="-68" r="6" fill="#ffd43b" ${st(2)}/>
        <ellipse cx="0" cy="-10" rx="44" ry="40" fill="#8ce99a" ${st()}/>${face(0, -8, 1.6, m)}
        <path d="M-66,66 Q-66,-84 0,-86 Q66,-84 66,66 Z" fill="#a5d8ff" fill-opacity="0.3" ${st(2.5)}/><path d="M-46,-50 q14,-20 34,-24" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
        <ellipse cx="0" cy="74" rx="92" ry="26" fill="#adb5bd" ${st()}/><path d="M-52,90 Q0,118 52,90 Z" fill="#868e96" ${st()}/>
        <circle cx="-60" cy="76" r="6" fill="#ffd43b"/><circle cx="-20" cy="82" r="6" fill="#ff6b6b"/><circle cx="20" cy="82" r="6" fill="#63e6be"/><circle cx="60" cy="76" r="6" fill="#b197fc"/>${o}${cheers(pose)}`;
    case 'puffball':
      return `${arms(pose, '#ffc078', 40, 62)}<polygon points="${spikes(0, 24, 76, 64, 26)}" fill="#ffc078" ${st()}/><ellipse cx="-20" cy="106" rx="14" ry="7" fill="#e8590c" ${st(2.5)}/><ellipse cx="20" cy="106" rx="14" ry="7" fill="#e8590c" ${st(2.5)}/>
        <path d="M0,-50 q-12,-22 6,-30 q14,-4 8,10" fill="none" ${st(4)}/>${face(0, 18, 2.2, m)}${o}${cheers(pose)}`;
    case 'springbot':
      return `<rect x="-50" y="88" width="100" height="22" rx="10" fill="#495057" ${st()}/>
        <polyline points="${Array.from({ length: 9 }, (_, i) => `${i % 2 ? 24 : -24},${88 - i * 10}`).join(' ')}" fill="none" ${st(10)}/><polyline points="${Array.from({ length: 9 }, (_, i) => `${i % 2 ? 24 : -24},${88 - i * 10}`).join(' ')}" fill="none" stroke="#ced4da" stroke-width="5"/>
        ${arms(pose, '#adb5bd', -16, 62)}<rect x="-58" y="-82" width="116" height="92" rx="26" fill="#74c0fc" ${st()}/><rect x="-46" y="-70" width="92" height="64" rx="16" fill="#e7f5ff" ${st(2.5)}/>
        <rect x="-68" y="-50" width="12" height="24" rx="4" fill="#ffd43b" ${st(2)}/><rect x="56" y="-50" width="12" height="24" rx="4" fill="#ffd43b" ${st(2)}/>${face(0, -40, 1.6, m)}${o}${cheers(pose)}`;
    default:
      throw new Error(`unknown dancer ${name}`);
  }
}

function dancerSvg(name, pose) {
  const { w, h } = DANCER;
  // Feet at the frame's bottom (the crowd's anchor: bottom middle).
  return svg(w, h, `<g transform="translate(${w / 2},${h - 118})">${dancerArt(name, pose)}</g>`);
}

// ---------------------------------------------------------------- props

/** The rocket train: frame 0 the rocket, 1–4 pods with a window (same geometry as the puzzle train). */
function rocketSvg(i) {
  const { w, h } = TRAIN;
  let g;
  if (i === 0) {
    g = `<path d="M24,${h - 40} L24,${h - 120} Q24,${h - 150} 60,${h - 150} L150,${h - 150} Q206,${h - 140} 214,${h - 80} Q206,${h - 40} 150,${h - 40} Z" fill="#e9ecef" ${st()}/>
      <path d="M24,${h - 140} L2,${h - 160} L2,${h - 110} Z M24,${h - 60} L2,${h - 40} L2,${h - 90} Z" fill="#ff6b6b" ${st()}/><circle cx="150" cy="${h - 96}" r="22" fill="#74c0fc" ${st()}/>
      <path d="M2,${h - 100} l-14,-8 l0,24 Z" fill="#ffa94d" ${st(2)}/>${face(100, h - 96, 1.5)}`;
  } else {
    const c = ['#b197fc', '#63e6be', '#faa2c1', '#ffd43b'][i - 1];
    g = `<rect x="14" y="${h - 146}" width="${w - 28}" height="108" rx="40" fill="${c}" ${st()}/><rect x="34" y="${h - 132}" width="${w - 68}" height="80" rx="26" fill="#1c2541" ${st(2.5)}/>
      <rect x="2" y="${h - 96}" width="14" height="12" rx="3" fill="#868e96"/><rect x="${w - 16}" y="${h - 96}" width="14" height="12" rx="3" fill="#868e96"/>
      <path d="M50,${h - 38} l14,22 M${w - 50},${h - 38} l-14,22" ${st(6)}/><circle cx="64" cy="${h - 14}" r="7" fill="#ffd43b" ${st(2)}/><circle cx="${w - 64}" cy="${h - 14}" r="7" fill="#ffd43b" ${st(2)}/>`;
  }
  return svg(w, h, g);
}

/** The machines (MACHINE px): candy machine (critters' Number Machine), robot machine, zapper (Alien Invaders' Word Wand). */
function machineSvg(kind) {
  const s = MACHINE;
  let g;
  if (kind === 'candy') {
    g = `<rect x="70" y="150" width="120" height="90" rx="14" fill="#ff6b6b" ${st()}/><rect x="104" y="196" width="52" height="30" rx="8" fill="#5a4a4a" ${st(2.5)}/>
      <circle cx="130" cy="96" r="76" fill="#d0ebff" fill-opacity="0.9" ${st()}/>
      ${[
        [100, 70, '#ff6b6b'],
        [140, 60, '#ffd43b'],
        [160, 100, '#69db7c'],
        [110, 112, '#b197fc'],
        [136, 130, '#ffa94d'],
        [84, 104, '#74c0fc'],
        [168, 136, '#f783ac'],
      ]
        .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="14" fill="${c}" ${st(2)}/>`)
        .join('')}
      <rect x="112" y="12" width="36" height="16" rx="6" fill="#ff6b6b" ${st(2.5)}/>${face(130, 172, 1.4)}`;
  } else if (kind === 'robot') {
    g = `<path d="M130,26 L130,6" ${st(4)}/><circle cx="130" cy="6" r="8" fill="#ff6b6b" ${st(2.5)}/><rect x="40" y="26" width="180" height="200" rx="28" fill="#adb5bd" ${st()}/>
      <rect x="62" y="48" width="136" height="88" rx="18" fill="#d0ebff" ${st(2.5)}/><rect x="22" y="150" width="30" height="40" rx="8" fill="#868e96" ${st()}/><rect x="208" y="150" width="30" height="40" rx="8" fill="#868e96" ${st()}/>
      <circle cx="96" cy="176" r="12" fill="#ffd43b" ${st(2.5)}/><circle cx="130" cy="176" r="12" fill="#69db7c" ${st(2.5)}/><circle cx="164" cy="176" r="12" fill="#ff6b6b" ${st(2.5)}/>${face(130, 92, 2)}`;
  } else {
    g = `<rect x="60" y="120" width="56" height="110" rx="14" fill="#868e96" ${st()}/><path d="M40,80 L190,80 Q232,92 232,120 Q232,148 190,160 L40,160 Z" fill="#b197fc" ${st()}/>
      <rect x="190" y="104" width="54" height="32" rx="10" fill="#63e6be" ${st()}/><circle cx="96" cy="120" r="18" fill="#d0ebff" ${st(2.5)}/>
      ${sparkle(230, 60, 14, '#ffd43b')}${sparkle(250, 180, 10, '#63e6be')}${face(140, 118, 1.3)}`;
  }
  return svg(s, s, g);
}

/** Quick Count's counters (COUNTER px). */
function counterSvg(kind) {
  const r = COUNTER * 0.36;
  let g;
  switch (kind) {
    case 'ladybug':
      g = `<circle cx="0" cy="-${r * 0.8}" r="${r * 0.45}" fill="#3a2420"/><circle cx="0" cy="${r * 0.1}" r="${r}" fill="#ff6b6b" ${st(3)}/><path d="M0,-${r * 0.9} L0,${r * 1.1}" ${st(2.5)}/>
        <circle cx="-${r * 0.45}" cy="0" r="${r * 0.18}" fill="#3a2420"/><circle cx="${r * 0.45}" cy="0" r="${r * 0.18}" fill="#3a2420"/><circle cx="-${r * 0.35}" cy="${r * 0.55}" r="${r * 0.15}" fill="#3a2420"/><circle cx="${r * 0.35}" cy="${r * 0.55}" r="${r * 0.15}" fill="#3a2420"/>`;
      break;
    case 'chick':
      g = `<circle cx="0" cy="0" r="${r}" fill="#ffe066" ${st(3)}/><path d="M-5,4 L0,12 L5,4 Z" fill="#ffa94d" ${st(1.5)}/><path d="M-4,-${r} q4,-10 8,0" fill="none" ${st(2)}/>${face(0, -2, 0.8)}`;
      break;
    case 'star':
      g = `<polygon points="${star5(r * 1.1)}" fill="#ffd43b" ${st(3)}/>${face(0, 4, 0.75)}`;
      break;
    case 'blossom':
      g =
        Array.from({ length: 5 }, (_, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          return `<circle cx="${f(Math.cos(a) * r * 0.62)}" cy="${f(Math.sin(a) * r * 0.62)}" r="${f(r * 0.48)}" fill="#f783ac" ${st(2.5)}/>`;
        }).join('') + `<circle cx="0" cy="0" r="${f(r * 0.5)}" fill="#fff3bf" ${st(2.5)}/>${face(0, 0, 0.55)}`;
      break;
    case 'alien':
      g = `<path d="M0,-${r * 0.9} L0,-${r * 1.25}" ${st(2.5)}/><circle cx="0" cy="-${r * 1.3}" r="4" fill="#ffd43b" ${st(1.5)}/><ellipse cx="0" cy="0" rx="${r}" ry="${r * 0.92}" fill="#8ce99a" ${st(3)}/>
        <circle cx="0" cy="-4" r="${r * 0.36}" fill="#fff" ${st(2)}/><circle cx="0" cy="-3" r="${r * 0.17}" fill="#2a1a17"/><path d="M-7,${r * 0.45} q7,6 14,0" fill="none" ${st(2)}/>`;
      break;
    case 'planet':
      g = `<ellipse cx="0" cy="0" rx="${r * 1.35}" ry="${r * 0.35}" fill="none" ${st(6)}/><ellipse cx="0" cy="0" rx="${r * 1.35}" ry="${r * 0.35}" fill="none" stroke="#ffd43b" stroke-width="3"/>
        <circle cx="0" cy="0" r="${r * 0.82}" fill="#b197fc" ${st(3)}/><path d="M-${r * 1.1},${r * 0.1} Q0,${r * 0.6} ${r * 1.1},-${r * 0.1}" fill="none" stroke="#ffd43b" stroke-width="3"/>${face(0, -3, 0.6)}`;
      break;
    case 'ufo':
      g = `<path d="M-${r * 0.6},-2 Q0,-${r * 1.3} ${r * 0.6},-2 Z" fill="#a5d8ff" ${st(2.5)}/><ellipse cx="0" cy="${r * 0.1}" rx="${r * 1.2}" ry="${r * 0.42}" fill="#adb5bd" ${st(3)}/>
        <circle cx="-${r * 0.6}" cy="${r * 0.15}" r="4" fill="#ffd43b"/><circle cx="0" cy="${r * 0.3}" r="4" fill="#ff6b6b"/><circle cx="${r * 0.6}" cy="${r * 0.15}" r="4" fill="#69db7c"/>${face(0, -r * 0.45, 0.45)}`;
      break;
    case 'bothead':
      g = `<path d="M0,-${r} L0,-${r * 1.3}" ${st(2.5)}/><circle cx="0" cy="-${r * 1.35}" r="4" fill="#ff6b6b" ${st(1.5)}/><rect x="-${r}" y="-${r}" width="${r * 2}" height="${r * 1.8}" rx="${r * 0.35}" fill="#ced4da" ${st(3)}/>
        <rect x="-${r * 0.72}" y="-${r * 0.72}" width="${r * 1.44}" height="${r * 1.0}" rx="${r * 0.2}" fill="#d0ebff" ${st(2)}/>${face(0, -r * 0.25, 0.65)}`;
      break;
    case 'bee':
      g = `<ellipse cx="-9" cy="-${r * 0.75}" rx="${r * 0.42}" ry="${r * 0.3}" fill="#e7f5ff" ${st(2)}/><ellipse cx="9" cy="-${r * 0.75}" rx="${r * 0.42}" ry="${r * 0.3}" fill="#e7f5ff" ${st(2)}/>
        <ellipse cx="0" cy="2" rx="${r * 1.05}" ry="${r * 0.82}" fill="#ffd43b" ${st(3)}/><path d="M-6,-${r * 0.7} q-3,${r * 0.75} 0,${r * 1.5} M8,-${r * 0.7} q3,${r * 0.75} 0,${r * 1.5}" fill="none" stroke="#3a2420" stroke-width="6"/>${face(-r * 0.5, 0, 0.55)}`;
      break;
    case 'butterfly':
      g = `<ellipse cx="-${r * 0.55}" cy="-${r * 0.3}" rx="${r * 0.6}" ry="${r * 0.55}" fill="#b197fc" ${st(2.5)}/><ellipse cx="${r * 0.55}" cy="-${r * 0.3}" rx="${r * 0.6}" ry="${r * 0.55}" fill="#b197fc" ${st(2.5)}/>
        <ellipse cx="-${r * 0.45}" cy="${r * 0.45}" rx="${r * 0.42}" ry="${r * 0.38}" fill="#f783ac" ${st(2.5)}/><ellipse cx="${r * 0.45}" cy="${r * 0.45}" rx="${r * 0.42}" ry="${r * 0.38}" fill="#f783ac" ${st(2.5)}/>
        <ellipse cx="0" cy="0" rx="${r * 0.18}" ry="${r * 0.8}" fill="#3a2420"/><path d="M-3,-${r * 0.8} q-6,-10 -12,-12 M3,-${r * 0.8} q6,-10 12,-12" fill="none" ${st(2)}/>`;
      break;
    case 'strawberry':
      g = `<path d="M0,${r * 1.05} C-${r * 1.1},${r * 0.2} -${r * 0.95},-${r * 0.7} 0,-${r * 0.6} C${r * 0.95},-${r * 0.7} ${r * 1.1},${r * 0.2} 0,${r * 1.05} Z" fill="#ff6b6b" ${st(3)}/>
        <path d="M-${r * 0.5},-${r * 0.7} L0,-${r * 0.45} L${r * 0.5},-${r * 0.7} L${r * 0.2},-${r * 0.95} L0,-${r * 0.75} L-${r * 0.2},-${r * 0.95} Z" fill="#69db7c" ${st(2)}/>
        ${[
          [-0.4, 0],
          [0.4, 0],
          [0, 0.45],
          [-0.2, 0.75],
          [0.25, 0.7],
        ]
          .map(([x, y]) => `<ellipse cx="${f(x * r)}" cy="${f(y * r)}" rx="1.6" ry="2.4" fill="#fff3bf"/>`)
          .join('')}${face(0, -r * 0.1, 0.5)}`;
      break;
    case 'acorn':
      g = `<path d="M-${r * 0.7},0 Q-${r * 0.7},${r * 1.1} 0,${r * 1.15} Q${r * 0.7},${r * 1.1} ${r * 0.7},0 Z" fill="#e8a25e" ${st(3)}/><path d="M-${r * 0.85},0 Q0,-${r * 0.9} ${r * 0.85},0 Z" fill="#8a5a3a" ${st(3)}/>
        <path d="M0,-${r * 0.45} q2,-10 8,-14" fill="none" ${st(3)}/>${face(0, r * 0.4, 0.5)}`;
      break;
    case 'rocket':
      g = `<path d="M-${r * 0.35},${r * 0.55} L-${r * 0.75},${r * 0.95} L-${r * 0.5},${r * 0.2} Z M${r * 0.35},${r * 0.55} L${r * 0.75},${r * 0.95} L${r * 0.5},${r * 0.2} Z" fill="#ff6b6b" ${st(2.5)}/>
        <path d="M0,-${r * 1.2} Q${r * 0.65},-${r * 0.6} ${r * 0.48},${r * 0.75} L-${r * 0.48},${r * 0.75} Q-${r * 0.65},-${r * 0.6} 0,-${r * 1.2} Z" fill="#e9ecef" ${st(3)}/>
        <circle cx="0" cy="-${r * 0.25}" r="${r * 0.28}" fill="#74c0fc" ${st(2)}/><path d="M-${r * 0.25},${r * 0.75} L0,${r * 1.25} L${r * 0.25},${r * 0.75} Z" fill="#ffa94d"/>`;
      break;
    case 'comet':
      g = `<path d="M${r * 0.3},-${r * 0.3} L-${r * 1.2},${r * 0.9} M${r * 0.5},0 L-${r * 0.9},${r * 1.2} M0,-${r * 0.5} L-${r * 1.3},${r * 0.5}" stroke="#ffe066" stroke-width="7" stroke-linecap="round" opacity="0.7"/>
        <circle cx="${r * 0.35}" cy="-${r * 0.35}" r="${r * 0.62}" fill="#ffd43b" ${st(3)}/>${face(r * 0.35, -r * 0.35, 0.5)}`;
      break;
    case 'gem':
      g = `<path d="M-${r * 0.9},-${r * 0.25} L-${r * 0.45},-${r * 0.8} L${r * 0.45},-${r * 0.8} L${r * 0.9},-${r * 0.25} L0,${r * 1.0} Z" fill="#63e6be" ${st(3)}/>
        <path d="M-${r * 0.9},-${r * 0.25} L${r * 0.9},-${r * 0.25} M-${r * 0.45},-${r * 0.8} L-${r * 0.2},-${r * 0.25} L0,${r} L${r * 0.2},-${r * 0.25} L${r * 0.45},-${r * 0.8}" fill="none" ${st(2)}/>${sparkle(r * 0.75, -r * 0.85, 7)}`;
      break;
    case 'satellite':
      g = `<rect x="-${r * 1.25}" y="-${r * 0.3}" width="${r * 0.7}" height="${r * 0.6}" fill="#4dabf7" ${st(2.5)}/><rect x="${r * 0.55}" y="-${r * 0.3}" width="${r * 0.7}" height="${r * 0.6}" fill="#4dabf7" ${st(2.5)}/>
        <rect x="-${r * 0.5}" y="-${r * 0.5}" width="${r}" height="${r}" rx="${r * 0.2}" fill="#ced4da" ${st(3)}/><path d="M0,-${r * 0.5} L0,-${r * 0.95}" ${st(2.5)}/><circle cx="0" cy="-${r}" r="4" fill="#ff6b6b"/>${face(0, 0, 0.45)}`;
      break;
    default:
      throw new Error(`unknown counter ${kind}`);
  }
  return centred(g, COUNTER);
}

// ---------------------------------------------------------------- flyers

/** Things that drift across the backdrop (FLYER px), drawn a little soft so they stay behind the puzzle. */
function flyerSvg(kind) {
  const r = FLYER * 0.36;
  let g;
  switch (kind) {
    case 'butterfly':
    case 'ufo':
    case 'comet':
    case 'satellite':
    case 'rocket':
      return counterSvg(kind).replace(`width="${COUNTER}" height="${COUNTER}"`, `width="${FLYER}" height="${FLYER}"`);
    case 'balloon':
      g = `<path d="M0,${r * 1.05} q-6,14 4,26 q-10,8 -2,18" fill="none" ${st(2)}/><ellipse cx="0" cy="-${r * 0.1}" rx="${r * 0.85}" ry="${r * 1.05}" fill="#f783ac" ${st(3)}/>
        <path d="M-5,${r * 0.95} L5,${r * 0.95} L0,${r * 1.12} Z" fill="#f783ac" ${st(2)}/><ellipse cx="-${r * 0.35}" cy="-${r * 0.5}" rx="${r * 0.18}" ry="${r * 0.28}" fill="#fff" opacity="0.7"/>${face(0, 0, 0.55)}`;
      break;
    case 'bird':
      g = `<ellipse cx="0" cy="0" rx="${r * 0.9}" ry="${r * 0.7}" fill="#74c0fc" ${st(3)}/><path d="M-${r * 0.2},-${r * 0.1} q-${r * 0.6},-${r * 1.0} -${r * 1.1},-${r * 0.3} q${r * 0.5},${r * 0.2} ${r * 0.9},${r * 0.6} Z" fill="#4dabf7" ${st(2.5)}/>
        <path d="M${r * 0.85},-2 L${r * 1.25},4 L${r * 0.85},10 Z" fill="#ffa94d" ${st(2)}/>${face(r * 0.35, -r * 0.05, 0.5)}`;
      break;
    case 'leaf':
      g = `<path d="M-${r},${r} Q-${r * 1.1},-${r * 0.7} ${r},-${r} Q${r * 1.05},${r * 0.75} -${r},${r} Z" fill="#ffa94d" ${st(3)}/><path d="M-${r},${r} Q0,0 ${r * 0.9},-${r * 0.9}" fill="none" ${st(2)}/>`;
      break;
    default:
      throw new Error(`unknown flyer ${kind}`);
  }
  return centred(g, FLYER);
}

// ---------------------------------------------------------------- backdrops

/** A seeded little random so a backdrop renders the same every run. */
function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const inMiddle = (x, y) => x > 280 && x < 1000 && y > 120 && y < 600;

const CRITTER_BACKDROPS = [
  // 0: a meadow with hills, flowers and a sun.
  (R) => {
    let g = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d0f0ff"/><stop offset="1" stop-color="#fff9db"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
    g += `<circle cx="1140" cy="110" r="70" fill="#ffe066" opacity="0.8"/><path d="M0,${H - 150} Q260,${H - 250} 560,${H - 160} T1280,${H - 190} L1280,${H} L0,${H} Z" fill="#b2f2bb"/>
      <path d="M0,${H - 90} Q300,${H - 170} 700,${H - 100} T1280,${H - 110} L1280,${H} L0,${H} Z" fill="#8ce99a"/>`;
    for (let i = 0; i < 60; i++) {
      const x = R() * W;
      const y = H - 90 + R() * 90;
      const c = ['#f783ac', '#ffd43b', '#fff', '#b197fc'][Math.floor(R() * 4)];
      g += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(4 + R() * 4)}" fill="${c}"/><circle cx="${f(x)}" cy="${f(y)}" r="2" fill="#ffa94d"/>`;
    }
    for (let i = 0; i < 6; i++) g += cloud(R() * W, 40 + R() * 160, 0.6 + R() * 0.6, '#fff', 0.85);
    return g;
  },
  // 1: rainbow sky with clouds.
  (R) => {
    let g = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe3f1"/><stop offset="1" stop-color="#e5dbff"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
    ['#ff8787', '#ffc078', '#ffe066', '#8ce99a', '#74c0fc', '#b197fc'].forEach((c, i) => {
      g += `<path d="M-60,${H + 40} A${700 - i * 34},${560 - i * 34} 0 0 1 ${W + 60},${H + 40}" fill="none" stroke="${c}" stroke-width="34" opacity="0.35"/>`;
    });
    for (let i = 0; i < 9; i++) g += cloud(R() * W, R() * H, 0.6 + R() * 0.8, '#fff', 0.9);
    for (let i = 0; i < 30; i++) {
      const x = R() * W;
      const y = R() * H;
      if (inMiddle(x, y)) continue;
      g += sparkle(x, y, 5 + R() * 7);
    }
    return g;
  },
  // 2: candy land — lollipops and gumdrops along the edges.
  (R) => {
    let g = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0f6"/><stop offset="1" stop-color="#ffe8cc"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
    for (let i = 0; i < 14; i++) {
      const x = i % 2 ? 30 + R() * 200 : W - 230 + R() * 200;
      const y = 120 + R() * (H - 200);
      const c = ['#f783ac', '#74c0fc', '#8ce99a', '#ffd43b', '#b197fc'][Math.floor(R() * 5)];
      g += `<path d="M${f(x)},${f(y)} L${f(x)},${f(y + 90)}" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.8"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(22 + R() * 14)}" fill="${c}" opacity="0.55"/>
        <path d="M${f(x - 14)},${f(y)} a14,14 0 1 1 28,0" fill="none" stroke="#fff" stroke-width="4" opacity="0.7"/>`;
    }
    for (let i = 0; i < 200; i++) {
      const x = R() * W;
      const y = R() * H;
      if (inMiddle(x, y) && R() < 0.8) continue;
      g += `<rect x="${f(x)}" y="${f(y)}" width="4" height="10" rx="2" fill="${['#f783ac', '#74c0fc', '#ffd43b', '#8ce99a'][Math.floor(R() * 4)]}" opacity="0.45" transform="rotate(${f(R() * 180)} ${f(x)} ${f(y)})"/>`;
    }
    return g;
  },
  // 3: a mushroom forest, pastel.
  (R) => {
    let g = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6fcf5"/><stop offset="1" stop-color="#f3f0ff"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
    for (let i = 0; i < 10; i++) {
      const x = i < 5 ? 40 + i * 50 : W - 260 + (i - 5) * 50;
      g += `<rect x="${f(x)}" y="${f(80 + R() * 120)}" width="${f(30 + R() * 20)}" height="${H}" rx="14" fill="#c5a582" opacity="0.35"/><circle cx="${f(x + 20)}" cy="${f(60 + R() * 100)}" r="${f(60 + R() * 30)}" fill="#8ce99a" opacity="0.35"/>`;
    }
    g += `<rect y="${H - 70}" width="${W}" height="70" fill="#b2f2bb" opacity="0.7"/>`;
    for (let i = 0; i < 12; i++) {
      const x = R() * W;
      if (x > 330 && x < 950) continue;
      const s = 0.6 + R() * 0.7;
      g += `<g transform="translate(${f(x)},${H - 60}) scale(${f(s)})"><rect x="-10" y="-40" width="20" height="44" rx="8" fill="#fff4e6"/><path d="M-40,-36 Q0,-90 40,-36 Z" fill="${['#ff8787', '#b197fc', '#ffa94d'][Math.floor(R() * 3)]}"/>
        <circle cx="-14" cy="-52" r="6" fill="#fff"/><circle cx="12" cy="-60" r="5" fill="#fff"/></g>`;
    }
    for (let i = 0; i < 40; i++) {
      const x = R() * W;
      const y = R() * H;
      if (inMiddle(x, y)) continue;
      g += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2 + R() * 3)}" fill="#ffe066" opacity="0.8"/>`;
    }
    return g;
  },
  // 4: a pastel ocean: waves, bubbles, shells on the sand.
  (R) => {
    let g = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3fafc"/><stop offset="1" stop-color="#a5d8ff"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
    for (let k = 0; k < 4; k++) {
      const y = 120 + k * 50;
      g += `<path d="M0,${y} q40,-18 80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0" fill="none" stroke="#fff" stroke-width="4" opacity="${f(0.5 - k * 0.1)}"/>`;
    }
    g += `<path d="M0,${H - 80} Q320,${H - 120} 640,${H - 90} T1280,${H - 100} L1280,${H} L0,${H} Z" fill="#ffe8cc"/>`;
    for (let i = 0; i < 40; i++) {
      const x = R() * W;
      const y = R() * (H - 120);
      if (inMiddle(x, y)) continue;
      g += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(4 + R() * 10)}" fill="none" stroke="#fff" stroke-width="2" opacity="0.7"/>`;
    }
    for (let i = 0; i < 10; i++) {
      const x = R() * W;
      if (x > 320 && x < 960) continue;
      const c = ['#faa2c1', '#ffc078', '#fff'][Math.floor(R() * 3)];
      g += `<path d="M${f(x - 16)},${H - 40} Q${f(x)},${H - 74} ${f(x + 16)},${H - 40} Z" fill="${c}" stroke="#e8a25e" stroke-width="2"/>`;
    }
    return g;
  },
  // 5: a sunset beach: peach-to-lilac sky, a calm sea, little palms at the edges.
  (R) => {
    let g = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e5dbff"/><stop offset="0.6" stop-color="#ffd8a8"/><stop offset="1" stop-color="#ffe8cc"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
    g += `<circle cx="640" cy="${H - 170}" r="120" fill="#ffc078" opacity="0.55"/><rect y="${H - 190}" width="${W}" height="80" fill="#a5d8ff" opacity="0.8"/>
      <path d="M0,${H - 110} Q640,${H - 150} 1280,${H - 110} L1280,${H} L0,${H} Z" fill="#fff3bf"/>`;
    for (const x of [90, 230, 1060, 1190]) {
      g += `<path d="M${x},${H - 40} q-10,-90 6,-170" fill="none" stroke="#a0724e" stroke-width="14" stroke-linecap="round" opacity="0.6"/>
        ${[-70, -30, 20, 60, 110].map((a) => `<path d="M${x + 6},${H - 210} q${f(Math.cos((a * Math.PI) / 180) * 60)},${f(Math.sin((a * Math.PI) / 180) * 30 - 30)} ${f(Math.cos((a * Math.PI) / 180) * 90)},${f(Math.sin((a * Math.PI) / 180) * 40)}" fill="none" stroke="#69db7c" stroke-width="12" stroke-linecap="round" opacity="0.6"/>`).join('')}`;
    }
    for (let i = 0; i < 6; i++) g += cloud(R() * W, 40 + R() * 140, 0.5 + R() * 0.5, '#fff', 0.7);
    return g;
  },
];

function cloud(x, y, s, c, o) {
  return `<g transform="translate(${f(x)},${f(y)}) scale(${f(s)})" opacity="${o}"><path d="M-60,20 Q-80,-6 -48,-12 Q-44,-46 -6,-38 Q14,-62 40,-34 Q74,-32 64,0 Q82,22 52,26 Z" fill="${c}"/></g>`;
}

const COSMOS_BACKDROPS = [
  // 0: deep space with planets.
  (R) => {
    let g = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1f4b"/><stop offset="1" stop-color="#3b2a6b"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
    g += stars(R, 220);
    g += `<circle cx="150" cy="560" r="110" fill="#b197fc" opacity="0.55"/><ellipse cx="150" cy="560" rx="170" ry="30" fill="none" stroke="#ffd43b" stroke-width="10" opacity="0.5"/>
      <circle cx="1140" cy="130" r="64" fill="#63e6be" opacity="0.5"/><circle cx="1080" cy="600" r="34" fill="#ff8787" opacity="0.5"/>`;
    return g;
  },
  // 1: a moon's surface.
  (R) => {
    let g = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14183a"/><stop offset="1" stop-color="#2b3266"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
    g += stars(R, 160);
    g += `<circle cx="1060" cy="140" r="90" fill="#74c0fc" opacity="0.4"/><path d="M0,${H - 120} Q320,${H - 180} 640,${H - 130} T1280,${H - 140} L1280,${H} L0,${H} Z" fill="#868e96" opacity="0.85"/>`;
    for (let i = 0; i < 14; i++) {
      const x = R() * W;
      const y = H - 100 + R() * 80;
      g += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(16 + R() * 24)}" ry="${f(5 + R() * 6)}" fill="#495057" opacity="0.7"/>`;
    }
    return g;
  },
  // 2: inside a space station: panels and round windows.
  (R) => {
    let g = `<rect width="${W}" height="${H}" fill="#2c3e5a"/>`;
    for (let x = 0; x < W; x += 160)
      g += `<rect x="${x + 6}" y="0" width="148" height="${H}" fill="#34496a" opacity="0.8"/><circle cx="${x + 20}" cy="30" r="5" fill="#5c7cfa" opacity="0.6"/><circle cx="${x + 140}" cy="${H - 30}" r="5" fill="#5c7cfa" opacity="0.6"/>`;
    for (const [x, y] of [
      [120, 140],
      [1160, 140],
      [120, 560],
      [1160, 560],
    ]) {
      g += `<circle cx="${x}" cy="${y}" r="76" fill="#868e96"/><circle cx="${x}" cy="${y}" r="62" fill="#14183a"/>`;
      for (let i = 0; i < 12; i++) {
        const a = R() * Math.PI * 2;
        const d = R() * 54;
        g += `<circle cx="${f(x + Math.cos(a) * d)}" cy="${f(y + Math.sin(a) * d)}" r="${f(1 + R() * 2)}" fill="#fff"/>`;
      }
    }
    for (let i = 0; i < 24; i++) {
      const x = R() * W;
      const y = R() * H;
      if (inMiddle(x, y)) continue;
      g += `<rect x="${f(x)}" y="${f(y)}" width="10" height="4" rx="2" fill="${['#63e6be', '#ffd43b', '#ff8787'][Math.floor(R() * 3)]}" opacity="0.7"/>`;
    }
    return g;
  },
  // 3: a robot lab: a glowing grid and gears.
  (R) => {
    let g = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16213e"/><stop offset="1" stop-color="#0f3460"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
    for (let x = 0; x <= W; x += 64)
      g += `<path d="M${x},0 L${x},${H}" stroke="#63e6be" stroke-width="1" opacity="0.15"/>`;
    for (let y = 0; y <= H; y += 64)
      g += `<path d="M0,${y} L${W},${y}" stroke="#63e6be" stroke-width="1" opacity="0.15"/>`;
    for (const [x, y, r] of [
      [110, 120, 70],
      [1170, 600, 80],
      [1190, 110, 44],
      [90, 610, 50],
    ]) {
      const teeth = Array.from({ length: 10 }, (_, i) => {
        const a = (i * Math.PI) / 5;
        return `<rect x="${f(x + Math.cos(a) * r - 9)}" y="${f(y + Math.sin(a) * r - 9)}" width="18" height="18" rx="3" fill="#495057" transform="rotate(${f((a * 180) / Math.PI)} ${f(x + Math.cos(a) * r)} ${f(y + Math.sin(a) * r)})"/>`;
      }).join('');
      g += `<g opacity="0.55">${teeth}<circle cx="${x}" cy="${y}" r="${r}" fill="#495057"/><circle cx="${x}" cy="${y}" r="${r * 0.35}" fill="#16213e"/></g>`;
    }
    for (let i = 0; i < 30; i++) {
      const x = R() * W;
      const y = R() * H;
      if (inMiddle(x, y)) continue;
      g += `<circle cx="${f(x)}" cy="${f(y)}" r="3" fill="#63e6be" opacity="0.6"/>`;
    }
    return g;
  },
  // 4: an alien jungle: a purple world with glowing plants and a big moon.
  (R) => {
    let g = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f4b"/><stop offset="1" stop-color="#5f3dc4"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
    g += stars(R, 120);
    g += `<circle cx="1080" cy="150" r="110" fill="#ffc9c9" opacity="0.35"/><path d="M0,${H - 110} Q320,${H - 170} 640,${H - 120} T1280,${H - 130} L1280,${H} L0,${H} Z" fill="#3b2a6b"/>`;
    for (let i = 0; i < 14; i++) {
      const x = R() * W;
      if (x > 330 && x < 950) continue;
      const h = 80 + R() * 120;
      const c = ['#63e6be', '#f783ac', '#ffd43b'][Math.floor(R() * 3)];
      g += `<path d="M${f(x)},${H - 60} q${f(-10 + R() * 20)},${f(-h / 2)} 0,${f(-h)}" fill="none" stroke="#7048e8" stroke-width="8" stroke-linecap="round"/>
        <circle cx="${f(x)}" cy="${f(H - 60 - h)}" r="${f(14 + R() * 12)}" fill="${c}" opacity="0.8"/><circle cx="${f(x)}" cy="${f(H - 60 - h)}" r="${f(28 + R() * 10)}" fill="${c}" opacity="0.15"/>`;
    }
    return g;
  },
  // 5: a comet storm: a nebula glow, ringed planets and streaking comets at the edges.
  (R) => {
    let g = `<defs><radialGradient id="n" cx="0.5" cy="0.45" r="0.7"><stop offset="0" stop-color="#5c3a8a"/><stop offset="1" stop-color="#14183a"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#n)"/>`;
    g += stars(R, 200);
    g += `<circle cx="120" cy="130" r="54" fill="#ffa94d" opacity="0.55"/><ellipse cx="120" cy="130" rx="90" ry="16" fill="none" stroke="#ffe066" stroke-width="6" opacity="0.5"/>
      <circle cx="1170" cy="590" r="80" fill="#63e6be" opacity="0.45"/><ellipse cx="1170" cy="590" rx="130" ry="22" fill="none" stroke="#b197fc" stroke-width="8" opacity="0.45"/>`;
    for (let i = 0; i < 8; i++) {
      const x = R() < 0.5 ? 40 + R() * 220 : W - 260 + R() * 220;
      const y = 60 + R() * (H - 120);
      g += `<path d="M${f(x)},${f(y)} l-70,40" stroke="#ffe066" stroke-width="5" stroke-linecap="round" opacity="0.45"/><circle cx="${f(x)}" cy="${f(y)}" r="7" fill="#fff3bf"/>`;
    }
    return g;
  },
];

function stars(R, n) {
  let g = '';
  for (let i = 0; i < n; i++) {
    const x = R() * W;
    const y = R() * H;
    if (inMiddle(x, y) && R() < 0.6) continue;
    g += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.8 + R() * 2)}" fill="#fff" opacity="${f(0.4 + R() * 0.6)}"/>`;
  }
  for (let i = 0; i < 16; i++) {
    const x = R() * W;
    const y = R() * H;
    if (inMiddle(x, y)) continue;
    g += sparkle(x, y, 5 + R() * 6, '#ffe066');
  }
  return g;
}

const backdropSvg = (look, v) => {
  const R = rand(LOOKS.indexOf(look) * 101 + v * 17 + 3);
  const art = (look === 'critters' ? CRITTER_BACKDROPS : COSMOS_BACKDROPS)[v](R);
  return svg(W, H, art);
};

// ---------------------------------------------------------------- tile pictures

const ip = (inner) => svg(ICON, ICON, inner);
/** A picture drawn small at (x, y), px across. */
const miniPic = (name, x, y, px) =>
  `<g transform="translate(${f(x)},${f(y)}) scale(${f(px / 110)})">${PIC_ART[name]()}</g>`;
const card = (x, y, w, h, fill = '#fffaf0') =>
  `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${w}" height="${h}" rx="${f(Math.min(w, h) * 0.2)}" fill="${fill}" ${st(2.5)}/>`;
const label = (x, y, s, size = 18, fill = '#3a2420') =>
  `<text x="${f(x)}" y="${f(y + size * 0.35)}" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="800" font-size="${size}" fill="${fill}">${s}</text>`;

function iconSvg(id) {
  switch (id) {
    case 'word-train':
      return ip(`<rect x="6" y="40" width="40" height="34" rx="8" fill="#ff6b6b" ${st(2.5)}/><rect x="10" y="24" width="20" height="18" rx="4" fill="#f783ac" ${st(2.5)}/><circle cx="16" cy="78" r="7" fill="#5a4a4a" ${st(2)}/><circle cx="36" cy="78" r="7" fill="#5a4a4a" ${st(2)}/>
        <rect x="50" y="40" width="40" height="34" rx="8" fill="#74c0fc" ${st(2.5)}/>${label(70, 57, 'ABC', 14)}<circle cx="60" cy="78" r="7" fill="#5a4a4a" ${st(2)}/><circle cx="80" cy="78" r="7" fill="#5a4a4a" ${st(2)}/>${face(26, 56, 0.6)}`);
    case 'odd-word-out':
      return ip(
        `${miniPic('cat', 26, 26, 40)}${miniPic('dog', 70, 26, 40)}${miniPic('pig', 26, 70, 40)}${miniPic('apple', 70, 70, 40)}<circle cx="70" cy="70" r="22" fill="none" stroke="#facc15" stroke-width="4"/>`,
      );
    case 'word-wand':
      return ip(`<rect x="44" y="40" width="8" height="52" rx="4" fill="#5a4a4a" ${st(2)} transform="rotate(-24 48 66)"/><polygon points="${star5(22, 0.48, 34, 28)}" fill="#ffd43b" ${st(2.5)}/>${face(34, 30, 0.45)}
        ${card(74, 62, 34, 26)}${label(74, 62, 'Ab', 16)}${sparkle(80, 22, 7, '#b197fc')}${sparkle(12, 66, 6, '#f783ac')}`);
    case 'missing-letter':
      return ip(
        `${miniPic('cat', 48, 34, 52)}${card(20, 78, 22, 24)}${label(20, 78, 'C', 16)}<rect x="37" y="66" width="22" height="24" rx="5" fill="#fff" stroke="#7a849c" stroke-width="2.5" stroke-dasharray="4 3"/>${label(48, 78, '?', 16, '#7a849c')}${card(76, 78, 22, 24)}${label(76, 78, 'T', 16)}`,
      );
    case 'word-snap':
      return ip(`<path d="M8,30 L44,30 L44,40 q8,0 8,8 q0,8 -8,8 L44,66 L8,66 Z" fill="#ffd43b" ${st(2.5)}/>${label(24, 48, 'sun', 13)}
        <path d="M52,30 L88,30 L88,66 L52,66 L52,56 q8,0 8,-8 q0,-8 -8,-8 Z" fill="#f783ac" ${st(2.5)}/>${label(72, 48, 'set', 13)}${sparkle(48, 20, 7, '#74c0fc')}`);
    case 'letter-garden': {
      const L = ['C', 'A', 'T', 'S', 'U', 'N', 'O', 'W', 'E'];
      const tiles = L.map((l, i) => {
        const x = 18 + (i % 3) * 30;
        const y = 18 + Math.floor(i / 3) * 30;
        return `<circle cx="${x}" cy="${y}" r="13" fill="${[0, 1, 2].includes(i) ? '#ffd43b' : '#fffaf0'}" ${st(2)}/>${label(x, y, l, 13)}`;
      }).join('');
      return ip(
        `<rect x="2" y="2" width="92" height="92" rx="14" fill="#b2f2bb" ${st(2.5)}/>${tiles}<path d="M18,18 L48,18 L78,18" fill="none" stroke="#f783ac" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`,
      );
    }
    case 'number-train':
      return ip(`<rect x="4" y="38" width="28" height="34" rx="7" fill="#ff6b6b" ${st(2.5)}/>${face(18, 54, 0.45)}${[0, 1, 2].map((k) => `<rect x="${34 + k * 20}" y="42" width="18" height="30" rx="5" fill="${['#ffd43b', '#74c0fc', '#8ce99a'][k]}" ${st(2)}/>${label(43 + k * 20, 57, String((k + 1) * 2), 13)}`).join('')}
        <circle cx="12" cy="78" r="6" fill="#5a4a4a"/><circle cx="26" cy="78" r="6" fill="#5a4a4a"/><circle cx="52" cy="78" r="6" fill="#5a4a4a"/><circle cx="80" cy="78" r="6" fill="#5a4a4a"/>`);
    case 'number-machine':
      return ip(`<rect x="22" y="22" width="52" height="56" rx="12" fill="#adb5bd" ${st(2.5)}/><rect x="30" y="30" width="36" height="22" rx="6" fill="#d0ebff" ${st(2)}/>${face(48, 40, 0.55)}
        ${card(12, 66, 20, 20)}${label(12, 66, '3', 14)}${card(84, 66, 20, 20, '#d3f9d8')}${label(84, 66, '6', 14)}<path d="M2,48 l14,0 m-5,-5 l5,5 l-5,5 M78,48 l14,0 m-5,-5 l5,5 l-5,5" fill="none" ${st(2.5)}/>`);
    case 'odd-number-out':
      return ip(
        `${[
          ['2', 26, 26],
          ['4', 70, 26],
          ['8', 26, 70],
          ['7', 70, 70],
        ]
          .map(([n, x, y]) => card(x, y, 36, 36) + label(x, y, n, 22))
          .join('')}<circle cx="70" cy="70" r="24" fill="none" stroke="#facc15" stroke-width="4"/>`,
      );
    case 'make-ten':
      return ip(`${card(20, 44, 30, 38, '#fcc2d7')}${label(20, 44, '3', 22)}${label(42, 44, '+', 18)}${card(64, 44, 30, 38, '#a5d8ff')}${label(64, 44, '7', 22)}
        <rect x="18" y="70" width="60" height="22" rx="11" fill="#69db7c" ${st(2.5)}/>${label(48, 81, '= 10', 15)}`);
    case 'quick-count':
      return ip(
        `<rect x="10" y="10" width="76" height="76" rx="16" fill="#fff" ${st(3)}/>${[
          [30, 30],
          [66, 30],
          [48, 48],
          [30, 66],
          [66, 66],
        ]
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#f783ac" ${st(2)}/>`)
          .join('')}${sparkle(86, 12, 8, '#ffd43b')}`,
      );
    default:
      throw new Error(`no icon for ${id}`);
  }
}

// ---------------------------------------------------------------- output

const png = (s) => sharp(Buffer.from(s)).png().toBuffer();

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

  const pics = await grid(
    PICS.map((p) => centred(PIC_ART[p](), PIC)),
    PIC,
    PIC,
    PIC_COLS,
  );
  const dancers = {};
  for (const look of LOOKS) {
    dancers[look] = await grid(
      DANCERS[look].flatMap((d) => [0, 1, 2].map((pose) => dancerSvg(d, pose))),
      DANCER.w,
      DANCER.h,
      // Two dancers to a row: a sheet of 20 stays under 4096 px tall (phones' texture limit).
      6,
    );
  }
  const rocket = await grid([0, 1, 2, 3, 4].map(rocketSvg), TRAIN.w, TRAIN.h, 5);
  const machines = await grid(MACHINES.map(machineSvg), MACHINE, MACHINE, MACHINES.length);
  const counters = await grid(COUNTERS.map(counterSvg), COUNTER, COUNTER, COUNTERS.length);
  const flyers = await grid(FLYERS.map(flyerSvg), FLYER, FLYER, FLYERS.length);
  const icons = await grid(ICON_ORDER.map(iconSvg), ICON, ICON, ICON_ORDER.length);
  const backdrops = {};
  for (const look of LOOKS) {
    backdrops[look] = await Promise.all(Array.from({ length: BACKDROPS }, (_, v) => png(backdropSvg(look, v))));
  }

  const webp = { quality: 90, alphaQuality: 100, effort: 6 };
  const bg = { quality: 84, effort: 6 };
  const files = [
    [resolve(HERO_DIR, 'puzzle-pics.webp'), sharp(pics).webp(webp)],
    ...LOOKS.map((look) => [resolve(HERO_DIR, `theme-${look}-dancers-3.webp`), sharp(dancers[look]).webp(webp)]),
    [resolve(HERO_DIR, 'theme-cosmos-train.webp'), sharp(rocket).webp(webp)],
    [resolve(HERO_DIR, 'theme-machines.webp'), sharp(machines).webp(webp)],
    [resolve(HERO_DIR, 'theme-counters-2.webp'), sharp(counters).webp(webp)],
    [resolve(HERO_DIR, 'theme-flyers.webp'), sharp(flyers).webp(webp)],
    [resolve(HERO_DIR, 'puzzle-icons-2.webp'), sharp(icons).webp(webp)],
    ...LOOKS.flatMap((look) =>
      backdrops[look].map((b, v) => [resolve(BG_DIR, `theme-${look}-${v + 1}.webp`), sharp(b).webp(bg)]),
    ),
    [
      resolve(BG_DIR, 'puzzle-words.webp'),
      sharp(backdrops.critters[0]).modulate({ brightness: MENU_BRIGHTNESS }).webp(bg),
    ],
    [resolve(BG_DIR, 'puzzle-numbers.webp'), sharp(backdrops.cosmos[0]).modulate({ brightness: 0.7 }).webp(bg)],
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
    const sheets = [pics, dancers.critters, dancers.cosmos, rocket, machines, counters, flyers, icons];
    const metas = await Promise.all(sheets.map((b) => sharp(b).metadata()));
    const thumbs = await Promise.all(
      LOOKS.flatMap((look) => backdrops[look].map((b) => sharp(b).resize(320, 180).png().toBuffer())),
    );
    let x = 10;
    let y = 10;
    let rowH = 0;
    const comps = [];
    const maxW = 2000;
    sheets.forEach((input, i) => {
      if (x + metas[i].width > maxW) {
        x = 10;
        y += rowH + 16;
        rowH = 0;
      }
      comps.push({ input, left: x, top: y });
      x += metas[i].width + 16;
      rowH = Math.max(rowH, metas[i].height);
    });
    y += rowH + 16;
    thumbs.forEach((input, i) => comps.push({ input, left: 10 + (i % 6) * 330, top: y + Math.floor(i / 6) * 190 }));
    y += Math.ceil(thumbs.length / 6) * 190;
    await sharp({ create: { width: maxW + 20, height: y + 10, channels: 4, background: '#e9e4f5' } })
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
