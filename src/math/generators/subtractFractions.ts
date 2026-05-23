// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { SpeedKey } from '@/core/config';
import {
  buildFractionDistractors,
  decimalValue,
  formatFraction,
  mixedToImproper,
} from '@/math/fractionMath';
import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Subtract Fractions — sprint 2.4 story 4. Mirror of `addFractions` with
 * one key difference: a **non-negative-result constraint**. The minuend
 * (the first operand in the prompt) is always ≥ the subtrahend, so the
 * answer is never negative (negative fractions are out of scope for the
 * 6-10yo target). A zero result is acceptable but rare.
 *
 * Three bands, mirroring `addFractions`:
 *
 *   - Easy   (speed === 'slow')   — like fractions (same denominator 2-12).
 *                                   `4/5 − 1/5 = 3/5`.
 *   - Medium (speed === 'medium') — mixed numbers with like fractions inside.
 *                                   `3 3/4 − 1 1/4 = 2 1/2`.
 *   - Hard   (speed === 'fast')   — unlike fractions; smaller denominator
 *                                   2-4, larger = 2× or 3× the smaller
 *                                   (max 12). `3/4 − 1/8 = 5/8`.
 *
 * Reuses the shared `buildFractionDistractors` from `src/math/fractionMath.ts`
 * so the distractor strategy stays in sync with `addFractions`.
 *
 * Per the Question display-layer contract (sprint 2.4 story 1), the
 * numeric `correctAnswer` is the decimal value; `correctDisplay` /
 * `choiceDisplays` carry the rendered fraction strings.
 *
 * Defaults to Easy when called without a speed (test convenience).
 */

const CHOICE_COUNT = 4;

function pickInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface OperandResult {
  prompt: string;
  /** Difference numerator BEFORE reduction; always ≥ 0. */
  correctNum: number;
  /** Difference denominator. */
  correctDen: number;
}

/**
 * Easy band: a/d − b/d (like fractions). Operands are ordered so a ≥ b,
 * guaranteeing a non-negative result.
 */
function generateEasy(rng: () => number): OperandResult {
  const den = pickInt(rng, 2, 12);
  // Pick two numerators in [1, den-1]; the larger goes first.
  let a = pickInt(rng, 1, den - 1);
  let b = pickInt(rng, 1, den - 1);
  if (a < b) [a, b] = [b, a];
  return {
    prompt: `${a}/${den} − ${b}/${den} = ?`,
    correctNum: a - b,
    correctDen: den,
  };
}

/**
 * Medium band: mixed numbers, like fractions inside. Operands ordered as
 * improper fractions so the first ≥ the second (guarantees non-negative
 * result, including across a whole-number borrow like `3 1/4 − 1 3/4`).
 */
function generateMedium(rng: () => number): OperandResult {
  const den = pickInt(rng, 2, 8);
  // Generate two mixed numbers, compute improper forms, order them.
  const candidates: Array<{ w: number; f: number; impNum: number }> = [];
  for (let i = 0; i < 2; i++) {
    const w = pickInt(rng, 1, 4);
    const f = pickInt(rng, 1, den - 1);
    const imp = mixedToImproper(w, f, den);
    candidates.push({ w, f, impNum: imp.num });
  }
  candidates.sort((x, y) => y.impNum - x.impNum); // larger first
  const [first, second] = candidates as [typeof candidates[0], typeof candidates[0]];
  return {
    prompt: `${first.w} ${first.f}/${den} − ${second.w} ${second.f}/${den} = ?`,
    correctNum: first.impNum - second.impNum,
    correctDen: den,
  };
}

/**
 * Hard band: unlike fractions. Smaller denominator 2-4; larger denominator
 * is 2× or 3× the smaller (max 12). Operands are ordered as fractions over
 * the larger common denominator so the first ≥ the second (non-negative
 * result). The PROMPT preserves the original mixed-denominator forms.
 */
function generateHard(rng: () => number): OperandResult {
  const smallerDen = pickInt(rng, 2, 4);
  const multiplier = pickInt(rng, 2, 3);
  const largerDen = smallerDen * multiplier; // 4-12
  // `a` is the numerator over smallerDen; `b` is over largerDen.
  const a = pickInt(rng, 1, smallerDen - 1);
  const b = pickInt(rng, 1, largerDen - 1);
  // Convert both to the larger common denominator for comparison.
  const aOnLarger = a * multiplier;
  // Pick the larger one to go FIRST in the prompt — guarantees non-negative.
  // If they're equal, result is 0 (acceptable but rare).
  let prompt: string;
  let diffNum: number;
  if (aOnLarger >= b) {
    prompt = `${a}/${smallerDen} − ${b}/${largerDen} = ?`;
    diffNum = aOnLarger - b;
  } else {
    prompt = `${b}/${largerDen} − ${a}/${smallerDen} = ?`;
    diffNum = b - aOnLarger;
  }
  return {
    prompt,
    correctNum: diffNum,
    correctDen: largerDen,
  };
}

const subtractFractions: QuestionGenerator = {
  id: 'subtract-fractions',
  label: 'Subtract Fractions',

  generate(rng = defaultRng, speed: SpeedKey = 'slow'): Question {
    let result: OperandResult;
    switch (speed) {
      case 'slow':
        result = generateEasy(rng);
        break;
      case 'medium':
        result = generateMedium(rng);
        break;
      case 'fast':
        result = generateHard(rng);
        break;
    }

    // Defensive — the per-band logic above guarantees correctNum ≥ 0; if
    // a future tweak ever breaks that invariant, surface immediately
    // rather than silently producing a malformed fraction.
    if (result.correctNum < 0) {
      throw new Error(
        `subtractFractions: produced a negative result (${result.correctNum}/${result.correctDen}) ` +
          `for prompt "${result.prompt}" — non-negative-result constraint violated.`,
      );
    }

    const distractors = buildFractionDistractors(
      rng,
      result.correctNum,
      result.correctDen,
      CHOICE_COUNT - 1,
    );

    const combined: Array<{ num: number; den: number; isCorrect: boolean }> = [
      { num: result.correctNum, den: result.correctDen, isCorrect: true },
      ...distractors.map((d) => ({ ...d, isCorrect: false })),
    ];
    const shuffled = shuffle(combined, rng);

    const choices = shuffled.map((c) => decimalValue(c.num, c.den));
    const choiceDisplays = shuffled.map((c) => formatFraction(c.num, c.den));
    const correctIdx = shuffled.findIndex((c) => c.isCorrect);
    const correctAnswer = choices[correctIdx]!;
    const correctDisplay = choiceDisplays[correctIdx]!;

    return {
      prompt: result.prompt,
      correctAnswer,
      choices,
      correctDisplay,
      choiceDisplays,
    };
  },
};

export default subtractFractions;
