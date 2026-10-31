// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Pure-data math for laying out a grid of tiles, in its own module so it can
 * be unit-tested without pulling Phaser into the import graph. Sprint 2.15
 * retired the stacked and row menu layouts with the old main menu.
 */

/** One laid-out slot: a button's centre and size. */
export interface StackedSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Cell size and spacing for `computeGridSlots`. */
export interface GridSpec {
  cellW: number;
  cellH: number;
  gapX: number;
  gapY: number;
  perRow: number;
}

/**
 * Sprint 2.9 — slots for `count` same-size buttons in rows of
 * `spec.perRow`, the first row centred on `firstRowY`. Every row is
 * centred on `centerX`, a partial last row included (the challenge grid's
 * 4 + 4 + 3, Pause / Game Over's 2 × 2).
 */
export function computeGridSlots(centerX: number, firstRowY: number, count: number, spec: GridSpec): StackedSlot[] {
  if (count <= 0 || spec.perRow <= 0) return [];
  const rows = Math.ceil(count / spec.perRow);
  const slots: StackedSlot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / spec.perRow);
    const col = i % spec.perRow;
    const inRow = row < rows - 1 ? spec.perRow : count - (rows - 1) * spec.perRow;
    const rowW = inRow * spec.cellW + (inRow - 1) * spec.gapX;
    slots.push({
      x: centerX - rowW / 2 + spec.cellW / 2 + col * (spec.cellW + spec.gapX),
      y: firstRowY + row * (spec.cellH + spec.gapY),
      width: spec.cellW,
      height: spec.cellH,
    });
  }
  return slots;
}
