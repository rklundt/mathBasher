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
 */

/** The hill's running area, in screen px: where the lanes live. */
export interface LaneArea {
  left: number;
  right: number;
  count: number;
}

/** The x of each lane's centre, left to right. */
export function laneCenters(area: LaneArea): number[] {
  const w = (area.right - area.left) / area.count;
  return Array.from({ length: area.count }, (_, i) => area.left + w * (i + 0.5));
}

/** The lane a tap at `x` belongs to (clamped to the lanes that exist). */
export function laneAt(x: number, area: LaneArea): number {
  const w = (area.right - area.left) / area.count;
  return Math.max(0, Math.min(area.count - 1, Math.floor((x - area.left) / w)));
}

/** A number key 1…5 (index 0…4) picks that lane, or nothing if the lane doesn't exist. */
export function laneForNumberKey(index: number, count: number): number | null {
  return index >= 0 && index < count ? index : null;
}

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

/**
 * Which fish look (colour row of the sheet) each lane gets: all different
 * when there are enough colours. Chosen without looking at the answers, so
 * colour is never a clue to which fish is right.
 */
export function pickFishLooks(count: number, colourCount: number, rng: () => number): number[] {
  const pool = Array.from({ length: colourCount }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

/** Taps only count on the hill: never on the HUD bar along the top or outside the lanes. */
export function inTapWindow(
  x: number,
  y: number,
  window: { top: number; bottom: number; left: number; right: number },
): boolean {
  return x >= window.left && x <= window.right && y >= window.top && y <= window.bottom;
}
