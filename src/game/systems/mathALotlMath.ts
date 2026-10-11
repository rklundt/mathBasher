// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { pickSubsetWithCorrect } from '@/game/systems/roundRules';

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
 * Facing toward a target `(dx, dy)` away from the axolotl's CENTRE.
 *
 * Left/right only changes when the target is clearly on the OTHER side
 * — more than `turnDeadzonePx` past the centre. Inside that band the
 * previous facing holds, so swimming straight up or down (or toward a
 * bubble swaying side to side right above) never flickers. The nose
 * tilts toward the target instead, clamped to ±maxTiltRad.
 *
 * The deadzone must be measured from the centre, not the mouth: the
 * mouth's position depends on the facing, so a mouth-relative test
 * flips the facing, moves the mouth to the other side, and flips back
 * (the sprint 2.5.4 playtest flicker).
 */
export function facingFor(
  dx: number,
  dy: number,
  prevFlipX: boolean,
  maxTiltRad: number,
  turnDeadzonePx: number,
): Facing {
  let flipX = prevFlipX;
  if (prevFlipX && dx > turnDeadzonePx) flipX = false;
  else if (!prevFlipX && dx < -turnDeadzonePx) flipX = true;
  // Tilt is measured along the facing direction: a target behind the
  // axolotl (inside the deadzone) still tilts by its up/down angle.
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

/**
 * Bubbles a kid can actually see: any part above the canvas bottom.
 * Waves spawn below the floor, so taps and number keys must ignore the
 * still-hidden ones — otherwise a tap near the bottom edge could pick an
 * unseen (possibly wrong) bubble and cost a life.
 */
export function visibleBubbles<T extends { y: number; radius: number; alive: boolean }>(
  bubbles: readonly T[],
  floorY: number,
): T[] {
  return bubbles.filter((b) => b.alive && b.y - b.radius < floorY);
}

/**
 * Highest point (smallest y) a CHASED bubble may rise to: just under the
 * waterline, so a bubble the axolotl is already swimming to can't float
 * away mid-chase. Unchased bubbles rise and escape as normal.
 */
export function chaseHoldY(waterlineY: number, radius: number, marginPx: number): number {
  return waterlineY + radius + marginPx;
}

/**
 * Per-question countdown that can EXPIRE ONLY ONCE per `start()` and
 * stops ticking after `stop()` — so the timeout path can't run twice
 * (the last-question case: the round has ended but the scene still gets
 * one more update before GameOver mounts).
 */
export class QuestionClock {
  private remainingMs = 0;
  private running = false;

  start(ms: number): void {
    this.remainingMs = ms;
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  /** Advance; returns true exactly once — on the tick that reaches zero. */
  tick(dtMs: number): boolean {
    if (!this.running) return false;
    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
    if (this.remainingMs > 0) return false;
    this.running = false;
    return true;
  }

  /** Seconds left (0 once expired or stopped at zero). */
  get remainingSec(): number {
    return this.remainingMs / 1000;
  }
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
