// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Lane geometry shared by the lane games (Penguin Slide, Bunny Garden):
 * equal-width lanes across an area, which lane a tap or a number key
 * picks, where taps count, and a fair look for each lane. Pure, so it is
 * tested in Node. Moved out of `penguinSlideMath.ts` in sprint 2.8.
 */

/** The playing area, in screen px: where the lanes live. */
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

/** Taps only count inside the window: never on the HUD bar, the hint or outside the lanes. */
export function inTapWindow(
  x: number,
  y: number,
  window: { top: number; bottom: number; left: number; right: number },
): boolean {
  return x >= window.left && x <= window.right && y >= window.top && y <= window.bottom;
}

/**
 * Which look (a colour row of a sheet) each lane gets: all different when
 * there are enough looks. Chosen without looking at the answers, so the
 * colour is never a clue to which one is right.
 */
export function pickLaneLooks(count: number, lookCount: number, rng: () => number): number[] {
  const pool = Array.from({ length: lookCount }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}
