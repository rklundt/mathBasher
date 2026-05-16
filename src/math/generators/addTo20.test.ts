// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import addTo20 from '@/math/generators/addTo20';
import { config } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';

describe('addTo20 generator', () => {
  it('has the expected identity', () => {
    expect(addTo20.id).toBe('add-to-20');
    expect(addTo20.label).toBe('Add to 20');
    expect(addTo20.isStub).toBeFalsy();
  });

  describe('1000 sampled questions (seeded)', () => {
    const rng = mulberry32(2026);
    const samples = Array.from({ length: 1000 }, () => addTo20.generate(rng));

    it('every prompt parses to two integers in [1, 10] summing to [2, 20]', () => {
      const re = /^(\d+) \+ (\d+) = \?$/;
      for (const q of samples) {
        const match = re.exec(q.prompt);
        expect(match, `prompt did not parse: ${q.prompt}`).not.toBeNull();
        const a = Number(match![1]);
        const b = Number(match![2]);
        expect(Number.isInteger(a)).toBe(true);
        expect(Number.isInteger(b)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(1);
        expect(a).toBeLessThanOrEqual(10);
        expect(b).toBeGreaterThanOrEqual(1);
        expect(b).toBeLessThanOrEqual(10);
        expect(a + b).toBeGreaterThanOrEqual(2);
        expect(a + b).toBeLessThanOrEqual(20);
        expect(q.correctAnswer).toBe(a + b);
      }
    });

    it('every question has exactly config.layout.targetLanes choices', () => {
      for (const q of samples) {
        expect(q.choices).toHaveLength(config.layout.targetLanes);
      }
    });

    it('choices always include the correct answer', () => {
      for (const q of samples) {
        expect(q.choices).toContain(q.correctAnswer);
      }
    });

    it('every choice is a distinct integer in [2, 20]', () => {
      for (const q of samples) {
        expect(new Set(q.choices).size).toBe(q.choices.length);
        for (const c of q.choices) {
          expect(Number.isInteger(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(2);
          expect(c).toBeLessThanOrEqual(20);
        }
      }
    });
  });

  it('produces the same sequence given the same seed', () => {
    const a = Array.from({ length: 5 }, () => addTo20.generate(mulberry32(7)));
    const b = Array.from({ length: 5 }, () => addTo20.generate(mulberry32(7)));
    expect(a).toEqual(b);
  });

  // Mirrors the addTo10 distribution test — uniform-over-sums is the
  // documented contract; protect it from algorithmic regressions.
  describe('answer distribution (uniform over sums)', () => {
    it('every sum 2-20 appears within ±25% of the expected 1/19 share', () => {
      // 19 possible sums (2 through 20); 1500 per sum at perfect uniformity.
      const ITERATIONS = 19_000;
      const EXPECTED_PER_SUM = ITERATIONS / 19;
      const TOLERANCE = 0.25;
      const rng = mulberry32(42);
      const counts = new Array(21).fill(0); // index 2..20 used; 0,1 ignored
      for (let i = 0; i < ITERATIONS; i++) {
        const q = addTo20.generate(rng);
        counts[q.correctAnswer]++;
      }
      for (let sum = 2; sum <= 20; sum++) {
        const ratio = counts[sum] / EXPECTED_PER_SUM;
        expect(
          ratio,
          `sum=${sum} appeared ${counts[sum]} times (${(ratio * 100).toFixed(0)}% of expected)`,
        ).toBeGreaterThan(1 - TOLERANCE);
        expect(ratio).toBeLessThan(1 + TOLERANCE);
      }
    });
  });
});
