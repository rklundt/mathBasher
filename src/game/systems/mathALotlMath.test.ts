// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mulberry32 } from '@/test-utils/mulberry32';
import { config } from '@/core/config';
import {
  buildBubbleWave,
  clampToWater,
  facingFor,
  hasEscaped,
  isWithinCatch,
  pickTappedBubble,
  rotationFor,
  stepToward,
} from '@/game/systems/mathALotlMath';

const __dirname = dirname(fileURLToPath(import.meta.url));

const baseWave = {
  choices: [7, 5, 9, 8],
  correctAnswer: 8,
  count: 4,
  leftX: 100,
  rightX: 1180,
  startY: 800,
  staggerPx: 140,
  jitterPx: 30,
};

describe('buildBubbleWave', () => {
  it('always includes the correct answer, with no duplicates, for every bubble count', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const count of [2, 3, 4]) {
        const wave = buildBubbleWave({ ...baseWave, count, rng: mulberry32(seed) });
        const answers = wave.map((b) => b.answer);
        expect(answers).toHaveLength(count);
        expect(answers).toContain(8);
        expect(new Set(answers).size).toBe(count);
      }
    }
  });

  it('caps the bubble count at the number of choices', () => {
    const wave = buildBubbleWave({ ...baseWave, count: 6, rng: mulberry32(3) });
    expect(wave).toHaveLength(4);
  });

  it('puts one bubble in each lane so bubbles never stack', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const wave = buildBubbleWave({ ...baseWave, rng: mulberry32(seed) });
      const laneW = (baseWave.rightX - baseWave.leftX) / 4;
      const lanes = wave.map((b) => Math.floor((b.x - baseWave.leftX) / laneW));
      expect(new Set(lanes).size).toBe(4);
      // Jitter keeps neighbours at least a lane minus both jitters apart.
      const xs = wave.map((b) => b.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(laneW - 2 * baseWave.jitterPx);
      }
    }
  });

  it('staggers start heights so the bubbles surface one at a time', () => {
    const wave = buildBubbleWave({ ...baseWave, rng: mulberry32(9) });
    const ys = wave.map((b) => b.y).sort((a, b) => a - b);
    expect(ys).toEqual([800, 940, 1080, 1220]);
  });

  it('labels bubbles with the fraction display strings when given', () => {
    const wave = buildBubbleWave({
      ...baseWave,
      choices: [0.5, 0.25, 0.75, 1],
      correctAnswer: 0.75,
      choiceDisplays: ['1/2', '1/4', '3/4', '1'],
      rng: mulberry32(5),
    });
    for (const b of wave) {
      const i = [0.5, 0.25, 0.75, 1].indexOf(b.answer);
      expect(b.display).toBe(['1/2', '1/4', '3/4', '1'][i]);
    }
  });

  it('labels integer bubbles with the bare number', () => {
    const wave = buildBubbleWave({ ...baseWave, rng: mulberry32(2) });
    for (const b of wave) expect(b.display).toBe(String(b.answer));
  });
});

describe('facing + rotation', () => {
  const max = (70 * Math.PI) / 180;

  it('faces right swimming right and left swimming left', () => {
    expect(facingFor(10, 0, true, max).flipX).toBe(false);
    expect(facingFor(-10, 0, false, max).flipX).toBe(true);
  });

  it('keeps the previous facing on a straight-up / straight-down swim', () => {
    expect(facingFor(0, -50, true, max).flipX).toBe(true);
    expect(facingFor(0.5, 50, false, max).flipX).toBe(false);
  });

  it('clamps the nose tilt to ±max', () => {
    expect(facingFor(0, 100, false, max).tilt).toBeCloseTo(max);
    expect(facingFor(0, -100, false, max).tilt).toBeCloseTo(-max);
    expect(facingFor(10, 10, false, max).tilt).toBeCloseTo(Math.PI / 4);
  });

  it('mirrors the rotation when facing left, so the nose still points down a dive', () => {
    const right = facingFor(10, 10, false, max);
    const left = facingFor(-10, 10, false, max);
    expect(rotationFor(right)).toBeCloseTo(Math.PI / 4);
    expect(rotationFor(left)).toBeCloseTo(-Math.PI / 4);
  });
});

describe('movement + geometry', () => {
  it('stepToward moves at most maxStep and snaps on arrival', () => {
    const mid = stepToward(0, 0, 100, 0, 30);
    expect(mid).toMatchObject({ x: 30, y: 0, arrived: false });
    const end = stepToward(90, 0, 100, 0, 30);
    expect(end).toMatchObject({ x: 100, y: 0, arrived: true });
  });

  it('hasEscaped once the bubble top touches the waterline', () => {
    expect(hasEscaped(240, 52, 180)).toBe(false);
    expect(hasEscaped(232, 52, 180)).toBe(true);
  });

  it('isWithinCatch measures from the head to the bubble edge', () => {
    expect(isWithinCatch({ x: 0, y: 0 }, { x: 100, y: 0 }, 52, 56)).toBe(true);
    expect(isWithinCatch({ x: 0, y: 0 }, { x: 120, y: 0 }, 52, 56)).toBe(false);
  });

  it('pickTappedBubble returns the nearest bubble inside the slop radius, else -1', () => {
    const bubbles = [
      { x: 100, y: 100 },
      { x: 160, y: 100 },
    ];
    expect(pickTappedBubble({ x: 150, y: 100 }, bubbles, 52, 1.2)).toBe(1);
    expect(pickTappedBubble({ x: 100, y: 160 }, bubbles, 52, 1.2)).toBe(0);
    expect(pickTappedBubble({ x: 400, y: 400 }, bubbles, 52, 1.2)).toBe(-1);
  });

  it('clampToWater keeps the target inside the water', () => {
    const b = { left: 60, right: 1220, top: 240, bottom: 660 };
    expect(clampToWater(10, 100, b)).toEqual({ x: 60, y: 240 });
    expect(clampToWater(2000, 900, b)).toEqual({ x: 1220, y: 660 });
    expect(clampToWater(500, 400, b)).toEqual({ x: 500, y: 400 });
  });
});

describe('Math-a-lotl config', () => {
  it('never asks for more bubbles than a question has choices (4)', () => {
    for (const s of Object.values(config.mathALotl.speed)) {
      expect(s.bubbleCount).toBeGreaterThanOrEqual(2);
      expect(s.bubbleCount).toBeLessThanOrEqual(4);
    }
  });

  it('gets harder going Easy → Medium → Hard (more or equal bubbles, strictly faster)', () => {
    const { slow, medium, fast } = config.mathALotl.speed;
    expect(medium.bubbleCount).toBeGreaterThanOrEqual(slow.bubbleCount);
    expect(fast.bubbleCount).toBeGreaterThanOrEqual(medium.bubbleCount);
    expect(medium.risePxPerSec).toBeGreaterThan(slow.risePxPerSec);
    expect(fast.risePxPerSec).toBeGreaterThan(medium.risePxPerSec);
  });

  it('waterline matches the backdrop generator', () => {
    const reef = readFileSync(resolve(__dirname, '../../../scripts/sprites/reef.mjs'), 'utf8');
    const m = reef.match(/export const SKY_FRAC = ([\d.]+);/);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBe(config.mathALotl.waterlineFrac);
  });
});
