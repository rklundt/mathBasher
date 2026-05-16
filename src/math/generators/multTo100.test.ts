// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import multTo100 from '@/math/generators/multTo100';
import { config } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';

describe('multTo100 generator', () => {
  it('has the expected identity', () => {
    expect(multTo100.id).toBe('mult-to-100');
    expect(multTo100.label).toBe('Multiply 10×10');
    expect(multTo100.description).toMatch(/up to 10×10/i);
    expect(multTo100.isStub).toBeFalsy();
  });

  describe('1000 sampled questions (seeded)', () => {
    const rng = mulberry32(2026);
    const samples = Array.from({ length: 1000 }, () => multTo100.generate(rng));

    it('every prompt parses as `a × b = ?` with a,b ∈ [2,10] and product ∈ [4,100]', () => {
      // Use Unicode multiplication sign (U+00D7) — that's what the generator emits.
      const re = /^(\d+) × (\d+) = \?$/;
      for (const q of samples) {
        const match = re.exec(q.prompt);
        expect(match, `prompt did not parse: ${q.prompt}`).not.toBeNull();
        const a = Number(match![1]);
        const b = Number(match![2]);
        expect(Number.isInteger(a)).toBe(true);
        expect(Number.isInteger(b)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(2);
        expect(a).toBeLessThanOrEqual(10);
        expect(b).toBeGreaterThanOrEqual(2);
        expect(b).toBeLessThanOrEqual(10);
        expect(a * b).toBeGreaterThanOrEqual(4);
        expect(a * b).toBeLessThanOrEqual(100);
        expect(q.correctAnswer).toBe(a * b);
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

    it('every choice is a distinct integer in [4, 100]', () => {
      for (const q of samples) {
        expect(new Set(q.choices).size).toBe(q.choices.length);
        for (const c of q.choices) {
          expect(Number.isInteger(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(4);
          expect(c).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  it('produces the same sequence given the same seed', () => {
    const a = Array.from({ length: 5 }, () => multTo100.generate(mulberry32(7)));
    const b = Array.from({ length: 5 }, () => multTo100.generate(mulberry32(7)));
    expect(a).toEqual(b);
  });

  // Documented contract: factor-uniform, NOT product-uniform. So each factor
  // value 2-10 should appear roughly 1/9 of the time as the FIRST factor.
  describe('factor distribution (uniform over factors)', () => {
    it('each factor value 2-10 appears within ±20% of the expected 1/9 share as the first factor', () => {
      const ITERATIONS = 9_000;
      const EXPECTED_PER_FACTOR = ITERATIONS / 9;
      const TOLERANCE = 0.2;
      const rng = mulberry32(42);
      const counts = new Array(11).fill(0); // index 2..10 used
      const re = /^(\d+) × (\d+) = \?$/;
      for (let i = 0; i < ITERATIONS; i++) {
        const q = multTo100.generate(rng);
        const a = Number(re.exec(q.prompt)![1]);
        counts[a]++;
      }
      for (let f = 2; f <= 10; f++) {
        const ratio = counts[f] / EXPECTED_PER_FACTOR;
        expect(
          ratio,
          `first factor=${f} appeared ${counts[f]} times (${(ratio * 100).toFixed(0)}% of expected)`,
        ).toBeGreaterThan(1 - TOLERANCE);
        expect(ratio).toBeLessThan(1 + TOLERANCE);
      }
    });
  });
});
