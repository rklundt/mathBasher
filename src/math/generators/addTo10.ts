// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { defaultRng, type Question, type QuestionGenerator } from '@/math/types';

/**
 * Add-to-10 generator.
 *
 * Two addends `a, b` chosen from [0, 10] with the constraint `a + b <= 10`.
 * The constraint is enforced by drawing `a` uniformly from [0, 10] then
 * drawing `b` uniformly from [0, 10 - a]. This is uniform over `a` but NOT
 * uniform over the joint (a, b) — small `a` gets more `b` choices than
 * large `a`. Acceptable for v1; if pedagogy ever requires uniform-pair
 * distribution, swap in a rejection-sample or precomputed pair table.
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
    const a = Math.floor(rng() * (MAX_SUM + 1)); // [0, 10]
    const b = Math.floor(rng() * (MAX_SUM - a + 1)); // [0, 10 - a]
    const correctAnswer = a + b;

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
