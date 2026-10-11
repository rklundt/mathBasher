// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Game-neutral round rules shared by more than one game mode (sprint
 * 2.5.5 — lifted out of `numberClimbFloorMath.ts` once Math-a-lotl
 * needed them too). Pure, no Phaser. Locked in
 * `NumberClimbFloorSystem.test.ts`; Math-a-lotl's wave builder on top of
 * `pickSubsetWithCorrect` is covered in `mathALotlMath.test.ts`.
 */

/**
 * Pick `count` answers from the `choices` array such that
 * `correctAnswer` is guaranteed to be among them. Choices is 4 (per
 * the math-generator contract); if the random subset happens to omit
 * the correct answer, swap a random selected slot for it. Returns
 * the picked answers in a shuffled order so the correct answer's
 * left-to-right position varies floor-to-floor (kid can't game the
 * mode by always tapping the same rung index).
 *
 * Invariants:
 *  1. Returns EXACTLY `count` values.
 *  2. The returned array CONTAINS `correctAnswer` (always).
 *  3. No duplicates in the returned array.
 *
 * Locked in `NumberClimbFloorSystem.test.ts`.
 */
export function pickSubsetWithCorrect(
  choices: readonly number[],
  correctAnswer: number,
  count: number,
  rng: () => number,
): number[] {
  // Defensive: if count >= choices.length, just shuffle the whole list.
  if (count >= choices.length) {
    return shuffle(choices.slice(), rng);
  }
  // Random subset of size `count` from `choices` (Fisher-Yates-style partial pick).
  const remaining = choices.slice();
  const picked: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * remaining.length);
    picked.push(remaining[idx]!);
    remaining.splice(idx, 1);
  }
  // Guarantee the correct answer is present.
  if (!picked.includes(correctAnswer)) {
    // Replace a random slot with the correct answer. The replaced
    // value is dropped — that's fine; the goal is just to ensure
    // the correct answer is among the rungs.
    const replaceIdx = Math.floor(rng() * picked.length);
    picked[replaceIdx] = correctAnswer;
  }
  return shuffle(picked, rng);
}

/** Fisher-Yates shuffle, in-place. Returns the same array for chaining. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Pure result of `resolveStrike` — a round-wide life budget after one
 * wrong pick (Number Climb's floors, Math-a-lotl's catches).
 */
export interface StrikeDecision {
  /** Lives spent AFTER this wrong pick. */
  strikesAfter: number;
  /** Lives left after this pick (never negative) — drives the lives HUD. */
  remaining: number;
  /** True if this pick spent the last life — the round ends. */
  exhausted: boolean;
}

/**
 * Spend one life from a round-wide budget. Every wrong pick / catch
 * costs one; the round ends exactly when the last life is spent, never
 * with a life still showing. First written for Number Climb (sprint
 * 2.5.2), shared with Math-a-lotl since 2.5.4.
 */
export function resolveStrike(strikesSoFar: number, maxStrikes: number): StrikeDecision {
  const strikesAfter = strikesSoFar + 1;
  return {
    strikesAfter,
    remaining: Math.max(0, maxStrikes - strikesAfter),
    exhausted: strikesAfter >= maxStrikes,
  };
}
