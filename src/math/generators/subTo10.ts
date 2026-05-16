// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Subtract-within-10 generator.
 *
 * Minuend `a ∈ [0, 10]`, subtrahend `b ∈ [0, a]` (no negative results — kid-
 * friendly per the project's audience). The RESULT is sampled FIRST uniformly
 * from [0, 10], then `a` is sampled uniformly from [result, 10], then
 * `b = a - result`. Algorithm:
 *   1. correctAnswer = uniform [0, 10]
 *   2. a = uniform [correctAnswer, 10]
 *   3. b = a - correctAnswer
 *
 * Like the add-to-N generators, this produces an answer-uniform distribution —
 * every result value 0-10 gets equal exposure, which matters pedagogically more
 * than uniform-over-minuends (where the "easy" results 0 and N would dominate).
 *
 * Distractors are 3 distinct integers from [0, 10] not equal to the result.
 */
const RESULT_MIN = 0;
const RESULT_MAX = 10;
const MINUEND_MAX = 10;

const subTo10: QuestionGenerator = {
  id: 'sub-to-10',
  label: 'Subtract within 10',
  description: 'Take away, results 0 to 10.',
  generate(rng = defaultRng): Question {
    // Uniform-over-results: correctAnswer ∈ [0, 10]
    const resultRange = RESULT_MAX - RESULT_MIN + 1; // 11
    const correctAnswer = RESULT_MIN + Math.floor(rng() * resultRange);

    // a ∈ [correctAnswer, 10] so b = a - correctAnswer ∈ [0, 10-correctAnswer]
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
      // Unicode minus (U+2212) for visual parity with the math glyph used in
      // the prompt-line; ASCII '-' would also render but '−' lines up with
      // the typographic conventions kids see in textbooks.
      prompt: `${a} − ${b} = ?`,
      correctAnswer,
      choices: shuffleAnswers(correctAnswer, distractors, rng),
    };
  },
};

export default subTo10;
