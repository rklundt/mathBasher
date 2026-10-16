// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mulberry32 } from '@/test-utils/mulberry32';
import { config, questionSeconds } from '@/core/config';
import {
  buildBubbleWave,
  chaseHoldY,
  clampToWater,
  facingFor,
  hasEscaped,
  isWithinCatch,
  pickTappedBubble,
  resolveBubbleEvent,
  rotationFor,
  stepToward,
  visibleBubbles,
  wrongNoteY,
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
  const dz = 40;

  it('turns to face a target clearly on the other side', () => {
    expect(facingFor(100, 0, true, max, dz).flipX).toBe(false);
    expect(facingFor(-100, 0, false, max, dz).flipX).toBe(true);
  });

  it('holds its facing while the target is inside the turn deadzone', () => {
    expect(facingFor(-39, 200, false, max, dz).flipX).toBe(false);
    expect(facingFor(39, -200, true, max, dz).flipX).toBe(true);
    expect(facingFor(0, -50, true, max, dz).flipX).toBe(true);
  });

  it('tilts toward the target, clamped to ±max', () => {
    expect(facingFor(0, 100, false, max, dz).tilt).toBeCloseTo(max);
    expect(facingFor(0, -100, false, max, dz).tilt).toBeCloseTo(-max);
    expect(facingFor(10, 10, false, max, dz).tilt).toBeCloseTo(Math.PI / 4);
  });

  it('mirrors the rotation when facing left, so the nose still points down a dive', () => {
    const right = facingFor(100, 100, false, max, dz);
    const left = facingFor(-100, 100, false, max, dz);
    expect(rotationFor(right)).toBeCloseTo(Math.PI / 4);
    expect(rotationFor(left)).toBeCloseTo(-Math.PI / 4);
  });

  it('does not flicker left/right on a straight-down swim (playtest regression)', () => {
    // Replay the steering loop: the axolotl steers its MOUTH (50 px
    // ahead of its centre in the facing direction) onto a target almost
    // directly below, swaying side to side like a bubble.
    const headOffset = 50;
    let x = 600;
    let y = 250;
    let flipX = false;
    let turns = 0;
    for (let frame = 0; frame < 120; frame++) {
      const tx = 600 + 14 * Math.sin(frame / 6);
      const ty = 600;
      const f = facingFor(tx - x, ty - y, flipX, max, dz);
      if (f.flipX !== flipX) turns += 1;
      flipX = f.flipX;
      const goalX = tx - (flipX ? -headOffset : headOffset);
      const step = stepToward(x, y, goalX, ty, 8);
      x = step.x;
      y = step.y;
    }
    expect(turns).toBe(0);
  });

  it('the scenario above DID flicker under the old per-step facing rule', () => {
    // Sanity check that the regression test reproduces the bug: facing
    // from the sign of each step's dx (the pre-fix rule) flips back and
    // forth because each flip moves the mouth to the other side.
    const headOffset = 50;
    let x = 600;
    let y = 250;
    let flipX = false;
    let turns = 0;
    for (let frame = 0; frame < 120; frame++) {
      const tx = 600 + 14 * Math.sin(frame / 6);
      const goalX = tx - (flipX ? -headOffset : headOffset);
      const step = stepToward(x, y, goalX, 600, 8);
      const next: boolean = Math.abs(step.dx) > 1 ? step.dx < 0 : flipX;
      if (next !== flipX) turns += 1;
      flipX = next;
      x = step.x;
      y = step.y;
    }
    expect(turns).toBeGreaterThan(5);
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

describe('visibility + chase hold', () => {
  it('only offers bubbles that are at least partly on screen', () => {
    const r = 52;
    const bubbles = [
      { id: 'visible', y: 600, radius: r, alive: true },
      { id: 'peeking', y: 760, radius: r, alive: true }, // top edge at 708 < 720
      { id: 'hidden', y: 772, radius: r, alive: true }, // top edge exactly at 720
      { id: 'deep', y: 900, radius: r, alive: true },
      { id: 'popped', y: 500, radius: r, alive: false },
    ];
    expect(visibleBubbles(bubbles, 720).map((b) => b.id)).toEqual(['visible', 'peeking']);
  });

  it('holds a chased bubble below the escape line', () => {
    const waterline = 180;
    const r = 52;
    const hold = chaseHoldY(waterline, r, 8);
    expect(hasEscaped(hold, r, waterline)).toBe(false);
  });
});

describe('Math-a-lotl config', () => {
  it('gives every difficulty a countdown long enough for a full bubble crossing', () => {
    // Water height on the 720 design canvas, waterline to floor.
    const water = 720 * (1 - config.mathALotl.waterlineFrac);
    for (const key of ['slow', 'medium', 'fast'] as const) {
      expect(questionSeconds(key, null)).toBeGreaterThan(water / config.mathALotl.speed[key].risePxPerSec);
    }
  });

  it('never asks for more bubbles than a question has choices (4)', () => {
    for (const s of Object.values(config.mathALotl.speed)) {
      expect(s.bubbleCount).toBeGreaterThanOrEqual(2);
      expect(s.bubbleCount).toBeLessThanOrEqual(4);
    }
  });

  it('bubbles enter faster than any difficulty drifts once in view', () => {
    for (const s of Object.values(config.mathALotl.speed)) {
      expect(config.mathALotl.bubble.entryRisePxPerSec).toBeGreaterThan(s.risePxPerSec);
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

describe('wrongNoteY', () => {
  // 720-tall screen, 24 px floor margin, note rises 50 px, bubble radius 40.
  it('starts the note below a bubble near the surface', () => {
    expect(wrongNoteY(300, 40, 50, 720, 24)).toBe(390);
  });

  it('starts it above a bubble near the floor, where below would leave the screen', () => {
    expect(wrongNoteY(640, 40, 50, 720, 24)).toBe(600);
  });

  it('still fits below when it ends exactly at the floor margin', () => {
    expect(wrongNoteY(606, 40, 50, 720, 24)).toBe(696);
    expect(wrongNoteY(607, 40, 50, 720, 24)).toBe(567);
  });
});

describe('resolveBubbleEvent', () => {
  const state = (over: Partial<Parameters<typeof resolveBubbleEvent>[0]> = {}) => ({
    correctAnswer: 8,
    livesUsed: 0,
    maxLives: 3,
    usedWrongCatch: false,
    ...over,
  });

  it('1. right bubble, first try: correct, full points', () => {
    expect(resolveBubbleEvent(state(), { type: 'catch', answer: 8 })).toEqual({
      kind: 'correct',
      record: { wasCorrect: true, usedWrongShot: false },
    });
  });

  it('2. right bubble after a wrong catch: correct, half points', () => {
    expect(resolveBubbleEvent(state({ livesUsed: 1, usedWrongCatch: true }), { type: 'catch', answer: 8 })).toEqual({
      kind: 'correct',
      record: { wasCorrect: true, usedWrongShot: true },
    });
  });

  it('3. first wrong catch: a life spent, two left, the wave carries on', () => {
    expect(resolveBubbleEvent(state(), { type: 'catch', answer: 5 })).toEqual({
      kind: 'wrong',
      livesUsed: 1,
      livesRemaining: 2,
      usedWrongCatch: true,
    });
  });

  it('4. second wrong catch: one life left', () => {
    expect(resolveBubbleEvent(state({ livesUsed: 1, usedWrongCatch: true }), { type: 'catch', answer: 5 })).toEqual({
      kind: 'wrong',
      livesUsed: 2,
      livesRemaining: 1,
      usedWrongCatch: true,
    });
  });

  it('5. wrong catch on the last life: out of lives, recorded as a used miss', () => {
    expect(resolveBubbleEvent(state({ livesUsed: 2 }), { type: 'catch', answer: 5 })).toEqual({
      kind: 'out-of-lives',
      livesUsed: 3,
      livesRemaining: 0,
      usedWrongCatch: true,
      record: { wasCorrect: false, usedWrongShot: true },
    });
  });

  it('6. with one life, the first wrong catch ends the round', () => {
    expect(resolveBubbleEvent(state({ maxLives: 1 }), { type: 'catch', answer: 5 }).kind).toBe('out-of-lives');
  });

  it('7. right bubble escapes: no penalty, respawn (flag false or true)', () => {
    expect(resolveBubbleEvent(state(), { type: 'escaped', answer: 8 })).toEqual({ kind: 'escaped-correct' });
    expect(resolveBubbleEvent(state({ usedWrongCatch: true }), { type: 'escaped', answer: 8 })).toEqual({
      kind: 'escaped-correct',
    });
  });

  it('8. a wrong bubble escaping is ignored', () => {
    expect(resolveBubbleEvent(state(), { type: 'escaped', answer: 5 })).toEqual({ kind: 'escaped-wrong' });
  });

  it('9. timeout with no wrong catch: missed, no life lost', () => {
    expect(resolveBubbleEvent(state(), { type: 'timeout' })).toEqual({
      kind: 'timeout',
      record: { wasCorrect: false, usedWrongShot: false },
    });
  });

  it('10. timeout after a wrong catch: missed, marked as used', () => {
    expect(resolveBubbleEvent(state({ livesUsed: 1, usedWrongCatch: true }), { type: 'timeout' })).toEqual({
      kind: 'timeout',
      record: { wasCorrect: false, usedWrongShot: true },
    });
  });

  it('between questions (no answer) nothing counts as correct', () => {
    expect(resolveBubbleEvent(state({ correctAnswer: null }), { type: 'catch', answer: 8 }).kind).toBe('wrong');
    expect(resolveBubbleEvent(state({ correctAnswer: null }), { type: 'escaped', answer: 8 }).kind).toBe('escaped-wrong');
  });
});
