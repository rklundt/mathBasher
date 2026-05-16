// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import subTo10 from '@/math/generators/subTo10';
import { config } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';

describe('subTo10 generator', () => {
  it('has the expected identity', () => {
    expect(subTo10.id).toBe('sub-to-10');
    expect(subTo10.label).toBe('Subtract within 10');
    expect(subTo10.isStub).toBeFalsy();
  });

  describe('1000 sampled questions (seeded)', () => {
    const rng = mulberry32(2026);
    const samples = Array.from({ length: 1000 }, () => subTo10.generate(rng));

    it('every prompt parses as `a − b = ?` with a ∈ [0,10], b ∈ [0,a], result ∈ [0,10]', () => {
      // Use Unicode minus (U+2212) in the regex — that's what the generator emits.
      const re = /^(\d+) − (\d+) = \?$/;
      for (const q of samples) {
        const match = re.exec(q.prompt);
        expect(match, `prompt did not parse: ${q.prompt}`).not.toBeNull();
        const a = Number(match![1]);
        const b = Number(match![2]);
        expect(Number.isInteger(a)).toBe(true);
        expect(Number.isInteger(b)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(10);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(a); // no negatives
        expect(a - b).toBeGreaterThanOrEqual(0);
        expect(a - b).toBeLessThanOrEqual(10);
        expect(q.correctAnswer).toBe(a - b);
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

    it('every choice is a distinct integer in [0, 10]', () => {
      for (const q of samples) {
        expect(new Set(q.choices).size).toBe(q.choices.length);
        for (const c of q.choices) {
          expect(Number.isInteger(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(10);
        }
      }
    });
  });

  it('produces the same sequence given the same seed', () => {
    const a = Array.from({ length: 5 }, () => subTo10.generate(mulberry32(7)));
    const b = Array.from({ length: 5 }, () => subTo10.generate(mulberry32(7)));
    expect(a).toEqual(b);
  });

  describe('answer distribution (uniform over results)', () => {
    it('every result 0-10 appears within ±25% of the expected 1/11 share', () => {
      const ITERATIONS = 11_000;
      const EXPECTED_PER_RESULT = ITERATIONS / 11;
      const TOLERANCE = 0.25;
      const rng = mulberry32(42);
      const counts = new Array(11).fill(0);
      for (let i = 0; i < ITERATIONS; i++) {
        const q = subTo10.generate(rng);
        counts[q.correctAnswer]++;
      }
      for (let result = 0; result <= 10; result++) {
        const ratio = counts[result] / EXPECTED_PER_RESULT;
        expect(
          ratio,
          `result=${result} appeared ${counts[result]} times (${(ratio * 100).toFixed(0)}% of expected)`,
        ).toBeGreaterThan(1 - TOLERANCE);
        expect(ratio).toBeLessThan(1 + TOLERANCE);
      }
    });
  });
});
