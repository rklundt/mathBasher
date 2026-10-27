// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { defaultRng } from '@/math/rng';

/**
 * Sprint 2.14 — what a puzzle shows: kawaii shape tokens, Spin Match's
 * lopsided shapes, or Pair Pals' animal / dessert pictures. Pure data; the
 * scenes draw them (`src/game/ui/puzzleTokens.ts`).
 *
 * A shape token's indexes point into `config.puzzles.shapes` / `colours`
 * (and so into the tokens sheet). Size 0 is small, 1 big, turn 0–3 quarter
 * turns clockwise, count 1–3 copies, hat an index into `config.puzzles.hats`.
 */
export interface ShapeToken {
  readonly kind: 'shape';
  readonly shape: number;
  readonly colour: number;
  readonly size: number;
  readonly turn: number;
  readonly flip: boolean;
  readonly count: number;
  readonly hat: number | null;
}

/** A Spin Match shape (`config.puzzles.spinCells`), turned and maybe mirrored. */
export interface SpinToken {
  readonly kind: 'spin';
  readonly shape: number;
  readonly colour: number;
  readonly turn: number;
  readonly flip: boolean;
}

/** A Pair Pals picture (Odd One Out's kinds). */
export interface PictureToken {
  readonly kind: 'picture';
  readonly sheet: 'animals' | 'desserts';
  readonly frame: number;
}

export type Token = ShapeToken | SpinToken | PictureToken;

export const SHAPE_COUNT = config.puzzles.shapes.length;
export const COLOUR_COUNT = config.puzzles.colours.length;
export const SPIN_COUNT = config.puzzles.spinCells.length;

/** A big, upright, single, hatless shape token. */
export function shapeToken(shape: number, colour: number, more: Partial<Omit<ShapeToken, 'kind'>> = {}): ShapeToken {
  return { kind: 'shape', shape, colour, size: 1, turn: 0, flip: false, count: 1, hat: null, ...more };
}

export function spinToken(shape: number, colour: number, turn = 0, flip = false): SpinToken {
  return { kind: 'spin', shape, colour, turn, flip };
}

export function shapeIndex(name: (typeof config.puzzles.shapes)[number]): number {
  return (config.puzzles.shapes as readonly string[]).indexOf(name);
}

/** The cells a spin shape covers after its flip (mirror left-right) then its turn (quarter turns clockwise), normalised. */
export function spinCells(shape: number, turn: number, flip: boolean): string {
  let cells = (config.puzzles.spinCells[shape] as readonly (readonly number[])[]).map(([x, y]) => [flip ? -x : x, y]);
  for (let t = 0; t < ((turn % 4) + 4) % 4; t++) cells = cells.map(([x, y]) => [-y, x]);
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells
    .map(([x, y]) => `${String(x - minX)},${String(y - minY)}`)
    .sort()
    .join(' ');
}

/**
 * What a token looks like, as a string: two tokens with the same look are
 * the same choice (a spin shape turned so it looks the same is the same).
 */
export function lookOf(t: Token): string {
  switch (t.kind) {
    case 'shape':
      return `s${String(t.shape)}c${String(t.colour)}z${String(t.size)}t${String(t.turn % 4)}f${t.flip ? 1 : 0}n${String(t.count)}h${String(t.hat)}`;
    case 'spin':
      return `p${String(t.shape)}c${String(t.colour)}:${spinCells(t.shape, t.turn, t.flip)}`;
    case 'picture':
      return `${t.sheet}${String(t.frame)}`;
  }
}

export function sameLook(a: Token, b: Token): boolean {
  return lookOf(a) === lookOf(b);
}

export function randInt(n: number, rng: () => number = defaultRng): number {
  return Math.floor(rng() * n);
}

/** `count` different numbers from 0 … n−1, in random order. */
export function pickDistinct(n: number, count: number, rng: () => number = defaultRng): number[] {
  if (count > n) throw new Error(`${String(count)} of ${String(n)}`);
  return shuffled(
    Array.from({ length: n }, (_, i) => i),
    rng,
  ).slice(0, count);
}

/** Fisher–Yates, on a copy. */
export function shuffled<T>(items: readonly T[], rng: () => number = defaultRng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The tray: the right answer and `count − 1` wrong ones that all look
 * different, shuffled. `candidates` are wrong answers in order of how
 * tempting they are; `filler` makes more when they run out.
 */
export function buildChoices(
  answer: Token,
  candidates: readonly Token[],
  count: number,
  filler: () => Token,
  rng: () => number = defaultRng,
): { choices: Token[]; answer: number } {
  const seen = new Set([lookOf(answer)]);
  const wrong: Token[] = [];
  for (const c of candidates) {
    if (wrong.length === count - 1) break;
    const look = lookOf(c);
    if (seen.has(look)) continue;
    seen.add(look);
    wrong.push(c);
  }
  for (let guard = 0; wrong.length < count - 1 && guard < 500; guard++) {
    const c = filler();
    const look = lookOf(c);
    if (seen.has(look)) continue;
    seen.add(look);
    wrong.push(c);
  }
  if (wrong.length < count - 1) throw new Error('could not find enough different choices');
  const choices = shuffled([answer, ...wrong], rng);
  return { choices, answer: choices.indexOf(answer) };
}
