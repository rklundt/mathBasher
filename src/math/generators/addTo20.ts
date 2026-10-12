// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { answerWeightedTable, pickWeighted, type Operands } from '@/math/questionMix';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Add-to-20 generator.
 *
 * Two addends `a, b ≥ 1` with `a + b ≤ 20` — teen addends included
 * (12 + 5, 14 + 6) — drawn from a weighted table of every such problem
 * (sprint 2.5.7, `src/math/questionMix.ts`):
 *
 *  - sums 10–20 come up equally often; single-digit sums (2 + 2, 2 + 5)
 *    are rare (about 1 in 8) — this tier is a step up from Add to 10;
 *  - among problems with the same sum, two single digits that cross ten
 *    (8 + 7) are favoured, and "+ 1" / "+ 10" are rarer.
 *
 * No "+ 0": 0 + N is trivially N — not practice for a kid who has already
 * mastered Add to 10 (which keeps 0 as a valid addend).
 *
 * Tuning history:
 *   v2.5.7: was uniform over sums 2–20 with both addends in [1, 10], so
 *     8 of 19 answers (42%) were single digits.
 *
 * Distractors are 3 distinct integers within ± `nearDistractorSpread` of the
 * sum (inside [2, 20]), then shuffled with the correct answer.
 */
const SUM_MIN = 2;
const SUM_MAX = 20;
const ADDEND_MIN = 1;

const mix = config.questionMix.addTo20;
const problems: Operands[] = [];
for (let a = ADDEND_MIN; a <= SUM_MAX - ADDEND_MIN; a++) {
  for (let b = ADDEND_MIN; a + b <= SUM_MAX; b++) problems.push({ a, b, answer: a + b });
}
const TABLE = answerWeightedTable(
  problems,
  (p) => p.answer,
  (sum) => (sum < 10 ? mix.singleDigitAnswerWeight : 1),
  (p) => {
    let w = p.a <= 9 && p.b <= 9 && p.answer > 10 ? mix.crossTenWeight : 1;
    if (p.a === 1 || p.b === 1) w *= mix.plusOneWeight;
    if (p.a === 10 || p.b === 10) w *= mix.plusTenWeight;
    return w;
  },
);

const addTo20: QuestionGenerator = {
  id: 'add-to-20',
  label: 'Add to 20',
  generate(rng = defaultRng): Question {
    const { a, b, answer: correctAnswer } = pickWeighted(TABLE, rng);

    const distractorCount = config.layout.targetLanes - 1;
    const distractors = pickDistractors(correctAnswer, {
      count: distractorCount,
      min: SUM_MIN,
      max: SUM_MAX,
      near: config.questionMix.nearDistractorSpread,
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
