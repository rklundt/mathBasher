// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
// Imports the pure-geometry module directly — does NOT pull Phaser
// into the test's import graph (MenuLayout.ts itself imports
// PlaceholderButton -> Phaser, which would crash without a DOM env).
import { computeGridSlots, computeRowSlots, computeStackSlots } from '@/game/ui/menuLayoutGeometry';
import { config } from '@/core/config';

/**
 * Geometry tests for the menu-layout math. We test `computeStackSlots`
 * — the pure-data function extracted from `stackButtons` — directly,
 * which means no Phaser instantiation, no jsdom, no DOM environment.
 * The full `stackButtons` is a thin Phaser-instantiation wrapper around
 * this function; if the geometry is right, the buttons land in the
 * right place.
 *
 * These tests guard against silent breakage of the per-scene rhythm
 * (button widths, vertical centering, gap math, primary-vs-secondary
 * sizing) under future refactors.
 */
describe('computeStackSlots', () => {
  const PRI_W = config.layout.button.primaryW;
  const PRI_H = config.layout.button.primaryH;
  const SEC_W = config.layout.button.secondaryW;
  const SEC_H = config.layout.button.secondaryH;

  it('returns an empty array for an empty items list (defensive)', () => {
    expect(computeStackSlots(640, 360, 12, [])).toEqual([]);
  });

  it('places a single primary button exactly on centerX/centerY', () => {
    const slots = computeStackSlots(640, 360, 12, [{}]);
    expect(slots.length).toBe(1);
    expect(slots[0].x).toBe(640);
    expect(slots[0].y).toBe(360);
    expect(slots[0].width).toBe(PRI_W);
    expect(slots[0].height).toBe(PRI_H);
  });

  it('returns slots in declaration order so KeyboardNavigator tab order matches the items list', () => {
    const slots = computeStackSlots(640, 360, 12, [{}, {}, {}]);
    expect(slots.length).toBe(3);
    expect(slots[0].y).toBeLessThan(slots[1].y);
    expect(slots[1].y).toBeLessThan(slots[2].y);
  });

  it('centers a 3-button primary stack on centerY with the requested gap', () => {
    // 3 primaries at 64px each + 2 gaps at 12px = 192 + 24 = 216 total.
    // Stack centered on 360 → top at 252, bottom at 468.
    // Each button is anchored at its CENTER y. So:
    //   slot 0: y = 252 + 32 = 284
    //   slot 1: y = 252 + 64 + 12 + 32 = 360 (exactly centerY — sanity check)
    //   slot 2: y = 252 + 128 + 24 + 32 = 436
    const slots = computeStackSlots(640, 360, 12, [{}, {}, {}]);
    expect(slots[0].y).toBe(284);
    expect(slots[1].y).toBe(360);
    expect(slots[2].y).toBe(436);
  });

  it('honors a custom gap', () => {
    const slots = computeStackSlots(640, 360, 20, [{}, {}]);
    // First button center to second button center = primaryH + gap.
    expect(slots[1].y - slots[0].y).toBe(PRI_H + 20);
  });

  it('honors a custom centerX', () => {
    const slots = computeStackSlots(200, 360, 12, [{}]);
    expect(slots[0].x).toBe(200);
  });

  it('uses secondary width + height when kind === "secondary"', () => {
    const slots = computeStackSlots(640, 360, 12, [{ kind: 'secondary' }]);
    expect(slots[0].width).toBe(SEC_W);
    expect(slots[0].height).toBe(SEC_H);
  });

  it('uses primary width + height by default (no kind specified)', () => {
    const slots = computeStackSlots(640, 360, 12, [{}]);
    expect(slots[0].width).toBe(PRI_W);
    expect(slots[0].height).toBe(PRI_H);
  });

  it('mixes primary + secondary heights correctly when summing total stack height', () => {
    // primary (64) + secondary (56) + primary (64) + 2 × 12 gap = 208 total.
    // Stack centered on 360 → top at 256.
    //   slot 0 (primary):    y = 256 + 32 = 288
    //   slot 1 (secondary):  y = 288 + 32 (rest of primary) + 12 + 28 (half secondary) = 360
    //   slot 2 (primary):    y = 360 + 28 + 12 + 32 = 432
    const slots = computeStackSlots(640, 360, 12, [{}, { kind: 'secondary' }, {}]);
    expect(slots[0].y).toBe(288);
    expect(slots[1].y).toBe(360);
    expect(slots[2].y).toBe(432);
  });

  it('keeps slot widths independent per item (mixed-width stack)', () => {
    const slots = computeStackSlots(640, 360, 12, [{}, { kind: 'secondary' }, {}]);
    expect(slots[0].width).toBe(PRI_W);
    expect(slots[1].width).toBe(SEC_W);
    expect(slots[2].width).toBe(PRI_W);
  });

  it('handles an all-secondary stack (consistent narrow column)', () => {
    const slots = computeStackSlots(640, 360, 12, [
      { kind: 'secondary' },
      { kind: 'secondary' },
      { kind: 'secondary' },
    ]);
    // 3 × 56 + 2 × 12 = 192 total. Top at 360 - 96 = 264.
    //   slot 0: 264 + 28 = 292
    //   slot 1: 264 + 56 + 12 + 28 = 360
    //   slot 2: 264 + 112 + 24 + 28 = 428
    expect(slots[0].y).toBe(292);
    expect(slots[1].y).toBe(360);
    expect(slots[2].y).toBe(428);
    expect(slots.every((s) => s.width === SEC_W)).toBe(true);
  });
});

describe('computeRowSlots', () => {
  it('centres a row of three secondary buttons with the gap between them', () => {
    const { secondaryW, secondaryH } = config.layout.button;
    const slots = computeRowSlots(640, 550, config.layout.button.rowGapPx, 3);
    expect(slots).toHaveLength(3);
    expect(slots[1].x).toBe(640);
    expect(slots[2].x - slots[1].x).toBe(secondaryW + config.layout.button.rowGapPx);
    for (const s of slots) expect([s.y, s.width, s.height]).toEqual([550, secondaryW, secondaryH]);
  });

  it('fits the 1280-wide canvas', () => {
    const slots = computeRowSlots(640, 550, config.layout.button.rowGapPx, 3);
    expect(slots[0].x - slots[0].width / 2).toBeGreaterThan(0);
    expect(slots[2].x + slots[2].width / 2).toBeLessThan(1280);
  });

  it('returns nothing for an empty row', () => {
    expect(computeRowSlots(640, 550, config.layout.button.rowGapPx, 0)).toEqual([]);
  });
});

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

  it('fits the challenge grid inside the 1280-wide canvas', () => {
    const slots = computeGridSlots(640, 230, 11, config.layout.challengeFlow.grid);
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
    const rowBottom =
      config.layout.challengeFlow.gameOver.playAgainY + roundEnd.playAgainH / 2 + roundEnd.rowGapY + roundEnd.rowH;
    expect(rowBottom).toBeLessThanOrEqual(688);
  });

  it('handles nothing to lay out', () => {
    expect(computeGridSlots(640, 100, 0, spec)).toEqual([]);
  });
});
