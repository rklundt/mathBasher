// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { pickSubsetWithCorrect } from '@/game/systems/roundRules';

/**
 * Pure helpers for Frog Splash (sprint 2.5.6) — the river layout, drifting
 * pad rows, and answer assignment, with no Phaser so they're unit-testable.
 * Locked in `frogSplashMath.test.ts`.
 */

/** Vertical layout of the river world (all world-space px, y grows down). */
export interface RiverLayout {
  readonly worldHeight: number;
  /** y of the near (start) bank's shoreline. */
  readonly nearShoreY: number;
  /** y of the far bank's shoreline. */
  readonly farShoreY: number;
  /** y where the frog sits on the near bank before row 1. */
  readonly startY: number;
  /** y where the frog lands on the far bank after the last row. */
  readonly finishY: number;
  /** Centre y of each pad row, index 0 = row 1 (nearest the start). */
  readonly rowY: readonly number[];
}

export function riverLayout(opts: {
  rows: number;
  rowSpacingPx: number;
  shoreGapPx: number;
  bankHeightPx: number;
}): RiverLayout {
  const { rows, rowSpacingPx, shoreGapPx, bankHeightPx } = opts;
  // Shorelines sit 30 px inside each bank image (see scripts/sprites/pond.mjs).
  const shoreInset = 30;
  const water = 2 * shoreGapPx + (rows - 1) * rowSpacingPx;
  const worldHeight = 2 * bankHeightPx + water - 2 * shoreInset;
  const farShoreY = bankHeightPx - shoreInset;
  const nearShoreY = farShoreY + water;
  const rowY = Array.from({ length: rows }, (_, i) => nearShoreY - shoreGapPx - i * rowSpacingPx);
  return {
    worldHeight,
    nearShoreY,
    farShoreY,
    startY: nearShoreY + bankHeightPx * 0.4,
    // Just up the far bank — low enough to stay clear of the HUD bar when
    // the camera is scrolled to the very top of the world.
    finishY: farShoreY - bankHeightPx * 0.25,
    rowY,
  };
}

/** Rows alternate drift direction: row 1 drifts right, row 2 left, … */
export function rowDirection(rowIndex: number): 1 | -1 {
  return rowIndex % 2 === 0 ? 1 : -1;
}

/**
 * x of each pad in a drifting row at a given drift offset. Pads are evenly
 * spaced across a span wider than the screen and wrap, so a row never runs
 * out of pads; `offsetPx` is the accumulated drift (any sign).
 */
export function padXs(count: number, screenWidth: number, wrapExtraPx: number, offsetPx: number): number[] {
  const span = screenWidth + wrapExtraPx;
  const period = span / count;
  const start = -wrapExtraPx / 2;
  return Array.from({ length: count }, (_, i) => {
    const raw = i * period + offsetPx;
    const wrapped = ((raw % span) + span) % span;
    return start + wrapped;
  });
}

/** Is a pad (by centre x) at least partly on screen? */
export function isPadOnScreen(x: number, radius: number, screenWidth: number): boolean {
  return x + radius > 0 && x - radius < screenWidth;
}

/**
 * Answers for one row: `count` values including the correct one (no
 * duplicates), in random order, each with its display label.
 */
export function rowAnswers(input: {
  choices: readonly number[];
  correctAnswer: number;
  choiceDisplays?: readonly string[];
  count: number;
  rng: () => number;
}): Array<{ answer: number; display: string }> {
  const { choices, correctAnswer, choiceDisplays, rng } = input;
  const count = Math.max(1, Math.min(input.count, choices.length));
  return pickSubsetWithCorrect(choices, correctAnswer, count, rng).map((answer) => ({
    answer,
    display: choiceDisplays?.[choices.indexOf(answer)] ?? String(answer),
  }));
}

/** Nearest on-screen pad within `radius × slop` of a tap, or -1 for open water. */
export function pickTappedPad(
  tap: { x: number; y: number },
  pads: ReadonlyArray<{ x: number; y: number }>,
  radius: number,
  slop: number,
  screenWidth: number,
): number {
  let best = -1;
  let bestDist = radius * slop;
  pads.forEach((p, i) => {
    if (!isPadOnScreen(p.x, radius, screenWidth)) return;
    const d = Math.hypot(p.x - tap.x, p.y - tap.y);
    if (d <= bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/** Camera scroll that keeps the frog at `frogYFrac` of the view, clamped to the world. */
export function cameraScrollY(frogY: number, viewHeight: number, frogYFrac: number, worldHeight: number): number {
  const target = frogY - viewHeight * frogYFrac;
  return Math.max(0, Math.min(worldHeight - viewHeight, target));
}

/**
 * A point along the hop from `from` to a (possibly moving) `to` at progress
 * `t` ∈ [0,1]: straight-line travel plus an arc that lifts the frog
 * `arcPx` at the midpoint (screen-up = negative y).
 */
export function hopPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
  arcPx: number,
): { x: number; y: number; lift: number } {
  const k = Math.max(0, Math.min(1, t));
  const lift = Math.sin(Math.PI * k);
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k - arcPx * lift,
    lift,
  };
}
