// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Subtract-within-20 generator.
 *
 * Same shape as `subTo10` but with [0, 20] range. Minuend `a ∈ [0, 20]`,
 * subtrahend `b ∈ [0, a]` (no negatives). Result sampled uniformly from
 * [0, 20]; minuend then sampled uniformly from [result, 20]; subtrahend
 * computed as `a - result`.
 *
 * Distractors are 3 distinct integers from [0, 20] not equal to the result.
 */
const RESULT_MIN = 0;
const RESULT_MAX = 20;
const MINUEND_MAX = 20;

const subTo20: QuestionGenerator = {
  id: 'sub-to-20',
  label: 'Subtract within 20',
  description: 'Take away, results 0 to 20.',
  generate(rng = defaultRng): Question {
    const resultRange = RESULT_MAX - RESULT_MIN + 1; // 21
    const correctAnswer = RESULT_MIN + Math.floor(rng() * resultRange);

    const aRange = MINUEND_MAX - correctAnswer + 1;
    const a = correctAnswer + Math.floor(rng() * aRange);
    const b = a - correctAnswer;

    const distractorCount = config.layout.targetLanes - 1;
    const distractors = pickDistractors(correctAnswer, {
      count: distractorCount,
      min: RESULT_MIN,
      max: RESULT_MAX,
      rng,
    });

    return {
      // Unicode minus (U+2212) — see subTo10.ts for rationale.
      prompt: `${a} − ${b} = ?`,
      correctAnswer,
      choices: shuffleAnswers(correctAnswer, distractors, rng),
    };
  },
};

export default subTo20;
