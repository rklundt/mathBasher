// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { basketSlot, carrotDepth, carrotTopY, isHurry, visibleFrameRows } from '@/game/systems/bunnyGardenMath';
import { config } from '@/core/config';

const curve = { peekDepth: 0.4, hideSec: 0.8 };

describe('carrotDepth (the countdown)', () => {
  it('is fully up when the row appears and hidden when time is up', () => {
    expect(carrotDepth(20, 20, curve)).toBe(0);
    expect(carrotDepth(0, 20, curve)).toBe(1);
  });

  it('reaches exactly the peek depth when the final hide starts', () => {
    expect(carrotDepth(0.8, 20, curve)).toBeCloseTo(0.4, 6);
  });

  it('never goes back up as the clock runs down', () => {
    let prev = -1;
    for (let r = 20; r >= 0; r -= 0.05) {
      const d = carrotDepth(r, 20, curve);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = d;
    }
  });

  it('eases in: halfway through, the carrots are well under half of the peek depth', () => {
    expect(carrotDepth(10.4, 20, curve)).toBeLessThan(0.4 * 0.5);
  });

  it('keeps the faces showing until the final hide (shipped config)', () => {
    const c = config.bunnyGarden.carrot;
    const total = 25;
    const top = carrotTopY(
      carrotDepth(c.hideSec, total, c),
      config.bunnyGarden.cropLineY,
      c.upVisiblePx,
      c.sunkVisiblePx,
    );
    // The carrot's eyes sit 60 frame px below its top (carrot.mjs: shoulders 44 + 16); they must still be above the lip.
    const eyesBelowTop = 60 * (c.displayPx / 120);
    expect(config.bunnyGarden.cropLineY - top).toBeGreaterThanOrEqual(eyesBelowTop);
  });

  it('copes with a zero-length timer', () => {
    expect(carrotDepth(5, 0, curve)).toBe(1);
  });
});

describe('carrot crop', () => {
  it('shows the whole frame when the sprite is well above the line, none when below', () => {
    expect(visibleFrameRows(300, 494, 1, 120)).toBe(120);
    expect(visibleFrameRows(500, 494, 1, 120)).toBe(0);
    expect(visibleFrameRows(444, 494, 0.5, 120)).toBe(100);
  });
});

describe('isHurry', () => {
  it('is on only in the last quarter', () => {
    expect(isHurry(20, 20, 0.25)).toBe(false);
    expect(isHurry(5, 20, 0.25)).toBe(true);
    expect(isHurry(0, 20, 0.25)).toBe(false);
  });
});

describe('basketSlot', () => {
  const layout = config.bunnyGarden.basket;
  it('fills two rows of six, then stays on the top row', () => {
    expect(basketSlot(0, layout)).toEqual({ dx: layout.rowStartX, dy: layout.rowY[0] });
    expect(basketSlot(5, layout).dx).toBe(layout.rowStartX + 5 * layout.stepX);
    expect(basketSlot(6, layout)).toEqual({ dx: layout.rowStartX, dy: layout.rowY[1] });
    expect(basketSlot(11, layout).dy).toBe(layout.rowY[1]);
    expect(basketSlot(12, layout).dy).toBe(layout.rowY[1]);
  });
});
