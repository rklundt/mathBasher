// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { config, mathTimeScale, questionSeconds, roundSeconds, scaledSeconds, type MathId } from '@/core/config';

/** Sprint 2.5.7 — harder math gets more time, in every game mode. */
describe('math time scale', () => {
  const ids = Object.keys(config.scoring.mathDifficulty) as MathId[];

  it('covers every math type, never shortens time', () => {
    expect(Object.keys(config.round.mathTimeScale).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(mathTimeScale(id), id).toBeGreaterThanOrEqual(1);
  });

  it('grows with the math: to 10 < to 20 < times / divide < fractions', () => {
    expect(mathTimeScale('add-to-10')).toBeLessThan(mathTimeScale('add-to-20'));
    expect(mathTimeScale('sub-to-20')).toBeLessThan(mathTimeScale('mult-to-100'));
    expect(mathTimeScale('div-to-144')).toBeLessThan(mathTimeScale('add-fractions'));
    expect(mathTimeScale('subtract-fractions')).toBe(Math.max(...ids.map(mathTimeScale)));
  });

  it('scales a time limit to whole seconds (no math type picked = unchanged)', () => {
    expect(scaledSeconds(10, 'add-fractions')).toBe(30);
    expect(scaledSeconds(10, 'add-to-20')).toBe(13); // 12.5 rounds up
    expect(scaledSeconds(15, null)).toBe(15);
  });
});

/** Sprint 2.6.1 — every timed game shares one base time per difficulty. */
describe('shared base time per question', () => {
  it('is 25 / 18 / 12 s, less time as it gets harder', () => {
    const b = config.round.baseQuestionSec;
    expect([b.slow, b.medium, b.fast]).toEqual([25, 18, 12]);
  });

  it('every game reads the same per-question time; Space Escape gets it per floor', () => {
    expect(questionSeconds('medium', 'add-to-10')).toBe(18);
    expect(questionSeconds('fast', 'add-fractions')).toBe(36);
    expect(roundSeconds('slow', 'add-to-10', config.numberClimb.questionsPerRound)).toBe(300);
    expect(roundSeconds('fast', 'add-to-10', config.numberClimb.questionsPerRound)).toBe(144);
  });

  it('no timed game keeps its own countdown (the shared base is the only source)', () => {
    for (const block of [
      config.asteroidField.speed,
      config.mathALotl.speed,
      config.frogSplash.speed,
      config.spaceShooter.speed,
    ]) {
      for (const s of Object.values(block)) expect('countdownSec' in s).toBe(false);
    }
    expect('speed' in config.numberClimb).toBe(false);
  });
});
