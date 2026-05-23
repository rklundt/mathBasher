// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { SpeedKey } from '@/core/config';
import { decimalValue, formatFraction, mixedToImproper, reduce } from '@/math/fractionMath';
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

/**
 * Build CHOICE_COUNT-1 distractor fractions modeling common kid errors:
 *   - numerator off by ±1 (close-but-wrong)
 *   - denominator off by ±1 (close-but-wrong)
 *   - "added the denominators" (a+b)/(d+d) = (a+b)/(2d) — a classic kid error
 *     when they add numerators AND denominators of like fractions
 *
 * Distractors must be DISTINCT from each other and from the correct answer,
 * checked by both reduced-form string AND decimal value (so e.g. 2/4 and 1/2
 * are recognized as the same answer).
 */
function buildDistractors(
  rng: () => number,
  correctNum: number,
  correctDen: number,
): Array<{ num: number; den: number }> {
  const correctR = reduce(correctNum, correctDen);
  const correctKey = `${correctR.num}/${correctR.den}`;
  const correctDecimal = correctR.num / correctR.den;
  const seenKeys = new Set<string>([correctKey]);
  const seenDecimals = new Set<number>([correctDecimal]);

  // Candidate pool — generated in priority order; first CHOICE_COUNT-1
  // distinct ones win.
  const candidates: Array<{ num: number; den: number }> = [
    { num: correctNum + 1, den: correctDen },
    { num: Math.max(1, correctNum - 1), den: correctDen },
    { num: correctNum, den: correctDen + 1 },
    correctDen > 1 ? { num: correctNum, den: correctDen - 1 } : { num: correctNum + 2, den: correctDen },
    // "added the denominators" kid error: (a+b)/(2d). Approximated as
    // doubling the denominator of the correct sum — produces the half-value.
    { num: correctNum, den: correctDen * 2 },
    { num: correctNum + 2, den: correctDen },
  ];

  const picked: Array<{ num: number; den: number }> = [];
  for (const c of candidates) {
    if (c.num <= 0 || c.den <= 0) continue;
    const r = reduce(c.num, c.den);
    const key = `${r.num}/${r.den}`;
    const dec = r.num / r.den;
    if (seenKeys.has(key)) continue;
    if (seenDecimals.has(dec)) continue;
    seenKeys.add(key);
    seenDecimals.add(dec);
    picked.push(c);
    if (picked.length === CHOICE_COUNT - 1) break;
  }

  // Safety backfill — guarantees we always return CHOICE_COUNT-1 distractors
  // even on a degenerate correct answer where most candidates collapse to
  // duplicates. Walks +N from the correct numerator, finding fresh distinct
  // fractions over the correct denominator.
  let bump = 3;
  while (picked.length < CHOICE_COUNT - 1) {
    const fallback = { num: correctNum + bump, den: correctDen };
    const r = reduce(fallback.num, fallback.den);
    const key = `${r.num}/${r.den}`;
    const dec = r.num / r.den;
    if (!seenKeys.has(key) && !seenDecimals.has(dec)) {
      seenKeys.add(key);
      seenDecimals.add(dec);
      picked.push(fallback);
    }
    bump += 1;
    if (bump > 100) {
      throw new Error(
        `addFractions: could not build ${CHOICE_COUNT - 1} distinct distractors for ` +
          `correct ${correctNum}/${correctDen}. This is a generator bug.`,
      );
    }
  }

  return shuffle(picked, rng);
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

    const distractors = buildDistractors(rng, result.correctNum, result.correctDen);

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
