// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Divide-to-100 generator (inverse of mult-to-100 — "tables up to 10×10").
 *
 * Sampling: divisor `d` + quotient `q` BOTH sampled uniformly from [2, 10],
 * then dividend computed as `d × q ∈ [4, 100]`. Question is
 * `"{dividend} ÷ {divisor} = ?"`, correct answer is `q`. This guarantees
 * integer results without rejection sampling and gives every multiplication
 * fact (and its inverse) equal practice exposure.
 *
 * **Why factor-uniform and not dividend-uniform** (pedagogically): the same
 * argument as `multTo100.ts` — products with many factor pairs (e.g. 12 has
 * the pairs 2×6, 3×4, 4×3, 6×2) would over-expose if we sampled dividend
 * first, and products with one pair (e.g. 4 = 2×2) would under-expose.
 * Factor-uniform spreads attention evenly across the 9² = 81 (divisor,
 * quotient) pairs, which is what a kid actually needs to practice.
 *
 * **Operator glyph**: Unicode division sign `÷` (U+00F7), NOT ASCII `/`.
 * The `÷` matches what kids see in textbooks and reads as division at a
 * glance; `/` reads as a fraction bar or path separator.
 *
 * **Distractors**: 3 distinct integers from [2, 10] not equal to the correct
 * quotient. Unlike multiplication (where distractors come from a near-miss
 * factor-neighborhood algorithm to avoid "obvious nonsense" choices), the
 * division distractor pool IS the valid quotient range — every distractor
 * is, by construction, a plausible answer (some other divisor's quotient).
 * So plain `pickDistractors` works fine; no near-miss adapter needed.
 *
 * TODO (deferred — sprint 1.x): expose an optional `factorSubset?: number[]`
 * option, mirroring the same call-out in `multTo100.ts`.
 */
const FACTOR_MIN = 2;
const FACTOR_MAX = 10;

const divTo100: QuestionGenerator = {
  id: 'div-to-100',
  label: 'Divide 10×10',
  generate(rng = defaultRng): Question {
    const factorRange = FACTOR_MAX - FACTOR_MIN + 1; // 9
    const divisor = FACTOR_MIN + Math.floor(rng() * factorRange);
    const quotient = FACTOR_MIN + Math.floor(rng() * factorRange);
    const dividend = divisor * quotient;
    const correctAnswer = quotient;

    const distractorCount = config.layout.targetLanes - 1;
    const distractors = pickDistractors(correctAnswer, {
      count: distractorCount,
      min: FACTOR_MIN,
      max: FACTOR_MAX,
      rng,
    });

    return {
      // Unicode division sign (U+00F7).
      prompt: `${dividend} ÷ ${divisor} = ?`,
      correctAnswer,
      choices: shuffleAnswers(correctAnswer, distractors, rng),
    };
  },
};

export default divTo100;
