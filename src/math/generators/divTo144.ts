// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config } from '@/core/config';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Divide-to-144 generator (inverse of mult-to-144 — "tables up to 12×12").
 *
 * Same shape as `divTo100` with the factor range widened to [2, 12]:
 * divisor + quotient in [2, 12], dividend in [4, 144]. Factor-uniform
 * sampling, Unicode `÷` operator — see `divTo100.ts` for the full
 * pedagogical rationale (one source-of-truth comment to avoid drift).
 *
 * **Why a separate tile from `div-to-100`**: mirrors the mult-to-100 /
 * mult-to-144 split. 10×10 is the standard elementary curriculum endpoint;
 * 12×12 is the extended traditional tables range. A kid who masters the
 * 10×10 inverse table feels rewarded by graduating to the 12×12 inverse.
 *
 * TODO (deferred — sprint 1.x): same `factorSubset?: number[]` plumbing
 * call-out as in `divTo100.ts` and the mult generators.
 */
const FACTOR_MIN = 2;
const FACTOR_MAX = 12;

const divTo144: QuestionGenerator = {
  id: 'div-to-144',
  label: 'Divide 12×12',
  description: 'Inverse of tables up to 12×12.',
  generate(rng = defaultRng): Question {
    const factorRange = FACTOR_MAX - FACTOR_MIN + 1; // 11
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
      prompt: `${dividend} ÷ ${divisor} = ?`,
      correctAnswer,
      choices: shuffleAnswers(correctAnswer, distractors, rng),
    };
  },
};

export default divTo144;
