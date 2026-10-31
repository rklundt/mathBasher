// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
// The pure-geometry module: no Phaser in the test's import graph.
import { computeGridSlots } from '@/game/ui/menuLayoutGeometry';
import { config } from '@/core/config';

/** Geometry tests for the tile grids (the chooser, the math setup's chips) and the end-of-round buttons. */
describe('computeGridSlots (sprint 2.9)', () => {
  const spec = { cellW: 280, cellH: 96, gapX: 16, gapY: 16, perRow: 4 };

  it('lays the challenge grid out 4 + 4 + 3, every row centred', () => {
    const slots = computeGridSlots(640, 230, 11, spec);
    expect(slots).toHaveLength(11);
    expect(slots.map((s) => s.y)).toEqual([230, 230, 230, 230, 342, 342, 342, 342, 454, 454, 454]);
    // A full row is symmetric around the centre.
    expect(slots[0].x + slots[3].x).toBe(1280);
    // The partial last row (3) is centred too: its middle button sits on the centre.
    expect(slots[9].x).toBe(640);
  });

  it("fits the math setup's 11 type chips inside the 1280-wide canvas (sprint 2.15)", () => {
    const { chips } = config.layout.chooser.mathSetup;
    const slots = computeGridSlots(640, chips.firstRowY, 11, chips);
    for (const s of slots) {
      expect(s.x - s.width / 2).toBeGreaterThanOrEqual(0);
      expect(s.x + s.width / 2).toBeLessThanOrEqual(1280);
    }
  });

  it('keeps the pause card and the end-of-round buttons on screen, above the bottom gutter (sprint 2.15)', () => {
    const { pause, roundEnd } = config.layout.chooser;
    const lastPauseButton = pause.firstButtonY + 2 * (pause.buttonH + pause.gapPx) + pause.buttonH / 2;
    expect(lastPauseButton).toBeLessThanOrEqual(pause.card.y + pause.card.h);
    expect(pause.card.y + pause.card.h).toBeLessThanOrEqual(688);

    const rowW = roundEnd.widths.reduce((sum, w) => sum + w, 0) + roundEnd.gapX * (roundEnd.widths.length - 1);
    expect(rowW).toBeLessThanOrEqual(900 - 40); // inside the puzzle end panels (900 wide)
    const rowBottom = config.layout.gameOver.playAgainY + roundEnd.playAgainH / 2 + roundEnd.rowGapY + roundEnd.rowH;
    expect(rowBottom).toBeLessThanOrEqual(688);
  });

  it('handles nothing to lay out', () => {
    expect(computeGridSlots(640, 100, 0, spec)).toEqual([]);
  });
});
