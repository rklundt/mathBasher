// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Pure placement math for the game callouts (`callouts.ts`). Kept apart
 * from the Phaser helpers so it can be unit-tested in Node, like
 * `menuLayoutGeometry.ts`.
 */

/**
 * Keep a centred note's x at least `marginPx` in from both screen edges, so
 * a note over a pad or ship near the edge never runs off screen.
 */
export function clampNoteX(x: number, screenWidth: number, marginPx: number): number {
  return Math.max(marginPx, Math.min(screenWidth - marginPx, x));
}
