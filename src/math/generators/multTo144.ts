// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { shuffleAnswers } from '@/math/distractors';
import { pickMultiplicationDistractors } from '@/math/multDistractors';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Multiply-to-144 generator (extended "tables to 12×12" set — the traditional
 * times-tables range that goes one step beyond elementary mult-to-100).
 *
 * Same shape as `multTo100` with the factor range widened to [2, 12]:
 * factors `a, b ∈ [2, 12]`, product `a × b ∈ [4, 144]`. Factor-uniform
 * sampling, Unicode `×` operator — see `multTo100.ts` for the full
 * pedagogical rationale (one source-of-truth comment to avoid drift).
 *
 * **Why a separate tile from `mult-to-100`** (per user direction in sprint
 * 1.1 planning): 10×10 is the standard elementary curriculum endpoint;
 * 12×12 is a clear next-step level for a kid who's mastered 10×10.
 * Splitting them gives a kid an explicit "I conquered the 10s, now I'm
 * ready for 12s" progression marker rather than mixing all 4..144 together.
 *
 * **Distractors via `pickMultiplicationDistractors`** — same near-miss
 * neighborhood strategy as `mult-to-100`. See `multDistractors.ts` for the
 * algorithm rationale (boundary verification covers BOTH the [2,10] and
 * [2,12] factor ranges).
 *
 * TODO (deferred — sprint 1.x): same `factorSubset?: number[]` plumbing
 * call-out as in `multTo100.ts`.
 */
const FACTOR_MIN = 2;
const FACTOR_MAX = 12;
const PRODUCT_MIN = FACTOR_MIN * FACTOR_MIN; // 4
const PRODUCT_MAX = FACTOR_MAX * FACTOR_MAX; // 144

const multTo144: QuestionGenerator = {
  id: 'mult-to-144',
  label: 'Multiply 12×12',
  description: 'Tables up to 12×12.',
  generate(rng = defaultRng): Question {
    const factorRange = FACTOR_MAX - FACTOR_MIN + 1; // 11
    const a = FACTOR_MIN + Math.floor(rng() * factorRange);
    const b = FACTOR_MIN + Math.floor(rng() * factorRange);
    const correctAnswer = a * b;

    const distractorCount = config.layout.targetLanes - 1;
    const distractors = pickMultiplicationDistractors({
      a,
      b,
      factorMin: FACTOR_MIN,
      factorMax: FACTOR_MAX,
      productMin: PRODUCT_MIN,
      productMax: PRODUCT_MAX,
      count: distractorCount,
      rng,
    });

    return {
      prompt: `${a} × ${b} = ?`,
      correctAnswer,
      choices: shuffleAnswers(correctAnswer, distractors, rng),
    };
  },
};

export default multTo144;
