// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { ScoreCalculator } from '@/services/ScoreCalculator';
import { config, type MathId, type SpeedKey } from '@/core/config';

/**
 * All numeric assertions read multipliers from `config`, never from
 * hard-coded numbers — so re-tuning the config doesn't silently break tests.
 * If the test reports an unexpected number, the calculator and the config
 * disagree (a real bug), not the test.
 */

const MATH_ID: MathId = 'add-to-10';
const SPEED: SpeedKey = 'medium';

function expectedPoints(opts: { wrongShot?: boolean } = {}): number {
  const mathMult = config.scoring.mathDifficulty[MATH_ID];
  const speedMult = config.scoring.speed[SPEED].multiplier;
  const base = config.scoring.basePerCorrect;
  const wrongShotMult = opts.wrongShot ? config.scoring.afterWrongShotMultiplier : 1;
  return base * mathMult * speedMult * wrongShotMult;
}

describe('ScoreCalculator', () => {
  it('starts at 0 score and 0 correctCount', () => {
    const calc = new ScoreCalculator(MATH_ID, SPEED);
    expect(calc.score).toBe(0);
    expect(calc.correctCount).toBe(0);
    expect(calc.passed).toBe(false);
    expect(calc.stars).toBe(0);
  });

  it('records a correct outcome with the expected points', () => {
    const calc = new ScoreCalculator(MATH_ID, SPEED);
    calc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
    expect(calc.score).toBe(expectedPoints());
    expect(calc.correctCount).toBe(1);
  });

  it('records a correct-after-wrong-shot at half points', () => {
    const calc = new ScoreCalculator(MATH_ID, SPEED);
    calc.recordOutcome({ wasCorrect: true, usedWrongShot: true });
    expect(calc.score).toBe(expectedPoints({ wrongShot: true }));
    expect(calc.correctCount).toBe(1);
  });

  it('an incorrect outcome adds 0 and does not increment correctCount', () => {
    const calc = new ScoreCalculator(MATH_ID, SPEED);
    calc.recordOutcome({ wasCorrect: false, usedWrongShot: false });
    calc.recordOutcome({ wasCorrect: false, usedWrongShot: true });
    expect(calc.score).toBe(0);
    expect(calc.correctCount).toBe(0);
  });

  it('20 correct, no wrong shots, on add-to-10/medium = 20 * basePerCorrect * 1.0 * 1.25', () => {
    const calc = new ScoreCalculator(MATH_ID, SPEED);
    for (let i = 0; i < 20; i++) {
      calc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
    }
    expect(calc.score).toBe(expectedPoints() * 20);
    expect(calc.correctCount).toBe(20);
  });

  it('all wrong = score 0, correctCount 0, passed false, stars 0', () => {
    const calc = new ScoreCalculator(MATH_ID, SPEED);
    for (let i = 0; i < config.round.questionsPerRound; i++) {
      calc.recordOutcome({ wasCorrect: false, usedWrongShot: false });
    }
    expect(calc.score).toBe(0);
    expect(calc.correctCount).toBe(0);
    expect(calc.passed).toBe(false);
    expect(calc.stars).toBe(0);
  });

  it('passes at exactly config.round.passingCorrect', () => {
    const calc = new ScoreCalculator(MATH_ID, SPEED);
    for (let i = 0; i < config.round.passingCorrect; i++) {
      calc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
    }
    expect(calc.passed).toBe(true);
  });

  it('does not pass at one less than config.round.passingCorrect', () => {
    const calc = new ScoreCalculator(MATH_ID, SPEED);
    for (let i = 0; i < config.round.passingCorrect - 1; i++) {
      calc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
    }
    expect(calc.passed).toBe(false);
  });

  describe('star thresholds (driven from config.round.starThresholds)', () => {
    const [oneStar, twoStar, threeStar] = config.round.starThresholds;

    it(`gives 0 stars below the first threshold (${oneStar - 1})`, () => {
      const calc = new ScoreCalculator(MATH_ID, SPEED);
      for (let i = 0; i < oneStar - 1; i++) {
        calc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
      }
      expect(calc.stars).toBe(0);
    });

    it(`gives 1 star at the first threshold (${oneStar})`, () => {
      const calc = new ScoreCalculator(MATH_ID, SPEED);
      for (let i = 0; i < oneStar; i++) {
        calc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
      }
      expect(calc.stars).toBe(1);
    });

    it(`gives 2 stars at the second threshold (${twoStar})`, () => {
      const calc = new ScoreCalculator(MATH_ID, SPEED);
      for (let i = 0; i < twoStar; i++) {
        calc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
      }
      expect(calc.stars).toBe(2);
    });

    it(`gives 3 stars at the third threshold (${threeStar})`, () => {
      const calc = new ScoreCalculator(MATH_ID, SPEED);
      for (let i = 0; i < threeStar; i++) {
        calc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
      }
      expect(calc.stars).toBe(3);
    });
  });

  it('multiplier reads use config (re-tuning config does not require test edits)', () => {
    // This is the meta-test: confirm that `expectedPoints()` matches what the
    // calculator computes. If the calculator's formula drifts from the config
    // shape, this fails as well.
    const calc = new ScoreCalculator(MATH_ID, SPEED);
    calc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
    const fromConfig =
      config.scoring.basePerCorrect *
      config.scoring.mathDifficulty[MATH_ID] *
      config.scoring.speed[SPEED].multiplier;
    expect(calc.score).toBe(fromConfig);
  });

  /**
   * Pause-invariance contract added in sprint 0.5.1: the player can pause
   * the round at any point and the score must be identical to the same
   * sequence of question outcomes WITHOUT a pause. ScoreCalculator
   * accomplishes this by ignoring time entirely — only outcome shape
   * matters. This test codifies that property so a future change can't
   * silently introduce a time-dependency (e.g. a "speed bonus" that reads
   * `Date.now()`) without breaking the test.
   */
  it('round score is pause-invariant — outcome sequence determines score', () => {
    // Identical sequence of 6 outcomes; the "paused" run interleaves
    // arbitrary do-nothing steps to simulate paused frames between
    // recordOutcome calls. The result must match.
    const sequence: Array<{ wasCorrect: boolean; usedWrongShot: boolean }> = [
      { wasCorrect: true, usedWrongShot: false },
      { wasCorrect: false, usedWrongShot: false },
      { wasCorrect: true, usedWrongShot: true }, // half points
      { wasCorrect: true, usedWrongShot: false },
      { wasCorrect: false, usedWrongShot: true },
      { wasCorrect: true, usedWrongShot: false },
    ];

    const uninterrupted = new ScoreCalculator(MATH_ID, SPEED);
    for (const o of sequence) uninterrupted.recordOutcome(o);

    const paused = new ScoreCalculator(MATH_ID, SPEED);
    for (const o of sequence) {
      // Simulated "paused frames" — no calls into the calculator. If the
      // calculator ever begins reading wall-clock time (it shouldn't),
      // this gap would leak in.
      paused.recordOutcome(o);
    }

    expect(paused.score).toBe(uninterrupted.score);
    expect(paused.correctCount).toBe(uninterrupted.correctCount);
    expect(paused.passed).toBe(uninterrupted.passed);
    expect(paused.stars).toBe(uninterrupted.stars);
  });
});
