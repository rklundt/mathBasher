// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { pickSubsetWithCorrect } from '@/game/systems/numberClimbFloorMath';

/**
 * Pure helpers for Math-a-lotl (sprint 2.5.4) — no Phaser, so the wave
 * layout, facing rules and catch / escape geometry are unit-testable.
 * Locked in `mathALotlMath.test.ts`.
 */

/** One answer bubble to spawn: its value, its label, and where it starts. */
export interface BubbleSpec {
  readonly answer: number;
  /** Text shown on the bubble (fraction display string, or the bare number). */
  readonly display: string;
  readonly x: number;
  readonly y: number;
}

export interface BubbleWaveInput {
  readonly choices: readonly number[];
  readonly correctAnswer: number;
  /** Parallel to `choices` for fraction generators; undefined for integers. */
  readonly choiceDisplays?: readonly string[];
  readonly count: number;
  /** Horizontal span the lanes are spread across (bubble centres). */
  readonly leftX: number;
  readonly rightX: number;
  /** y of the FIRST bubble's centre (just below the visible floor). */
  readonly startY: number;
  /** Vertical gap between consecutive bubbles so they surface one at a time. */
  readonly staggerPx: number;
  /** Max ± horizontal jitter inside each lane. */
  readonly jitterPx: number;
  readonly rng: () => number;
}

/**
 * Build one wave of answer bubbles. Guarantees (tested):
 *  1. exactly `count` bubbles (capped at the number of choices),
 *  2. the correct answer is always among them, no duplicates,
 *  3. one bubble per evenly spaced lane, so bubbles never stack,
 *  4. start heights are `startY + k × staggerPx` for a shuffled k, so
 *     which answer surfaces first varies wave to wave.
 */
export function buildBubbleWave(input: BubbleWaveInput): BubbleSpec[] {
  const { choices, correctAnswer, choiceDisplays, rng } = input;
  const count = Math.max(1, Math.min(input.count, choices.length));
  const answers = pickSubsetWithCorrect(choices, correctAnswer, count, rng);
  const displayOf = (answer: number): string => {
    const i = choices.indexOf(answer);
    return choiceDisplays?.[i] ?? String(answer);
  };
  const laneWidth = (input.rightX - input.leftX) / count;
  const order = shuffled(
    Array.from({ length: count }, (_, i) => i),
    rng,
  );
  return answers.map((answer, lane) => ({
    answer,
    display: displayOf(answer),
    x: input.leftX + laneWidth * (lane + 0.5) + (rng() * 2 - 1) * input.jitterPx,
    y: input.startY + order[lane]! * input.staggerPx,
  }));
}

/** Which way the axolotl faces and how far its nose tilts, from its swim direction. */
export interface Facing {
  /** true = facing LEFT (the sheet's frames all face right). */
  readonly flipX: boolean;
  /** Nose tilt in radians, + = nose down, clamped to ±maxTiltRad. */
  readonly tilt: number;
}

/**
 * Facing for a swim step (dx, dy). Nearly-vertical moves keep the
 * previous left/right facing so the axolotl doesn't flicker while
 * swimming straight up or down.
 */
export function facingFor(dx: number, dy: number, prevFlipX: boolean, maxTiltRad: number): Facing {
  const flipX = Math.abs(dx) > 1 ? dx < 0 : prevFlipX;
  const raw = Math.atan2(dy, Math.max(Math.abs(dx), 1e-6));
  return { flipX, tilt: Math.max(-maxTiltRad, Math.min(maxTiltRad, raw)) };
}

/**
 * Sprite rotation for a facing. With `flipX` the texture is mirrored
 * in local space before rotation, so a nose-down tilt on a left-facing
 * axolotl is a COUNTER-clockwise (negative) rotation.
 */
export function rotationFor(facing: Facing): number {
  return facing.flipX ? -facing.tilt : facing.tilt;
}

/** Move (x, y) toward (tx, ty) by at most `maxStep`. */
export function stepToward(
  x: number,
  y: number,
  tx: number,
  ty: number,
  maxStep: number,
): { x: number; y: number; dx: number; dy: number; arrived: boolean } {
  const dx = tx - x;
  const dy = ty - y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxStep || dist === 0) return { x: tx, y: ty, dx, dy, arrived: true };
  const k = maxStep / dist;
  return { x: x + dx * k, y: y + dy * k, dx, dy, arrived: false };
}

/** A bubble has escaped once its top edge reaches the waterline. */
export function hasEscaped(bubbleY: number, radius: number, waterlineY: number): boolean {
  return bubbleY - radius <= waterlineY;
}

/** Can a bubble be caught — is it within `catchRadius` + its own radius of the axolotl's head? */
export function isWithinCatch(
  head: { x: number; y: number },
  bubble: { x: number; y: number },
  bubbleRadius: number,
  catchRadius: number,
): boolean {
  return Math.hypot(bubble.x - head.x, bubble.y - head.y) <= bubbleRadius + catchRadius;
}

/**
 * The bubble a tap lands on: the nearest one whose centre is within
 * `radius × slop` of the tap (slop > 1 gives small fingers a bigger
 * target than the drawn bubble). Returns the index, or -1 for open water.
 */
export function pickTappedBubble(
  tap: { x: number; y: number },
  bubbles: ReadonlyArray<{ x: number; y: number }>,
  radius: number,
  slop: number,
): number {
  let best = -1;
  let bestDist = radius * slop;
  bubbles.forEach((b, i) => {
    const d = Math.hypot(b.x - tap.x, b.y - tap.y);
    if (d <= bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/** Clamp a point into the swimmable water rectangle. */
export function clampToWater(
  x: number,
  y: number,
  bounds: { left: number; right: number; top: number; bottom: number },
): { x: number; y: number } {
  return {
    x: Math.max(bounds.left, Math.min(bounds.right, x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom, y)),
  };
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
