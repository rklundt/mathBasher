// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { pickMultiplicationDistractors } from '@/math/multDistractors';
import { mulberry32 } from '@/test-utils/mulberry32';

/**
 * Tests for the near-miss multiplication distractor picker introduced in
 * sprint 1.1 wrap-up after playtest showed the random-int fallback
 * weakened the practice loop. Locks in:
 *   1. Returned count == requested count
 *   2. Distractors are distinct + don't equal the correct answer
 *   3. Distractors fall within the documented product range
 *   4. Boundary corners (2×2, 10×10, 12×12) don't degenerate
 *   5. Distractors PREFER near-miss products (statistical check)
 */
describe('pickMultiplicationDistractors', () => {
  // Standard mult-to-100 setup: factors [2,10], products [4,100].
  const MULT100 = {
    factorMin: 2,
    factorMax: 10,
    productMin: 4,
    productMax: 100,
    count: 3,
  } as const;
  // Standard mult-to-144 setup: factors [2,12], products [4,144].
  const MULT144 = {
    factorMin: 2,
    factorMax: 12,
    productMin: 4,
    productMax: 144,
    count: 3,
  } as const;

  describe('basic contract (mult-to-100 setup)', () => {
    it('returns exactly `count` distractors', () => {
      const rng = mulberry32(2026);
      const result = pickMultiplicationDistractors({ a: 7, b: 8, ...MULT100, rng });
      expect(result).toHaveLength(MULT100.count);
    });

    it('every distractor is distinct (no duplicates)', () => {
      const rng = mulberry32(2026);
      for (let i = 0; i < 200; i++) {
        const a = 2 + Math.floor(rng() * 9); // [2, 10]
        const b = 2 + Math.floor(rng() * 9);
        const result = pickMultiplicationDistractors({ a, b, ...MULT100, rng });
        expect(new Set(result).size, `dups in ${result} for ${a}×${b}`).toBe(result.length);
      }
    });

    it('no distractor equals the correct answer', () => {
      const rng = mulberry32(2026);
      for (let i = 0; i < 200; i++) {
        const a = 2 + Math.floor(rng() * 9);
        const b = 2 + Math.floor(rng() * 9);
        const correct = a * b;
        const result = pickMultiplicationDistractors({ a, b, ...MULT100, rng });
        expect(result, `${a}×${b}=${correct} appeared in distractors`).not.toContain(correct);
      }
    });

    it('every distractor falls in [productMin, productMax]', () => {
      const rng = mulberry32(2026);
      for (let i = 0; i < 200; i++) {
        const a = 2 + Math.floor(rng() * 9);
        const b = 2 + Math.floor(rng() * 9);
        const result = pickMultiplicationDistractors({ a, b, ...MULT100, rng });
        for (const d of result) {
          expect(Number.isInteger(d)).toBe(true);
          expect(d).toBeGreaterThanOrEqual(MULT100.productMin);
          expect(d).toBeLessThanOrEqual(MULT100.productMax);
        }
      }
    });
  });

  describe('seeded determinism', () => {
    it('produces the same distractor list for the same seed + inputs', () => {
      const a = pickMultiplicationDistractors({ a: 7, b: 8, ...MULT100, rng: mulberry32(7) });
      const b = pickMultiplicationDistractors({ a: 7, b: 8, ...MULT100, rng: mulberry32(7) });
      expect(a).toEqual(b);
    });
  });

  describe('boundary corners (no degenerate output)', () => {
    it('handles 2×2 in mult-to-100 without throwing or returning a short list', () => {
      const rng = mulberry32(42);
      const result = pickMultiplicationDistractors({ a: 2, b: 2, ...MULT100, rng });
      expect(result).toHaveLength(MULT100.count);
      expect(result).not.toContain(4); // correct answer
    });

    it('handles 10×10 in mult-to-100 without throwing or returning a short list', () => {
      const rng = mulberry32(42);
      const result = pickMultiplicationDistractors({ a: 10, b: 10, ...MULT100, rng });
      expect(result).toHaveLength(MULT100.count);
      expect(result).not.toContain(100);
    });

    it('handles 12×12 in mult-to-144 without throwing or returning a short list', () => {
      const rng = mulberry32(42);
      const result = pickMultiplicationDistractors({ a: 12, b: 12, ...MULT144, rng });
      expect(result).toHaveLength(MULT144.count);
      expect(result).not.toContain(144);
    });

    it('handles 2×2 in mult-to-144 without throwing or returning a short list', () => {
      const rng = mulberry32(42);
      const result = pickMultiplicationDistractors({ a: 2, b: 2, ...MULT144, rng });
      expect(result).toHaveLength(MULT144.count);
      expect(result).not.toContain(4);
    });
  });

  describe('count == 0 short-circuits', () => {
    it('returns an empty array when count is 0', () => {
      const result = pickMultiplicationDistractors({
        a: 7,
        b: 8,
        ...MULT100,
        count: 0,
        rng: mulberry32(1),
      });
      expect(result).toEqual([]);
    });
  });

  describe('near-miss preference (statistical)', () => {
    /**
     * The pedagogical promise of this picker is "distractors are PLAUSIBLE
     * products, not random ints." Operationally that means: for any given
     * (a, b), the distractors should mostly come from products of factors
     * within a small radius of (a, b). We check that the average distractor
     * is "near-miss" by sampling 500 questions for the same (a, b) and
     * counting how many distractors are products of factors in [a-2, a+2]
     * × [b-2, b+2] (the radius-2 neighborhood). Expect ≥80% of distractors
     * to fall in that neighborhood — well above what random-int pickers
     * would achieve (which would be ~10% for 7×8 in [4,100], since only
     * ~10 of the 96 candidate products are radius-2-near).
     */
    it('for 7×8 in mult-to-100, ≥80% of distractors are products of factors near (7, 8)', () => {
      const rng = mulberry32(2026);
      const TRIALS = 500;
      let nearMissCount = 0;
      let totalCount = 0;
      // Build the radius-2 neighborhood product set (for membership testing).
      const neighborhood = new Set<number>();
      for (let da = -2; da <= 2; da++) {
        for (let db = -2; db <= 2; db++) {
          if (da === 0 && db === 0) continue;
          const fa = 7 + da;
          const fb = 8 + db;
          if (fa < 2 || fa > 10 || fb < 2 || fb > 10) continue;
          const product = fa * fb;
          if (product === 56) continue;
          neighborhood.add(product);
        }
      }
      for (let i = 0; i < TRIALS; i++) {
        const result = pickMultiplicationDistractors({ a: 7, b: 8, ...MULT100, rng });
        for (const d of result) {
          totalCount++;
          if (neighborhood.has(d)) nearMissCount++;
        }
      }
      const ratio = nearMissCount / totalCount;
      expect(
        ratio,
        `only ${(ratio * 100).toFixed(1)}% of distractors were near-miss products (expected ≥80%)`,
      ).toBeGreaterThanOrEqual(0.8);
    });
  });
});
