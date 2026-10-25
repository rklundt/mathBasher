// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { answerWeightedTable, pickWeighted, type Operands } from '@/math/questionMix';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';
import { wholeParts } from '@/math/equationParts';

/**
 * Add-to-10 generator.
 *
 * Two addends `a, b` from [0, 10] with `a + b <= 10`, drawn from a weighted
 * table of every such problem (sprint 2.5.7, `src/math/questionMix.ts`):
 *
 *  - answers 3–10 come up equally often; 2 (almost always 1 + 1) about
 *    half as often; 0 and 1 (0 + 0, 1 + 0) rarely;
 *  - "+ 0" problems are rare — recognising 0 + 5 = 5 is still worth
 *    seeing at this level, but not a quarter of the time.
 *
 * Tuning history:
 *   v0.6.3 (sprint 0.6.3 Story 7): uniform-`a`-then-`b` → uniform-sum, after
 *     answers felt weighted toward 7–10.
 *   v2.5.7: weighted table. Uniform-sum-then-uniform-`a` made "+ 0" about a
 *     third of all questions (every sum has two "+ 0" forms).
 *
 * Distractors are 3 distinct integers from [0, 10] not equal to the correct
 * sum, then shuffled with the correct answer to length 4 (matches
 * `config.layout.targetLanes`).
 */
const MAX_SUM = 10;
const ADDEND_MIN = 0;
const ADDEND_MAX = 10;

const mix = config.questionMix.addTo10;
const problems: Operands[] = [];
for (let a = ADDEND_MIN; a <= ADDEND_MAX; a++) {
  for (let b = ADDEND_MIN; a + b <= MAX_SUM; b++) problems.push({ a, b, answer: a + b });
}
const TABLE = answerWeightedTable(
  problems,
  (p) => p.answer,
  (sum) => (sum <= 1 ? mix.tinyAnswerWeight : sum === 2 ? mix.twoAnswerWeight : 1),
  (p) => (p.answer > 0 && (p.a === 0 || p.b === 0) ? mix.plusZeroWeight : 1),
);

const addTo10: QuestionGenerator = {
  id: 'add-to-10',
  label: 'Add to 10',
  generate(rng = defaultRng): Question {
    const { a, b, answer: correctAnswer } = pickWeighted(TABLE, rng);

    const distractorCount = config.layout.targetLanes - 1;
    const distractors = pickDistractors(correctAnswer, {
      count: distractorCount,
      min: ADDEND_MIN,
      max: ADDEND_MAX,
      rng,
    });

    return {
      prompt: `${a} + ${b} = ?`,
      parts: wholeParts(a, '+', b, correctAnswer, ADDEND_MIN, ADDEND_MAX),
      correctAnswer,
      choices: shuffleAnswers(correctAnswer, distractors, rng),
    };
  },
};

export default addTo10;
