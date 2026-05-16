// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Add-to-20 generator.
 *
 * Two addends `a, b` chosen from [1, 10] with `a + b ∈ [2, 20]`.
 * The SUM is sampled FIRST uniformly, then `a` is sampled uniformly from the
 * valid range that keeps both addends in [1, 10]. Algorithm:
 *   1. correctAnswer = uniform [2, 20]
 *   2. Valid `a` range = [max(1, sum-10), min(10, sum-1)]  (so b = sum-a ∈ [1, 10])
 *   3. a = uniform from that range
 *   4. b = correctAnswer - a
 *
 * Like `addTo10`, this produces an answer-uniform distribution — every sum
 * value in [2, 20] gets equal exposure. Pedagogically correct for
 * "see every answer value" learning.
 *
 * Choice of [1, 10] for addends (not [0, 10]):
 *   - 0 + N is trivially N — not interesting math practice for a kid
 *     who's already mastered "add to 10"; this tier should feel like
 *     a step up. addTo10 keeps 0 as a valid addend because at that
 *     level recognizing "0 + 5 = 5" is still useful learning.
 *
 * Distractors are 3 distinct integers from [2, 20] not equal to the correct
 * sum, then shuffled with the correct answer to length 4 (matches
 * `config.layout.targetLanes`).
 */
const SUM_MIN = 2;
const SUM_MAX = 20;
const ADDEND_MIN = 1;
const ADDEND_MAX = 10;

const addTo20: QuestionGenerator = {
  id: 'add-to-20',
  label: 'Add to 20',
  description: 'Two numbers, sum at most 20.',
  generate(rng = defaultRng): Question {
    // Uniform-over-sum: correctAnswer ∈ [2, 20]
    const sumRange = SUM_MAX - SUM_MIN + 1; // 19
    const correctAnswer = SUM_MIN + Math.floor(rng() * sumRange);

    // Constrain `a` so both addends stay in [1, 10].
    // a ∈ [max(1, sum-10), min(10, sum-1)]
    const aMin = Math.max(ADDEND_MIN, correctAnswer - ADDEND_MAX);
    const aMax = Math.min(ADDEND_MAX, correctAnswer - ADDEND_MIN);
    const aRange = aMax - aMin + 1;
    const a = aMin + Math.floor(rng() * aRange);
    const b = correctAnswer - a;

    const distractorCount = config.layout.targetLanes - 1;
    const distractors = pickDistractors(correctAnswer, {
      count: distractorCount,
      min: SUM_MIN,
      max: SUM_MAX,
      rng,
    });

    return {
      prompt: `${a} + ${b} = ?`,
      correctAnswer,
      choices: shuffleAnswers(correctAnswer, distractors, rng),
    };
  },
};

export default addTo20;
