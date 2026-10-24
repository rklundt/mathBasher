// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { config, type MathId, type SpeedKey } from '@/core/config';
import { ScoreCalculator, roundBonuses } from '@/services/ScoreCalculator';
import {
  formatPoints,
  fractionLevelNote,
  maxRoundScore,
  pointsMultiplierLabel,
  questionsPerRoundFor,
  upToPointsLabel,
} from '@/services/challengePoints';

const mathIds = Object.keys(config.scoring.mathDifficulty) as MathId[];
const speeds: SpeedKey[] = ['slow', 'medium', 'fast'];

describe('challengePoints', () => {
  it('"Up to" equals what a perfect round pays with both bonuses, for every challenge and difficulty', () => {
    for (const mathId of mathIds) {
      for (const speed of speeds) {
        for (const questions of [config.round.questionsPerRound, config.numberClimb.questionsPerRound]) {
          const calc = new ScoreCalculator(mathId, speed);
          for (let i = 0; i < questions; i++) calc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
          const bonus = roundBonuses(mathId, speed, true, calc.firstTryCount >= questions);
          expect(maxRoundScore(mathId, speed, questions), `${mathId} ${speed}`).toBe(
            Math.round(calc.score) + bonus.finish + bonus.perfect,
          );
        }
      }
    }
  });

  it('matches the documented top scores', () => {
    // 12 answers + 3 (Finish Bonus) + 3 (Perfect Round), sprint 2.10.
    expect(upToPointsLabel('bunny-garden', 'add-to-10', 'medium')).toBe('Up to 2,250 points!');
    expect(upToPointsLabel('alien-shoot', 'subtract-fractions', 'fast')).toBe('Up to 12,150 points!');
    expect(upToPointsLabel('frog-splash', 'add-to-10', 'slow')).toBe('Up to 1,800 points!');
  });

  it("uses each game's own round length", () => {
    expect(questionsPerRoundFor('number-climb')).toBe(config.numberClimb.questionsPerRound);
    expect(questionsPerRoundFor('penguin-slide')).toBe(config.round.questionsPerRound);
  });

  it('labels the multiplier the way kids read it', () => {
    expect(pointsMultiplierLabel('add-to-10')).toBe('1x Points');
    expect(pointsMultiplierLabel('add-to-20')).toBe('1.5x Points!');
    expect(pointsMultiplierLabel('subtract-fractions')).toBe('4.5x Points!');
  });

  it('formats points with a fixed separator', () => {
    expect(formatPoints(8100)).toBe('8,100');
    expect(formatPoints(187.5)).toBe('188');
  });

  it('notes the fraction levels only for fraction challenges', () => {
    expect(fractionLevelNote('add-fractions', 'fast')).toBe('Different bottoms');
    expect(fractionLevelNote('subtract-fractions', 'medium')).toBe('Mixed numbers');
    expect(fractionLevelNote('add-to-10', 'fast')).toBeNull();
  });
});
