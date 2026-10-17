// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Sprint 2.8 — Bunny Garden's pure timing and geometry, kept apart from the
 * Phaser scene so it can be tested in Node (like `penguinSlideMath.ts`).
 * The win / lose / retry rules are the shared `resolveRetryEvent`; the
 * answers come from `pickRowAnswers`; lanes from `laneMath.ts`.
 *
 * Picture: a row of holes in the patch, one carrot per hole. The carrots'
 * depth IS the countdown: they sink on an ease-in curve until only their
 * faces peek out (`peekDepth`), then duck in over the last `hideSec`. So
 * the picture and the timer can't disagree, and pausing freezes both.
 */

export interface SinkCurve {
  /** Depth reached just before the final hide (0 = fully up, 1 = hidden). */
  peekDepth: number;
  /** The last seconds, in which the carrots duck from `peekDepth` to hidden. */
  hideSec: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * How deep the carrots are for the time left: 0 when the row appears, 1
 * when time is up. Never goes back up while the clock runs down.
 */
export function carrotDepth(remainingSec: number, totalSec: number, curve: SinkCurve): number {
  if (totalSec <= 0 || remainingSec <= 0) return 1;
  const hide = Math.min(curve.hideSec, totalSec);
  if (remainingSec <= hide) {
    // The final duck: peek → hidden.
    return curve.peekDepth + (1 - curve.peekDepth) * clamp01(1 - remainingSec / hide);
  }
  // Ease-in: slow at first, quicker as time runs short ("hurry").
  const t = clamp01(1 - (remainingSec - hide) / (totalSec - hide));
  return curve.peekDepth * t * t;
}

/** Display y of a carrot's top for a depth: from fully up to only the leaf tips above the crop line. */
export function carrotTopY(depth: number, cropLineY: number, upVisiblePx: number, sunkVisiblePx: number): number {
  const visible = upVisiblePx + (sunkVisiblePx - upVisiblePx) * clamp01(depth);
  return cropLineY - visible;
}

/** How many frame rows of a sprite show above the crop line (for `setCrop`), clamped to the frame. */
export function visibleFrameRows(spriteTopY: number, cropLineY: number, scale: number, frameHeight: number): number {
  if (scale <= 0) return 0;
  return Math.max(0, Math.min(frameHeight, (cropLineY - spriteTopY) / scale));
}

/** True in the last `hurryFrac` of the time (the leaves shiver). */
export function isHurry(remainingSec: number, totalSec: number, hurryFrac: number): boolean {
  return totalSec > 0 && remainingSec > 0 && remainingSec <= totalSec * hurryFrac;
}

/** Where the n-th carrot (0-based) sits in the basket: rows of `perRow`, offsets from the basket centre. */
export function basketSlot(
  n: number,
  layout: { perRow: number; rowStartX: number; stepX: number; rowY: readonly number[] },
): { dx: number; dy: number } {
  const row = Math.min(layout.rowY.length - 1, Math.floor(n / layout.perRow));
  const col = n % layout.perRow;
  return { dx: layout.rowStartX + col * layout.stepX, dy: layout.rowY[row] };
}
