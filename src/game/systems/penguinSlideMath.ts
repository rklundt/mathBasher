// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Sprint 2.7 — Penguin Slide's pure geometry and timing, kept apart from
 * the Phaser scene so it can be tested in Node (like `frogSplashMath.ts`).
 * The win / lose / retry rules are the shared `resolveRetryEvent` in
 * `roundRules.ts`; the answers come from the shared `pickRowAnswers`.
 *
 * Picture: the penguin sits near the bottom of the screen on a "catch
 * line"; the hill runs away to the horizon. Each question's row of fish
 * starts just below the horizon and moves down toward the penguin. Its
 * position comes straight from the question clock, so the row reaches the
 * penguin exactly when time runs out. Lanes are straight and equal-width,
 * so "anywhere in a lane" means the same at every height.
 *
 * The lane helpers moved to the shared `laneMath.ts` (sprint 2.8) and are
 * re-exported here; `pickFishLooks` is `pickLaneLooks`.
 */

export { inTapWindow, laneAt, laneCenters, laneForNumberKey, type LaneArea } from '@/game/systems/laneMath';
export { pickLaneLooks as pickFishLooks } from '@/game/systems/laneMath';

/** Where the row is on its way down the hill: 0 when it appears, 1 when time is up. Never goes back. */
export function rowProgress(remainingSec: number, totalSec: number): number {
  if (totalSec <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - remainingSec / totalSec));
}

/** The row's y for a given progress (linear, so the distance left honestly shows the time left). */
export function rowY(progress: number, topY: number, catchY: number): number {
  return topY + (catchY - topY) * Math.max(0, Math.min(1, progress));
}

/** Fish grow as they come down the hill: `far` at the top, `near` at the catch line. */
export function fishScale(progress: number, far: number, near: number): number {
  return far + (near - far) * Math.max(0, Math.min(1, progress));
}

/** The answer badge follows the fish but never shrinks below `floor` (readable on a phone). */
export function badgeScale(progress: number, far: number, near: number, floor: number): number {
  return Math.max(floor, fishScale(progress, far, near));
}
