// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type MathId, type SpeedKey } from '@/core/config';
import { roundBonuses, speedBonusFor } from '@/services/ScoreCalculator';
import type { MathGameId } from '@/core/gameIds';

/**
 * Sprint 2.9 — the points words kids see while choosing: "1.5x Points!"
 * under each challenge, and "Up to 1,500 points!" under each difficulty.
 * Pure and derived from the one scoring source (`config.scoring`), so the
 * labels can never promise something `ScoreCalculator` doesn't pay (a test
 * locks the two together).
 */

/** How many questions a round of this game has (Space Escape's floors differ). */
export function questionsPerRoundFor(gameId: MathGameId): number {
  switch (gameId) {
    case 'number-climb':
      return config.numberClimb.questionsPerRound;
    case 'alien-shoot':
    case 'asteroid-field':
    case 'math-a-lotl':
    case 'frog-splash':
    case 'space-shooter':
    case 'penguin-slide':
    case 'bunny-garden':
    case 'balance-scale':
      return config.round.questionsPerRound;
  }
}

/**
 * A perfect round's score (every answer right first time, each in the
 * fastest speed tier, sprint 2.11), with the Finish Bonus and the Perfect
 * Round bonus (sprint 2.10), rounded to whole points.
 */
export function maxRoundScore(mathId: MathId, speed: SpeedKey, questions: number): number {
  const { basePerCorrect, mathDifficulty, speed: speeds } = config.scoring;
  const answer = basePerCorrect * mathDifficulty[mathId] * speeds[speed].multiplier;
  const lightning = speedBonusFor(answer, 3);
  const bonus = roundBonuses(mathId, speed, true, true);
  return Math.round(questions * (answer + lightning)) + bonus.finish + bonus.perfect;
}

/** "1,500" — the same thousands separator everywhere, whatever the device's locale. */
export function formatPoints(points: number): string {
  return Math.round(points).toLocaleString('en-US');
}

/** "1x Points", "1.5x Points!" … "4.5x Points!" (no "!" on 1x: nothing extra to cheer). */
export function pointsMultiplierLabel(mathId: MathId): string {
  const mult = config.scoring.mathDifficulty[mathId];
  return `${String(mult)}x Points${mult > 1 ? '!' : ''}`;
}

/** "Up to 1,500 points!" for this game, challenge and difficulty. */
export function upToPointsLabel(gameId: MathGameId, mathId: MathId, speed: SpeedKey): string {
  return `Up to ${formatPoints(maxRoundScore(mathId, speed, questionsPerRoundFor(gameId)))} points!`;
}

/**
 * Fraction challenges change their problems with the difficulty (like
 * fractions, then mixed numbers, then unlike fractions), not just the time;
 * other challenges return null.
 */
export function fractionLevelNote(mathId: MathId, speed: SpeedKey): string | null {
  if (mathId !== 'add-fractions' && mathId !== 'subtract-fractions') return null;
  const notes: Record<SpeedKey, string> = {
    slow: 'Same bottoms',
    medium: 'Mixed numbers',
    fast: 'Different bottoms',
  };
  return notes[speed];
}
