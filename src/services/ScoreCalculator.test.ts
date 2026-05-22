// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect, vi } from 'vitest';
import { ScoreCalculator, computeClimbStars } from '@/services/ScoreCalculator';
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
   *
   * The test uses vitest's fake timers to inject a REAL time-gap (5
   * minutes of wall-clock advance) between `recordOutcome` calls in the
   * "paused" run. If a future change makes the calculator observe time —
   * e.g. `const elapsed = Date.now() - this.lastCallMs` — that gap would
   * appear in the paused run's score and the assertion would fail.
   * Without the time-gap injection this test was a property restatement;
   * with it, it's a real probe.
   */
  it('round score is pause-invariant — outcome sequence determines score', () => {
    const sequence: Array<{ wasCorrect: boolean; usedWrongShot: boolean }> = [
      { wasCorrect: true, usedWrongShot: false },
      { wasCorrect: false, usedWrongShot: false },
      { wasCorrect: true, usedWrongShot: true }, // half points
      { wasCorrect: true, usedWrongShot: false },
      { wasCorrect: false, usedWrongShot: true },
      { wasCorrect: true, usedWrongShot: false },
    ];

    // Baseline: no pause, all outcomes recorded back-to-back.
    const uninterrupted = new ScoreCalculator(MATH_ID, SPEED);
    for (const o of sequence) uninterrupted.recordOutcome(o);

    // Pause-simulated: same outcomes, but with 5 minutes of wall-clock
    // advance between each call. Any future Date.now()/performance.now()
    // dependency in scoring would surface here as a different score.
    vi.useFakeTimers();
    try {
      const paused = new ScoreCalculator(MATH_ID, SPEED);
      for (const o of sequence) {
        paused.recordOutcome(o);
        vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes "paused"
      }
      expect(paused.score).toBe(uninterrupted.score);
      expect(paused.correctCount).toBe(uninterrupted.correctCount);
      expect(paused.passed).toBe(uninterrupted.passed);
      expect(paused.stars).toBe(uninterrupted.stars);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * Sprint 2.2 — `computeClimbStars(floorReached, totalFloors)` —
 * height-based stars for Number Climb. Pure function; lock the
 * threshold ladder so a future tuning change can't silently regress
 * the kid's GameOver-scene stars award.
 *
 * Ladder for 10 floors: floor < 4 → 0 stars, 4-6 → 1, 7-9 → 2, 10 → 3.
 */
describe('computeClimbStars', () => {
  describe('canonical 10-floor ladder', () => {
    it('floor 0 (never started climbing) → 0 stars', () => {
      expect(computeClimbStars(0, 10)).toBe(0);
    });
    it('floor 3 (just below 1-star threshold) → 0 stars', () => {
      expect(computeClimbStars(3, 10)).toBe(0);
    });
    it('floor 4 → 1 star (boundary)', () => {
      expect(computeClimbStars(4, 10)).toBe(1);
    });
    it('floor 6 → 1 star (just below 2-star threshold)', () => {
      expect(computeClimbStars(6, 10)).toBe(1);
    });
    it('floor 7 → 2 stars (boundary)', () => {
      expect(computeClimbStars(7, 10)).toBe(2);
    });
    it('floor 9 → 2 stars (just below 3-star threshold)', () => {
      expect(computeClimbStars(9, 10)).toBe(2);
    });
    it('floor 10 (top) → 3 stars', () => {
      expect(computeClimbStars(10, 10)).toBe(3);
    });
    it('floor 11 (defensive: above top) → 3 stars', () => {
      expect(computeClimbStars(11, 10)).toBe(3);
    });
  });

  describe('scales proportionally to other floor counts', () => {
    // Hypothetical 20-floor variant: thresholds scale to 8/14/20.
    it('20-floor: floor 7 → 0 stars', () => {
      expect(computeClimbStars(7, 20)).toBe(0);
    });
    it('20-floor: floor 8 → 1 star', () => {
      expect(computeClimbStars(8, 20)).toBe(1);
    });
    it('20-floor: floor 14 → 2 stars', () => {
      expect(computeClimbStars(14, 20)).toBe(2);
    });
    it('20-floor: floor 20 → 3 stars', () => {
      expect(computeClimbStars(20, 20)).toBe(3);
    });
  });
});

/**
 * Sprint 2.2.1 story 11 — cross-game max-score parity.
 *
 * After story 10 all three game modes run 12-question rounds
 * (`config.round.questionsPerRound = 12`; Number Climb passes its own
 * 12 via the RoundController override). `ScoreCalculator`'s constructor
 * is `(mathId, speed)` — there is NO game-mode axis. Score per correct
 * answer is `basePerCorrect × mathMultiplier × speedMultiplier`, all
 * three terms game-agnostic. Therefore a PERFECT round (12 clean
 * correct answers) produces an IDENTICAL maximum score in Alien Shoot,
 * Asteroid Field, and Number Climb for the same (mathId, speed).
 *
 * The per-game mechanics (Alien Shoot's wrong-shot penalty, Asteroid
 * Field's per-question timeout, Number Climb's mulligan) only reduce
 * a round BELOW max — they never change the max itself. So the games
 * are already calibrated; no per-game scoring multiplier is needed.
 *
 * This block locks the invariant: if a future change introduces a
 * per-game scoring term, the structural assertion below breaks and
 * calibration must be revisited.
 */
describe('cross-game max-score parity (story 11)', () => {
  const ROUND_SIZE = 12;

  function perfectRoundScore(mathId: MathId, speed: SpeedKey): number {
    const calc = new ScoreCalculator(mathId, speed);
    for (let i = 0; i < ROUND_SIZE; i++) {
      calc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
    }
    return calc.score;
  }

  // Reference math type for the cross-game comparison — math choice is
  // orthogonal to game choice, so any fixed mathId works; add-to-10
  // (multiplier 1.0) keeps the expected numbers easy to read.
  const REF_MATH: MathId = 'add-to-10';

  for (const speed of ['slow', 'medium', 'fast'] as SpeedKey[]) {
    it(`perfect ${speed} round = 12 × base × mathMult × speedMult`, () => {
      const expected =
        ROUND_SIZE *
        config.scoring.basePerCorrect *
        config.scoring.mathDifficulty[REF_MATH] *
        config.scoring.speed[speed].multiplier;
      expect(perfectRoundScore(REF_MATH, speed)).toBe(expected);
    });
  }

  // Cross-game parity is a structural guarantee, not a runtime one:
  // `ScoreCalculator`'s constructor signature is `(mathId, speed)` — there
  // is no game-mode parameter through which the max could diverge. The
  // per-speed formula tests above fully lock the score; a runtime test
  // comparing two identical `(mathId, speed)` calls would only restate
  // `x === x`, so none is added here.
});
