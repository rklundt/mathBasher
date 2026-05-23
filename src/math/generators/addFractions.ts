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
 * Add Fractions — sprint 2.4 story 3.
 *
 * The first generator to vary its question CONTENT by the round's Speed
 * selector (sprint 2.4 story 2 plumbed the speed through). Three bands,
 * mirrored by `subtractFractions` (sprint 2.4 story 4):
 *
 *   - Easy   (speed === 'slow')   — like fractions (same denominator 2-12).
 *                                   `2/5 + 1/5 = 3/5`.
 *   - Medium (speed === 'medium') — mixed numbers with like fractions inside.
 *                                   `1 1/2 + 2 1/2 = 4`.
 *   - Hard   (speed === 'fast')   — unlike fractions; smaller denominator
 *                                   2-4, larger = 2× or 3× the smaller
 *                                   (max 12). `1/4 + 1/8 = 3/8`.
 *
 * The numeric `correctAnswer` on the returned Question is the DECIMAL value
 * (e.g. `3/8 → 0.375`) — used ONLY for internal equality + distractor-
 * distinctness checks. The kid sees the rendered fraction string via the
 * `correctDisplay` / `choiceDisplays` fields (sprint 2.4 story 1).
 *
 * Defaults to Easy when called without a speed (test convenience; production
 * always passes a speed via RoundController).
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

/** Internal shape used inside this file; not exported. */
interface OperandResult {
  prompt: string;
  /** Sum numerator BEFORE reduction (may be improper — formatter handles it). */
  correctNum: number;
  /** Sum denominator BEFORE reduction. */
  correctDen: number;
}

/** Easy band: a/d + b/d, same denominator (like fractions). */
function generateEasy(rng: () => number): OperandResult {
  const den = pickInt(rng, 2, 12);
  // Numerators 1..den-1 keep operands proper; sum may be improper (mixed result).
  const a = pickInt(rng, 1, den - 1);
  const b = pickInt(rng, 1, den - 1);
  return {
    prompt: `${a}/${den} + ${b}/${den} = ?`,
    correctNum: a + b,
    correctDen: den,
  };
}

/**
 * Medium band: mixed numbers, like fractions inside.
 * Whole parts 1-4 to keep results within a kid-friendly range.
 */
function generateMedium(rng: () => number): OperandResult {
  const den = pickInt(rng, 2, 8);
  const w1 = pickInt(rng, 1, 4);
  const w2 = pickInt(rng, 1, 4);
  const f1 = pickInt(rng, 1, den - 1);
  const f2 = pickInt(rng, 1, den - 1);
  const imp1 = mixedToImproper(w1, f1, den);
  const imp2 = mixedToImproper(w2, f2, den);
  return {
    prompt: `${w1} ${f1}/${den} + ${w2} ${f2}/${den} = ?`,
    correctNum: imp1.num + imp2.num,
    correctDen: den,
  };
}

/**
 * Hard band: unlike fractions. Smaller denominator 2-4; larger denominator
 * is 2× or 3× the smaller (max 12). One of the two operands is on each
 * denominator. Prompt order randomized so the smaller-denominator operand
 * isn't always first (keeps the kid from gaming a positional pattern).
 */
function generateHard(rng: () => number): OperandResult {
  const smallerDen = pickInt(rng, 2, 4);
  const multiplier = pickInt(rng, 2, 3);
  const largerDen = smallerDen * multiplier; // 4-12
  // `a` is the numerator over smallerDen; `b` is over largerDen.
  const a = pickInt(rng, 1, smallerDen - 1);
  const b = pickInt(rng, 1, largerDen - 1);
  // Convert a/smallerDen to the equivalent fraction over largerDen.
  const aOnLarger = a * multiplier;
  const sumNum = aOnLarger + b;

  // 50/50 swap which operand appears first in the prompt.
  const smallerFirst = rng() < 0.5;
  const prompt = smallerFirst
    ? `${a}/${smallerDen} + ${b}/${largerDen} = ?`
    : `${b}/${largerDen} + ${a}/${smallerDen} = ?`;

  return {
    prompt,
    correctNum: sumNum,
    correctDen: largerDen,
  };
}

const addFractions: QuestionGenerator = {
  id: 'add-fractions',
  label: 'Add Fractions',

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

    const distractors = buildFractionDistractors(
      rng,
      result.correctNum,
      result.correctDen,
      CHOICE_COUNT - 1,
    );

    // Combine correct + distractors as a tagged list, then shuffle once so
    // the correct answer's position is randomized in the final choices.
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

export default addFractions;
