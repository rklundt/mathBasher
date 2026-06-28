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

/**
 * Sprint 2.2.1 story 8 — the discrete outcomes resolving a rung pick
 * can produce. Sprint 2.5.2 removed `wrong-terminal` (the per-floor
 * "2nd wrong on a floor ends the round" cap): it contradicted the
 * climb-wide 3-life HUD — a kid could "die" from two wrongs on one
 * floor while the lives indicator still showed a life remaining. Now
 * every wrong pick is a retry that costs one cumulative life, and the
 * round ends ONLY when the 3-life cap is exhausted (owned by the scene).
 *  - `correct`        — the picked rung carries the right answer.
 *  - `wrong-mulligan` — a wrong pick; the kid retries (costs a life +
 *                       a time penalty). Repeats until the kid picks
 *                       correct or the cumulative life cap is hit.
 *  - `rung-consumed`  — defensive: the pick should be ignored (the
 *                       floor is paused, or the rung isn't part of the
 *                       current floor — e.g. a double-tap of an
 *                       already-spent rung).
 */
export type RungPickKind = 'correct' | 'wrong-mulligan' | 'rung-consumed';

/**
 * Pure result of `resolveRungPick`. The FloorSystem applies these:
 * `wrongsAfter` becomes the new wrong-this-floor counter; `consumeRung`
 * tells it whether to disable the picked rung.
 */
export interface RungPickDecision {
  kind: RungPickKind;
  /** Wrong-this-floor counter AFTER this pick (unchanged for correct / rung-consumed). */
  wrongsAfter: number;
  /** True if the caller should consume (disable) the picked rung — wrong picks only. */
  consumeRung: boolean;
}

/**
 * Pure decision logic for resolving a rung pick — extracted from
 * `NumberClimbFloorSystem.pickRung` so the state machine can be
 * unit-tested without dragging Phaser into the Node test env (same
 * precedent as `pickSubsetWithCorrect`). The FloorSystem method is
 * now a thin wrapper that calls this, applies the side-effects
 * (rung.consume(), counter update, telemetry), and attaches the rung.
 *
 * State machine (sprint 2.5.2 — per-floor terminal removed):
 *  - paused OR rung not in the current floor → `rung-consumed` (no-op).
 *  - rungAnswer === correctAnswer            → `correct`.
 *  - any wrong pick                          → `wrong-mulligan` (retry;
 *                                              costs a life via the
 *                                              scene's cumulative cap).
 *
 * `wrongsAfter` simply increments — it's the per-floor wrong counter
 * used only for the `hasUsedMulligan()` scoring flag (any wrong on a
 * floor → half points for that floor's eventual correct). There is no
 * per-floor ceiling anymore; the climb-wide 3-life cap (in
 * `NumberClimbScene`) is the sole round-ender on a wrong pick.
 *
 * Locked in `NumberClimbFloorSystem.test.ts`.
 */
export function resolveRungPick(input: {
  paused: boolean;
  rungInFloor: boolean;
  rungAnswer: number;
  correctAnswer: number;
  wrongsSoFar: number;
}): RungPickDecision {
  const { paused, rungInFloor, rungAnswer, correctAnswer, wrongsSoFar } = input;

  if (paused || !rungInFloor) {
    return { kind: 'rung-consumed', wrongsAfter: wrongsSoFar, consumeRung: false };
  }
  if (rungAnswer === correctAnswer) {
    return { kind: 'correct', wrongsAfter: wrongsSoFar, consumeRung: false };
  }
  // Sprint 2.5.2 — every wrong pick is a retry that costs one cumulative
  // life (tracked by the scene). No per-floor terminal: the round ends
  // on a wrong pick ONLY when the climb-wide 3-life cap is exhausted.
  return { kind: 'wrong-mulligan', wrongsAfter: wrongsSoFar + 1, consumeRung: true };
}
