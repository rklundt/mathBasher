// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { pickDistractors, shuffleAnswers } from '@/math/distractors';
import { mulberry32 } from '@/test-utils/mulberry32';

describe('pickDistractors', () => {
  it('returns the requested count of distinct integers', () => {
    const rng = mulberry32(1);
    const result = pickDistractors(5, { count: 3, min: 0, max: 10, rng });
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
  });

  it('never returns the correct answer', () => {
    const rng = mulberry32(2);
    for (let i = 0; i < 100; i++) {
      const result = pickDistractors(5, { count: 3, min: 0, max: 10, rng });
      expect(result).not.toContain(5);
    }
  });

  it('keeps every distractor within [min, max]', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      const result = pickDistractors(7, { count: 3, min: 0, max: 10, rng });
      for (const d of result) {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(10);
        expect(Number.isInteger(d)).toBe(true);
      }
    }
  });

  it('throws when the available pool is too small', () => {
    // Range [0, 2] excluding 1 leaves 2 candidates; asking for 3 must throw.
    expect(() =>
      pickDistractors(1, { count: 3, min: 0, max: 2, rng: mulberry32(4) }),
    ).toThrow(/cannot pick/i);
  });

  it('throws on non-integer min/max', () => {
    expect(() =>
      pickDistractors(5, { count: 1, min: 0.5, max: 10, rng: mulberry32(5) }),
    ).toThrow(/integers/);
    expect(() =>
      pickDistractors(5, { count: 1, min: 0, max: 10.5, rng: mulberry32(5) }),
    ).toThrow(/integers/);
  });

  it('throws when max < min', () => {
    expect(() =>
      pickDistractors(0, { count: 1, min: 10, max: 5, rng: mulberry32(6) }),
    ).toThrow(/>= min/);
  });

  it('throws when count is negative', () => {
    expect(() =>
      pickDistractors(0, { count: -1, min: 0, max: 10, rng: mulberry32(6) }),
    ).toThrow(/count.*>=\s*0/i);
  });

  it('falls back to deterministic fill when the rng is degenerate', () => {
    // rng always returns 0 -> candidate is always min, but min === correct, so
    // the random-sampling loop never accepts a candidate. The defense-in-depth
    // fallback should kick in and fill from the pool start, skipping `correct`.
    const result = pickDistractors(0, { count: 3, min: 0, max: 10, rng: () => 0 });
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
    expect(result).not.toContain(0);
    // Fallback fills sequentially from min (skipping correct), so the result
    // should be the smallest three values that aren't correct.
    expect(result.sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('accepts count: 0 and returns []', () => {
    const result = pickDistractors(5, { count: 0, min: 0, max: 10, rng: mulberry32(7) });
    expect(result).toEqual([]);
  });

  it('handles correct outside the range (no exclusion needed)', () => {
    // correct is 99, range is [0, 10] — exclusion is a no-op; pool is full 11.
    const result = pickDistractors(99, { count: 11, min: 0, max: 10, rng: mulberry32(8) });
    expect(result).toHaveLength(11);
    expect(new Set(result).size).toBe(11);
  });
});

describe('shuffleAnswers', () => {
  it('contains every input value exactly once', () => {
    const result = shuffleAnswers(7, [1, 2, 3], mulberry32(10));
    expect(result.sort((a, b) => a - b)).toEqual([1, 2, 3, 7]);
  });

  it('produces a deterministic order given a seeded RNG', () => {
    const a = shuffleAnswers(7, [1, 2, 3], mulberry32(42));
    const b = shuffleAnswers(7, [1, 2, 3], mulberry32(42));
    expect(a).toEqual(b);
  });

  it('returns a new array (does not mutate the input)', () => {
    const distractors = [1, 2, 3];
    const result = shuffleAnswers(7, distractors, mulberry32(11));
    expect(distractors).toEqual([1, 2, 3]);
    expect(result).not.toBe(distractors);
  });
});
