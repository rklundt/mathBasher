// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import {
  pickSubsetWithCorrect,
  RUNGS_PER_DIFFICULTY,
} from '@/game/systems/numberClimbFloorMath';

/**
 * Sprint 2.2 — `pickSubsetWithCorrect` is the pure helper that
 * chooses which N answers (from the 4 generator-produced choices)
 * appear on a given floor's rungs. Three invariants matter:
 *
 *   1. EXACTLY N answers returned (Easy 2, Medium 3, Hard 4).
 *   2. The correct answer is ALWAYS among the returned subset.
 *      Without this, the kid could be presented with a floor where
 *      no rung has the right answer — unwinnable.
 *   3. No duplicates (the math generator contract says choices are
 *      already distinct; the helper must not introduce a duplicate
 *      while ensuring the correct answer is present).
 *
 * Tests use a seeded RNG for determinism — `mulberry32` is the
 * project's existing seeded-PRNG helper.
 */

/** Tiny seeded RNG for deterministic tests. Mirrors the math-generator pattern. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const choicesFour: readonly number[] = [3, 5, 7, 9];
const correctAnswer = 5;

describe('pickSubsetWithCorrect', () => {
  it('returns exactly N answers (Easy = 2)', () => {
    const rng = mulberry32(1);
    const picked = pickSubsetWithCorrect(choicesFour, correctAnswer, 2, rng);
    expect(picked).toHaveLength(2);
  });

  it('returns exactly N answers (Medium = 3)', () => {
    const rng = mulberry32(2);
    const picked = pickSubsetWithCorrect(choicesFour, correctAnswer, 3, rng);
    expect(picked).toHaveLength(3);
  });

  it('returns exactly N answers (Hard = 4)', () => {
    const rng = mulberry32(3);
    const picked = pickSubsetWithCorrect(choicesFour, correctAnswer, 4, rng);
    expect(picked).toHaveLength(4);
  });

  it('the correct answer is ALWAYS among the returned subset (Easy)', () => {
    // Run with many seeds — even though the random subset COULD omit
    // the correct answer, the helper guarantees insertion.
    for (let seed = 1; seed <= 50; seed++) {
      const rng = mulberry32(seed);
      const picked = pickSubsetWithCorrect(choicesFour, correctAnswer, 2, rng);
      expect(picked).toContain(correctAnswer);
    }
  });

  it('the correct answer is ALWAYS among the returned subset (Medium)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = mulberry32(seed);
      const picked = pickSubsetWithCorrect(choicesFour, correctAnswer, 3, rng);
      expect(picked).toContain(correctAnswer);
    }
  });

  it('no duplicates in the returned subset', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = mulberry32(seed);
      const picked = pickSubsetWithCorrect(choicesFour, correctAnswer, 3, rng);
      expect(new Set(picked).size).toBe(picked.length);
    }
  });

  it('all returned values are from the original choices', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = mulberry32(seed);
      const picked = pickSubsetWithCorrect(choicesFour, correctAnswer, 3, rng);
      for (const value of picked) {
        expect(choicesFour).toContain(value);
      }
    }
  });

  it('count = choices.length: returns a shuffled copy of choices', () => {
    const rng = mulberry32(42);
    const picked = pickSubsetWithCorrect(choicesFour, correctAnswer, 4, rng);
    expect(picked).toHaveLength(4);
    expect(new Set(picked)).toEqual(new Set(choicesFour));
  });

  it('handles a tricky case: small choices array where the correct may be the dropped one', () => {
    // choicesFour = [3, 5, 7, 9]; pick 2 → some random pair. If the
    // pair is [3, 7] (no 5), the helper must swap a slot to insert 5.
    // Test by counting how many of 30 seeds produce a correct-answer-
    // present result — should be 30/30 (i.e. 100%).
    let successes = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const rng = mulberry32(seed);
      const picked = pickSubsetWithCorrect(choicesFour, correctAnswer, 2, rng);
      if (picked.includes(correctAnswer)) successes++;
    }
    expect(successes).toBe(30);
  });
});

describe('RUNGS_PER_DIFFICULTY', () => {
  it('Easy → 2 rungs (per sprint 2.2 design decision)', () => {
    expect(RUNGS_PER_DIFFICULTY.slow).toBe(2);
  });
  it('Medium → 3 rungs', () => {
    expect(RUNGS_PER_DIFFICULTY.medium).toBe(3);
  });
  it('Hard → 4 rungs', () => {
    expect(RUNGS_PER_DIFFICULTY.fast).toBe(4);
  });
});
