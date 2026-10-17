// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/test-utils/mulberry32';
import {
  badgeScale,
  fishScale,
  inTapWindow,
  laneAt,
  laneCenters,
  laneForNumberKey,
  pickFishLooks,
  rowProgress,
  rowY,
} from '@/game/systems/penguinSlideMath';

const area = (count: number) => ({ left: 160, right: 1120, count });

describe('lanes', () => {
  it('splits the hill into equal lanes, centres left to right', () => {
    expect(laneCenters(area(3))).toEqual([320, 640, 960]);
    expect(laneCenters(area(4))).toEqual([280, 520, 760, 1000]);
    expect(laneCenters(area(5))).toEqual([256, 448, 640, 832, 1024]);
  });

  it('maps every lane centre back to its own lane, at 3, 4 and 5 lanes', () => {
    for (const count of [3, 4, 5]) {
      laneCenters(area(count)).forEach((x, i) => expect(laneAt(x, area(count))).toBe(i));
    }
  });

  it('puts a tap just inside a lane edge in that lane', () => {
    // 4 lanes of 240 px: lane 1 is 400..640.
    expect(laneAt(401, area(4))).toBe(1);
    expect(laneAt(639, area(4))).toBe(1);
    expect(laneAt(641, area(4))).toBe(2);
  });

  it('clamps taps beyond the outer lanes to the edge lanes', () => {
    expect(laneAt(0, area(5))).toBe(0);
    expect(laneAt(1280, area(5))).toBe(4);
  });

  it('number keys only pick lanes that exist', () => {
    expect(laneForNumberKey(0, 3)).toBe(0);
    expect(laneForNumberKey(2, 3)).toBe(2);
    expect(laneForNumberKey(3, 3)).toBeNull();
    expect(laneForNumberKey(4, 5)).toBe(4);
    expect(laneForNumberKey(-1, 5)).toBeNull();
  });
});

describe('the row as a countdown', () => {
  it('starts at 0, reaches 1 exactly when time is up, and never goes back', () => {
    expect(rowProgress(25, 25)).toBe(0);
    expect(rowProgress(12.5, 25)).toBe(0.5);
    expect(rowProgress(0, 25)).toBe(1);
    expect(rowProgress(-3, 25)).toBe(1);
    let last = 0;
    for (let t = 25; t >= 0; t -= 0.5) {
      const p = rowProgress(t, 25);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it('moves the row linearly from just below the horizon to the catch line', () => {
    expect(rowY(0, 260, 600)).toBe(260);
    expect(rowY(0.5, 260, 600)).toBe(430);
    expect(rowY(1, 260, 600)).toBe(600);
    expect(rowY(2, 260, 600)).toBe(600);
  });
});

describe('scale with distance', () => {
  it('fish grow from far to near', () => {
    expect(fishScale(0, 0.7, 1)).toBeCloseTo(0.7);
    expect(fishScale(1, 0.7, 1)).toBeCloseTo(1);
    expect(fishScale(0.5, 0.7, 1)).toBeCloseTo(0.85);
  });

  it('badges never shrink below the readable floor', () => {
    expect(badgeScale(0, 0.7, 1, 0.85)).toBe(0.85);
    expect(badgeScale(1, 0.7, 1, 0.85)).toBe(1);
    for (let p = 0; p <= 1; p += 0.1) expect(badgeScale(p, 0.6, 1, 0.85)).toBeGreaterThanOrEqual(0.85);
  });
});

describe('fish looks', () => {
  it('gives every fish in a row a different colour when there are enough', () => {
    const rng = mulberry32(3);
    for (let n = 0; n < 100; n++) {
      const looks = pickFishLooks(5, 5, rng);
      expect(new Set(looks).size).toBe(5);
      for (const l of looks) expect(l).toBeLessThan(5);
    }
  });

  it('does not depend on the answers: every colour turns up in every lane', () => {
    // With the right answer always in lane 0, lane 0 must still see all colours.
    const rng = mulberry32(11);
    const seen = new Set<number>();
    for (let n = 0; n < 200; n++) seen.add(pickFishLooks(4, 5, rng)[0]);
    expect(seen.size).toBe(5);
  });
});

describe('tap window', () => {
  const win = { top: 80, bottom: 700, left: 120, right: 1160 };
  it('counts taps on the hill and ignores the HUD bar and the edges', () => {
    expect(inTapWindow(640, 400, win)).toBe(true);
    expect(inTapWindow(640, 30, win)).toBe(false);
    expect(inTapWindow(60, 400, win)).toBe(false);
    expect(inTapWindow(1200, 400, win)).toBe(false);
  });
});
