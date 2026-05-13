// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Add-to-10 generator.
 *
 * Two addends `a, b` chosen from [0, 10] with the constraint `a + b <= 10`,
 * and the SUM (correct answer) is drawn uniformly. Algorithm:
 *   1. correctAnswer = uniform [0, 10]
 *   2. a = uniform [0, correctAnswer]
 *   3. b = correctAnswer - a
 *
 * This produces an equal-exposure distribution over the answer values — sum=0
 * (the unique pair 0+0) appears as often as sum=10 (any of 11 pairs that
 * sum to 10). Pedagogically correct for "see every answer value" learning.
 *
 * Note: the addends individually are NOT uniformly distributed over [0, 10]
 * — `a=0` has a higher marginal probability than `a=10` because every sum
 * has a valid `a=0` pairing but only sum=10 has a valid `a=10` pairing.
 * That's the right trade-off for the answer-uniformity goal.
 *
 * Tuning history:
 *   v0.6.3 (sprint 0.6.3 Story 7): switched from uniform-`a`-then-`b` to
 *     uniform-sum-then-`a`. Previous algorithm gave sum=10 ~27% of the
 *     time and sum=0 ~0.8% of the time. Surfaced during 0.6.3 playtest
 *     ("answers feel weighted toward 7-10").
 *
 * Distractors are 3 distinct integers from [0, 10] not equal to the correct
 * sum, then shuffled with the correct answer to length 4 (matches
 * `config.layout.targetLanes`).
 */
const MAX_SUM = 10;
const ADDEND_MIN = 0;
const ADDEND_MAX = 10;

const addTo10: QuestionGenerator = {
  id: 'add-to-10',
  label: 'Add to 10',
  description: 'Two numbers, sum at most 10.',
  generate(rng = defaultRng): Question {
    const correctAnswer = Math.floor(rng() * (MAX_SUM + 1)); // [0, 10] uniform
    const a = Math.floor(rng() * (correctAnswer + 1));        // [0, correctAnswer]
    const b = correctAnswer - a;

    const distractorCount = config.layout.targetLanes - 1;
    const distractors = pickDistractors(correctAnswer, {
      count: distractorCount,
      min: ADDEND_MIN,
      max: ADDEND_MAX,
      rng,
    });

    return {
      prompt: `${a} + ${b} = ?`,
      correctAnswer,
      choices: shuffleAnswers(correctAnswer, distractors, rng),
    };
  },
};

export default addTo10;
