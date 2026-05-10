// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
// Imports the pure-geometry module directly — does NOT pull Phaser
// into the test's import graph (MenuLayout.ts itself imports
// PlaceholderButton -> Phaser, which would crash without a DOM env).
import { computeStackSlots } from '@/game/ui/menuLayoutGeometry';
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
    const slots = computeStackSlots(640, 360, 12, [
      {},
      { kind: 'secondary' },
      {},
    ]);
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
