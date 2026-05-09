// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { defaultRng } from '@/math/types';

export interface PickDistractorsOpts {
  /** How many distractors to return. */
  count: number;
  /** Inclusive lower bound of the range distractors are drawn from. */
  min: number;
  /** Inclusive upper bound of the range distractors are drawn from. */
  max: number;
  /** Optional injected RNG for deterministic tests. Defaults to `Math.random`. */
  rng?: () => number;
}

/**
 * Pick `count` distinct integers from the inclusive range `[min, max]`,
 * excluding `correct`.
 *
 * Throws if the available pool (`max - min + 1` minus the one excluded value)
 * is too small to satisfy the request — the caller is responsible for choosing
 * a range that can actually fit the requested distractors. This surfaces
 * range-misconfiguration as a hard error rather than letting the loop hang.
 */
export function pickDistractors(correct: number, opts: PickDistractorsOpts): number[] {
  const { count, min, max } = opts;
  const rng = opts.rng ?? defaultRng;

  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error(`pickDistractors: min and max must be integers (got min=${min}, max=${max})`);
  }
  if (max < min) {
    throw new Error(`pickDistractors: max (${max}) must be >= min (${min})`);
  }
  if (count < 0) {
    throw new Error(`pickDistractors: count (${count}) must be >= 0`);
  }

  const rangeSize = max - min + 1;
  const correctInRange = correct >= min && correct <= max;
  const available = rangeSize - (correctInRange ? 1 : 0);
  if (count > available) {
    throw new Error(
      `pickDistractors: cannot pick ${count} distinct distractors from [${min}, ${max}]` +
        ` excluding ${correct} (only ${available} candidates available)`,
    );
  }

  const picked = new Set<number>();
  while (picked.size < count) {
    // floor(rng() * rangeSize) -> int in [0, rangeSize-1]; offset by min.
    const candidate = min + Math.floor(rng() * rangeSize);
    if (candidate === correct) continue;
    picked.add(candidate);
  }
  return [...picked];
}

/**
 * Return a new array containing `correct` plus all `distractors`, shuffled.
 * Uses Fisher-Yates with the injected RNG for deterministic tests.
 */
export function shuffleAnswers(
  correct: number,
  distractors: number[],
  rng?: () => number,
): number[] {
  const rand = rng ?? defaultRng;
  const out = [correct, ...distractors];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
