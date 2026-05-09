// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type MathId, type SpeedKey } from '@/core/config';

/**
 * Per-question outcome reported to the calculator from the gameplay loop.
 *
 * `wasCorrect` is the obvious one: did the player's final shot land on the
 * alien carrying the right answer? `usedWrongShot` records whether they fired
 * once at a wrong answer FIRST — that triggers the descent-speed penalty AND
 * (per the design) halves the points awarded for the eventual correct shot.
 */
export interface QuestionOutcome {
  wasCorrect: boolean;
  usedWrongShot: boolean;
}

/**
 * Round-scoring math, kept in its own class so it can be unit-tested without
 * spinning up a game scene. The gameplay loop should NOT inline this math
 * (`gameplay code is thin; logic is testable` is the rule).
 *
 * Construct one calculator per round, feed it `recordOutcome` after each
 * question, then read `score` / `correctCount` / `passed` / `stars` at the
 * end to populate the GameOverScene + ScoreEntry.
 */
export class ScoreCalculator {
  private readonly mathMultiplier: number;
  private readonly speedMultiplier: number;
  private _score = 0;
  private _correctCount = 0;

  constructor(mathId: MathId, speed: SpeedKey) {
    this.mathMultiplier = config.scoring.mathDifficulty[mathId];
    this.speedMultiplier = config.scoring.speed[speed].multiplier;
  }

  recordOutcome(outcome: QuestionOutcome): void {
    if (!outcome.wasCorrect) {
      // Timeout or never hit the right answer — zero points, doesn't increment
      // the correct count.
      return;
    }
    this._correctCount += 1;
    const wrongShotMult = outcome.usedWrongShot
      ? config.scoring.afterWrongShotMultiplier
      : 1;
    this._score +=
      config.scoring.basePerCorrect *
      this.mathMultiplier *
      this.speedMultiplier *
      wrongShotMult;
  }

  get score(): number {
    return this._score;
  }

  get correctCount(): number {
    return this._correctCount;
  }

  /** True when the round met the passing threshold from `config.round.passingCorrect`. */
  get passed(): boolean {
    return this._correctCount >= config.round.passingCorrect;
  }

  /**
   * Star rating, 0 to 3. Thresholds come from `config.round.starThresholds`
   * (e.g. `[14, 17, 19]`): 0 stars below the first threshold, 1 star at or
   * above the first, 2 stars at or above the second, 3 stars at or above the
   * third.
   */
  get stars(): 0 | 1 | 2 | 3 {
    const [oneStar, twoStar, threeStar] = config.round.starThresholds;
    if (this._correctCount >= threeStar) return 3;
    if (this._correctCount >= twoStar) return 2;
    if (this._correctCount >= oneStar) return 1;
    return 0;
  }
}
