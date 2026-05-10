// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';

/**
 * Pure-data math for stacked menu layouts. Lives in its own module
 * (separate from `MenuLayout.ts`) so it can be unit-tested without
 * pulling Phaser into the import graph — `MenuLayout.ts` re-exports
 * `computeStackSlots` for production callers, but tests target this
 * file directly.
 */

export type ButtonKind = 'primary' | 'secondary';

export interface StackedSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute the x/y/width/height for each item in a vertically-stacked
 * menu, given the stack's center, the gap, and each item's kind.
 *
 * Returns slots in the same order as `items`. The geometry rule:
 *   - sum every item's height + (n-1) gaps = total stack height
 *   - top of stack = centerY - totalHeight / 2
 *   - each slot's `y` is anchored at its own CENTER (matches Phaser's
 *     default text/rectangle origin convention used by PlaceholderButton)
 *
 * Width + height per slot picked from `config.layout.button` based on
 * kind (defaults to 'primary' when kind is unspecified).
 */
export function computeStackSlots(
  centerX: number,
  centerY: number,
  gap: number,
  items: ReadonlyArray<{ kind?: ButtonKind }>,
): StackedSlot[] {
  if (items.length === 0) return [];

  const widths = items.map((it) =>
    (it.kind ?? 'primary') === 'primary'
      ? config.layout.button.primaryW
      : config.layout.button.secondaryW,
  );
  const heights = items.map((it) =>
    (it.kind ?? 'primary') === 'primary'
      ? config.layout.button.primaryH
      : config.layout.button.secondaryH,
  );
  const totalHeight = heights.reduce((sum, h) => sum + h, 0) + gap * (items.length - 1);

  let y = centerY - totalHeight / 2;
  const slots: StackedSlot[] = [];
  for (let i = 0; i < items.length; i++) {
    slots.push({
      x: centerX,
      y: y + heights[i] / 2,
      width: widths[i],
      height: heights[i],
    });
    y += heights[i] + gap;
  }
  return slots;
}
