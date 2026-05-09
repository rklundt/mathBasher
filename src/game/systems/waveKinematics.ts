// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Pure kinematics helpers used by WaveSystem and Alien. Kept Phaser-free so
 * the math is unit-testable at the right layer.
 *
 * The model is dead simple: aliens descend at a constant speed in pixels
 * per second. `advanceY` returns the new Y after `dt` milliseconds of
 * descent. Pause is implemented at the caller (WaveSystem.update early-
 * returns when the system is paused) — this helper only knows about
 * "what's the new Y after a tick of forward motion?"
 */
export function advanceY(currentY: number, dtMs: number, speedPxPerSec: number): number {
  return currentY + (speedPxPerSec / 1000) * dtMs;
}

/**
 * Simulate the pause-aware motion loop over a series of frames. Pure: each
 * frame either advances Y (running) or holds (paused). Used by the wave
 * pause tests to verify "pause freezes Y" and "resume continues from the
 * same Y, no snap, no drift" without spinning up a full Phaser scene.
 *
 * `frames` is an ordered list of `{ dtMs, paused }`; the result is the
 * final Y after applying them in order.
 */
export function simulatePauseAwareAdvance(
  initialY: number,
  speedPxPerSec: number,
  frames: ReadonlyArray<{ dtMs: number; paused: boolean }>,
): number {
  let y = initialY;
  for (const frame of frames) {
    if (frame.paused) continue;
    y = advanceY(y, frame.dtMs, speedPxPerSec);
  }
  return y;
}
