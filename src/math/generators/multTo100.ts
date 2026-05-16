// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Multiply-to-100 generator (the standard elementary "tables to 10×10" set).
 *
 * Factors `a, b ∈ [2, 10]`, product `a × b ∈ [4, 100]`.
 *
 * **Sampling strategy: factor-uniform, NOT product-uniform.** Each factor is
 * drawn independently uniform from [2, 10]. This is the right pedagogical
 * choice because:
 *   - Product-uniform would over-expose products with many factor pairs
 *     (e.g. 12 = 2×6 = 3×4 = 4×3 = 6×2 — 4 pairs) and under-expose products
 *     with few (e.g. 4 = 2×2 only — 1 pair). Result: a kid would see "what's
 *     2×2?" essentially never.
 *   - Factor-uniform gives every multiplication FACT equal exposure, which
 *     is the actual goal of practicing times tables.
 *
 * **Operator glyph: `×` (Unicode U+00D7), NOT ASCII `x`.** ASCII `x` reads as
 * a variable in math; the proper times sign disambiguates.
 *
 * **Distractors: 3 distinct integers from [4, 100] not equal to the product.**
 * The pool is large (96 candidates after excluding the correct), so naive
 * `pickDistractors` works fine. A future improvement could bias distractors
 * toward "near-miss" products (e.g. for 7×8=56, prefer 48/54/63 over random
 * ints) — that's a separate story; out of scope here.
 *
 * TODO (deferred — sprint 1.x): expose an optional `factorSubset?: number[]`
 * option to restrict the practice set (e.g. "I only want the 7s, 8s, 9s
 * today"). Per SPRINT-PLAN row 1.4 "configurable subset," but no UI for it
 * yet so the option-plumbing is premature.
 */
const FACTOR_MIN = 2;
const FACTOR_MAX = 10;
const PRODUCT_MIN = FACTOR_MIN * FACTOR_MIN; // 4
const PRODUCT_MAX = FACTOR_MAX * FACTOR_MAX; // 100

const multTo100: QuestionGenerator = {
  id: 'mult-to-100',
  label: 'Multiply 10×10',
  description: 'Tables up to 10×10.',
  generate(rng = defaultRng): Question {
    // Factor-uniform: a, b independently uniform in [2, 10].
    const factorRange = FACTOR_MAX - FACTOR_MIN + 1; // 9
    const a = FACTOR_MIN + Math.floor(rng() * factorRange);
    const b = FACTOR_MIN + Math.floor(rng() * factorRange);
    const correctAnswer = a * b;

    const distractorCount = config.layout.targetLanes - 1;
    const distractors = pickDistractors(correctAnswer, {
      count: distractorCount,
      min: PRODUCT_MIN,
      max: PRODUCT_MAX,
      rng,
    });

    return {
      // Unicode multiplication sign (U+00D7).
      prompt: `${a} × ${b} = ?`,
      correctAnswer,
      choices: shuffleAnswers(correctAnswer, distractors, rng),
    };
  },
};

export default multTo100;
