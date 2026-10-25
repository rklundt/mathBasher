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
 * Subtract-within-20 generator.
 *
 * Minuend `a ∈ [0, 20]`, subtrahend `b ∈ [0, a]` (no negatives), drawn from
 * a weighted table of every such problem (sprint 2.5.7,
 * `src/math/questionMix.ts`):
 *
 *  - answers spread across 1–18 (1–9 a bit more often than 10–18), with
 *    no single answer — 10 included — standing out; 0 (x − x) and 19–20
 *    (only possible as "− 0" / "− 1") are rare;
 *  - among problems with the same answer: start from a teen number, and
 *    crossing back over ten (13 − 5) is favoured; starting from 10 or less
 *    (Subtract within 10's job), "− 0", "− 1" and "− 10" are rare.
 *
 * Tuning history:
 *   v2.5.7: was uniform over results 0–20, then uniform minuend — a third
 *     of all questions were "− 0" or "x − x", and the answers bunched up.
 *
 * Distractors are 3 distinct integers within ± `nearDistractorSpread` of the
 * result (inside [0, 20]).
 */
const RESULT_MAX = 20;
const MINUEND_MAX = 20;

const mix = config.questionMix.subTo20;
const problems: Operands[] = [];
for (let a = 0; a <= MINUEND_MAX; a++) {
  for (let b = 0; b <= a; b++) problems.push({ a, b, answer: a - b });
}
const TABLE = answerWeightedTable(
  problems,
  (p) => p.answer,
  (r) => (r === 0 || r >= 19 ? mix.edgeAnswerWeight : r >= 10 ? mix.teenAnswerWeight : 1),
  (p) => {
    let w = p.a <= 10 ? mix.smallStartWeight : p.b > p.a - 10 ? mix.crossTenWeight : 1;
    if (p.b === 0) w *= mix.minusZeroWeight;
    else if (p.b === 1) w *= mix.minusOneWeight;
    else if (p.b === 10) w *= mix.minusTenWeight;
    return w;
  },
);

const subTo20: QuestionGenerator = {
  id: 'sub-to-20',
  label: 'Subtract within 20',
  generate(rng = defaultRng): Question {
    const { a, b, answer: correctAnswer } = pickWeighted(TABLE, rng);

    const distractorCount = config.layout.targetLanes - 1;
    const distractors = pickDistractors(correctAnswer, {
      count: distractorCount,
      min: 0,
      max: RESULT_MAX,
      near: config.questionMix.nearDistractorSpread,
      rng,
    });

    return {
      // Unicode minus (U+2212) — see subTo10.ts for rationale.
      prompt: `${a} − ${b} = ?`,
      parts: wholeParts(a, '−', b, correctAnswer, 0, MINUEND_MAX),
      correctAnswer,
      choices: shuffleAnswers(correctAnswer, distractors, rng),
    };
  },
};

export default subTo20;
