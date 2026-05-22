// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import {
  pickSubsetWithCorrect,
  resolveRungPick,
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

/**
 * Sprint 2.2.1 story 8 — `resolveRungPick` is the pure decision logic
 * extracted from `NumberClimbFloorSystem.pickRung` so the floor's
 * pick-resolution state machine can be unit-tested without spinning up
 * Phaser. Four outcome kinds + the wrongs-this-floor counter + the
 * consume-rung flag are all locked here.
 */
describe('resolveRungPick', () => {
  const CORRECT = 7;

  it('correct pick → "correct", counter unchanged, no consume', () => {
    const d = resolveRungPick({
      paused: false,
      rungInFloor: true,
      rungAnswer: CORRECT,
      correctAnswer: CORRECT,
      wrongsSoFar: 0,
    });
    expect(d.kind).toBe('correct');
    expect(d.wrongsAfter).toBe(0);
    expect(d.consumeRung).toBe(false);
  });

  it('correct pick AFTER a mulligan → still "correct", counter stays at 1', () => {
    // The kid used their one mulligan, then picked the right rung.
    const d = resolveRungPick({
      paused: false,
      rungInFloor: true,
      rungAnswer: CORRECT,
      correctAnswer: CORRECT,
      wrongsSoFar: 1,
    });
    expect(d.kind).toBe('correct');
    expect(d.wrongsAfter).toBe(1); // preserved so the half-points telemetry flag still reads true
    expect(d.consumeRung).toBe(false);
  });

  it('first wrong pick → "wrong-mulligan", counter 0 → 1, consume the rung', () => {
    const d = resolveRungPick({
      paused: false,
      rungInFloor: true,
      rungAnswer: 3,
      correctAnswer: CORRECT,
      wrongsSoFar: 0,
    });
    expect(d.kind).toBe('wrong-mulligan');
    expect(d.wrongsAfter).toBe(1);
    expect(d.consumeRung).toBe(true);
  });

  it('second wrong pick on the same floor → "wrong-terminal", counter 1 → 2', () => {
    const d = resolveRungPick({
      paused: false,
      rungInFloor: true,
      rungAnswer: 5,
      correctAnswer: CORRECT,
      wrongsSoFar: 1,
    });
    expect(d.kind).toBe('wrong-terminal');
    expect(d.wrongsAfter).toBe(2);
    expect(d.consumeRung).toBe(true);
  });

  it('paused → "rung-consumed" no-op, even for an otherwise-correct rung', () => {
    const d = resolveRungPick({
      paused: true,
      rungInFloor: true,
      rungAnswer: CORRECT,
      correctAnswer: CORRECT,
      wrongsSoFar: 0,
    });
    expect(d.kind).toBe('rung-consumed');
    expect(d.wrongsAfter).toBe(0);
    expect(d.consumeRung).toBe(false);
  });

  it('rung not in the current floor → "rung-consumed" no-op (e.g. stale double-tap)', () => {
    const d = resolveRungPick({
      paused: false,
      rungInFloor: false,
      rungAnswer: CORRECT,
      correctAnswer: CORRECT,
      wrongsSoFar: 0,
    });
    expect(d.kind).toBe('rung-consumed');
    expect(d.wrongsAfter).toBe(0);
    expect(d.consumeRung).toBe(false);
  });

  it('a wrong pick while already at the terminal count stays terminal (defensive)', () => {
    // Shouldn't happen — the scene ends the round on the first
    // wrong-terminal — but the state machine must not crash or produce
    // a nonsense kind if pickRung is somehow called again. `wrongsAfter`
    // caps at 2 rather than ticking up to a meaningless 3.
    const d = resolveRungPick({
      paused: false,
      rungInFloor: true,
      rungAnswer: 9,
      correctAnswer: CORRECT,
      wrongsSoFar: 2,
    });
    expect(d.kind).toBe('wrong-terminal');
    expect(d.wrongsAfter).toBe(2);
  });
});
