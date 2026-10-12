// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { answerWeightedTable, pickWeighted, type Operands } from '@/math/questionMix';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Subtract-within-10 generator.
 *
 * Minuend `a ∈ [0, 10]`, subtrahend `b ∈ [0, a]` (no negative results — kid-
 * friendly per the project's audience), drawn from a weighted table of
 * every such problem (sprint 2.5.7, `src/math/questionMix.ts`):
 *
 *  - answers 1–9 come up equally often; 0 (x − x) and 10 (10 − 0) rarely;
 *  - "− 0" problems are rare and "− 1" a little less common.
 *
 * Tuning history:
 *   v2.5.7: was uniform over results, then uniform minuend — about half of
 *     all questions were "− 0" or "x − x".
 *
 * Distractors are 3 distinct integers from [0, 10] not equal to the result.
 */
const RESULT_MAX = 10;
const MINUEND_MAX = 10;

const mix = config.questionMix.subTo10;
const problems: Operands[] = [];
for (let a = 0; a <= MINUEND_MAX; a++) {
  for (let b = 0; b <= a; b++) problems.push({ a, b, answer: a - b });
}
const TABLE = answerWeightedTable(
  problems,
  (p) => p.answer,
  (r) => (r === 0 || r === RESULT_MAX ? mix.edgeAnswerWeight : 1),
  (p) => (p.b === 0 ? mix.minusZeroWeight : p.b === 1 ? mix.minusOneWeight : 1),
);

const subTo10: QuestionGenerator = {
  id: 'sub-to-10',
  label: 'Subtract within 10',
  generate(rng = defaultRng): Question {
    const { a, b, answer: correctAnswer } = pickWeighted(TABLE, rng);

    const distractorCount = config.layout.targetLanes - 1;
    const distractors = pickDistractors(correctAnswer, {
      count: distractorCount,
      min: 0,
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
