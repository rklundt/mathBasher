// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { inTapWindow, laneAt, laneCenters, laneForNumberKey, pickLaneLooks } from '@/game/systems/laneMath';

const area = { left: 230, right: 1180, count: 5 };

describe('laneMath', () => {
  it('lane centres are evenly spaced across the area', () => {
    expect(laneCenters(area)).toEqual([325, 515, 705, 895, 1085]);
  });

  it('a tap picks the lane it lands in, clamped to the lanes that exist', () => {
    expect(laneAt(231, area)).toBe(0);
    expect(laneAt(705, area)).toBe(2);
    expect(laneAt(1179, area)).toBe(4);
    expect(laneAt(0, area)).toBe(0);
    expect(laneAt(2000, area)).toBe(4);
  });

  it('number keys pick a lane only if it exists', () => {
    expect(laneForNumberKey(0, 3)).toBe(0);
    expect(laneForNumberKey(2, 3)).toBe(2);
    expect(laneForNumberKey(3, 3)).toBeNull();
    expect(laneForNumberKey(-1, 3)).toBeNull();
  });

  it('the tap window includes its edges and nothing outside', () => {
    const w = { top: 200, bottom: 720, left: 230, right: 1180 };
    expect(inTapWindow(230, 200, w)).toBe(true);
    expect(inTapWindow(229, 300, w)).toBe(false);
    expect(inTapWindow(500, 199, w)).toBe(false);
  });

  it('looks are all different while there are enough, whatever the rng', () => {
    for (const r of [0, 0.3, 0.99]) {
      const looks = pickLaneLooks(4, 4, () => r);
      expect(new Set(looks).size).toBe(4);
    }
    expect(pickLaneLooks(5, 4, Math.random)).toHaveLength(5);
  });
});
