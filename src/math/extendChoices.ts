// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { buildFractionDistractors, decimalValue, formatFraction, mixedToImproper } from '@/math/fractionMath';
import type { Question } from '@/math/types';

/**
 * Sprint 2.6 — more answer choices than a question was generated with.
 * Questions carry `config.layout.targetLanes` (4) choices; a game that shows
 * more targets (Space Shooter's Hard: 5 ships) tops them up here, next to
 * the other distractor builders, so every math type keeps working without
 * game changes (`extendChoices.test.ts` checks every implemented type).
 */

/** Parse a fraction label ("3/4", "1 1/2", "2", "0") into an improper fraction. */
export function parseFractionDisplay(display: string): { num: number; den: number } | null {
  const mixed = /^(\d+) (\d+)\/(\d+)$/.exec(display);
  if (mixed) return mixedToImproper(Number(mixed[1]), Number(mixed[2]), Number(mixed[3]));
  const frac = /^(\d+)\/(\d+)$/.exec(display);
  if (frac) return { num: Number(frac[1]), den: Number(frac[2]) };
  const whole = /^(\d+)$/.exec(display);
  if (whole) return { num: Number(whole[1]), den: 1 };
  return null;
}

/**
 * Top a question's choices up to `count` with plausible extra wrong answers.
 *
 * - **Fractions** (the question has display labels): more of the usual kid
 *   mistakes from `buildFractionDistractors` (numerator / denominator off by
 *   one, doubled denominator), labelled like the rest.
 * - **Whole numbers:** the nearest unused numbers around the answer, never
 *   negative — first ones inside the existing choices' range (so the extra
 *   choice can't be ruled out as "too big" or "too small"), then outside it.
 *
 * Choices already long enough come back unchanged (as copies).
 */
export function extendChoices(
  q: Pick<Question, 'choices' | 'correctAnswer' | 'correctDisplay' | 'choiceDisplays'>,
  count: number,
  rng: () => number,
): { choices: number[]; choiceDisplays?: string[] } {
  const choices = [...q.choices];
  const displays = q.choiceDisplays ? [...q.choiceDisplays] : undefined;
  if (choices.length >= count) return { choices, choiceDisplays: displays };
  const taken = (v: number): boolean => choices.some((c) => Math.abs(c - v) < 1e-9);

  if (displays && q.correctDisplay !== undefined) {
    const correct = parseFractionDisplay(q.correctDisplay);
    if (correct) {
      // Ask for plenty: some may equal a choice already on screen.
      for (const d of buildFractionDistractors(rng, correct.num, correct.den, count + 4)) {
        if (choices.length >= count) break;
        const v = decimalValue(d.num, d.den);
        if (taken(v)) continue;
        choices.push(v);
        displays.push(formatFraction(d.num, d.den));
      }
    }
    return { choices, choiceDisplays: displays };
  }

  const lo = Math.min(...choices);
  const hi = Math.max(...choices);
  for (const inRangeOnly of [true, false]) {
    for (let k = 1; choices.length < count && k < 200; k++) {
      const pair = rng() < 0.5 ? [q.correctAnswer - k, q.correctAnswer + k] : [q.correctAnswer + k, q.correctAnswer - k];
      for (const v of pair) {
        if (choices.length >= count) break;
        if (v < 0 || !Number.isInteger(v) || taken(v)) continue;
        if (inRangeOnly && (v < lo || v > hi)) continue;
        choices.push(v);
      }
    }
  }
  return { choices };
}
