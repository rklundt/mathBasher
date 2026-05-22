// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { SpeedKey } from '@/core/config';

/**
 * Sprint 2.2 — pure math helpers for `NumberClimbFloorSystem`. Lives
 * in its own file (separate from the Phaser-coupled FloorSystem class)
 * so the helpers can be unit-tested without spinning up a Phaser scene
 * or pulling Phaser's `window`-requiring device-detection code into
 * the Node test environment.
 *
 * Same precedent as `orbitMath.ts` (sprint 2.1.6) — pure geometry
 * extracted from `AsteroidWaveSystem` so tests don't drag the
 * Phaser runtime in.
 */

/**
 * How many rungs spawn at each floor, keyed by the SpeedKey (which
 * doubles as the Difficulty in Number Climb — Easy = 2 rungs, Medium
 * = 3, Hard = 4). The choice-count axis is the kid-facing variation
 * dimension; cumulative timer is the time-pressure axis. Together
 * they give two orthogonal tuning knobs.
 */
export const RUNGS_PER_DIFFICULTY: Readonly<Record<SpeedKey, number>> = {
  slow: 2,
  medium: 3,
  fast: 4,
};

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
