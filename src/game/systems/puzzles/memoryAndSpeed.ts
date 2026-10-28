// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type PuzzleLevel } from '@/core/config';
import { defaultRng } from '@/math/rng';
import {
  COLOUR_COUNT,
  SHAPE_COUNT,
  randInt,
  shapeToken,
  shuffled,
  type ShapeToken,
} from '@/game/systems/puzzles/tokens';

/**
 * Sprint 2.14 — Copy Cat (working memory) and Symbol Hunt (processing
 * speed), the two puzzles that aren't "pick one". Pure and seeded
 * (`memoryAndSpeed.test.ts`).
 */

const P = config.puzzles;

// ---------------------------------------------------------------- Copy Cat

/** How long each of the round's sequences is: the level's start, one longer each time. */
export function copyCatLengths(level: PuzzleLevel, rounds: number = P.perRound): number[] {
  const start = P.copyCat.startLength[level];
  return Array.from({ length: rounds }, (_, i) => start + i);
}

/** A sequence of pads to copy; never the same pad three times running (hard to see, no fun). */
export function copyCatSequence(length: number, pads: number, rng: () => number = defaultRng): number[] {
  const out: number[] = [];
  while (out.length < length) {
    const p = randInt(pads, rng);
    const n = out.length;
    if (n >= 2 && out[n - 1] === p && out[n - 2] === p) continue;
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- Symbol Hunt

export interface HuntBoard {
  /** The sign: find every card like it. */
  readonly target: ShapeToken;
  readonly cards: readonly ShapeToken[];
  /** Where the matching cards are. */
  readonly matches: readonly number[];
}

const H = P.symbolHunt;
const colourIndex = (name: string): number => (P.colours as readonly string[]).indexOf(name);
const shapeIndex = (name: string): number => (P.shapes as readonly string[]).indexOf(name);
const NEAR_COLOURS = P.colours.map((c) =>
  (H.nearColours as Readonly<Record<string, readonly string[]>>)[c].map(colourIndex),
);
const NEAR_SHAPES = P.shapes.map((s) =>
  (H.nearShapes as Readonly<Record<string, readonly string[]>>)[s].map(shapeIndex),
);

/** One board: the sign, a grid of cards, and which of them match it (same shape and colour). */
export function huntBoard(level: PuzzleLevel, rng: () => number = defaultRng): HuntBoard {
  const n = P.symbolHunt.cards[level];
  const [lo, hi] = P.symbolHunt.targets[level];
  const k = lo + randInt(hi - lo + 1, rng);
  const target = shapeToken(randInt(SHAPE_COUNT, rng), randInt(COLOUR_COUNT, rng));
  const pickFrom = (items: readonly number[]): number => items[randInt(items.length, rng)];
  const other = (): ShapeToken => {
    if (rng() < H.lookalikes[level]) {
      // Same shape, other colour — or same colour, other shape; on Hard
      // often a near one (red next to orange, a hexagon next to a pentagon).
      const near = rng() < H.near[level];
      return rng() < 0.5
        ? shapeToken(
            target.shape,
            near
              ? pickFrom(NEAR_COLOURS[target.colour])
              : (target.colour + 1 + randInt(COLOUR_COUNT - 1, rng)) % COLOUR_COUNT,
          )
        : shapeToken(
            near
              ? pickFrom(NEAR_SHAPES[target.shape])
              : (target.shape + 1 + randInt(SHAPE_COUNT - 1, rng)) % SHAPE_COUNT,
            target.colour,
          );
    }
    // Different shape and colour.
    return shapeToken(
      (target.shape + 1 + randInt(SHAPE_COUNT - 1, rng)) % SHAPE_COUNT,
      (target.colour + 1 + randInt(COLOUR_COUNT - 1, rng)) % COLOUR_COUNT,
    );
  };
  const cards = shuffled([...Array.from({ length: k }, () => target), ...Array.from({ length: n - k }, other)], rng);
  const matches = cards.flatMap((c, i) => (c.shape === target.shape && c.colour === target.colour ? [i] : []));
  return { target, cards, matches };
}
