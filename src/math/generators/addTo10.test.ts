// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import addTo10 from '@/math/generators/addTo10';
import { config } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';

describe('addTo10 generator', () => {
  it('has the expected identity', () => {
    expect(addTo10.id).toBe('add-to-10');
    expect(addTo10.label).toBe('Add to 10');
  });

  describe('1000 sampled questions (seeded)', () => {
    const rng = mulberry32(2026);
    const samples = Array.from({ length: 1000 }, () => addTo10.generate(rng));

    it('every prompt parses to two integers in [0, 10] summing to <= 10', () => {
      const re = /^(\d+) \+ (\d+) = \?$/;
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
        expect(b).toBeLessThanOrEqual(10);
        expect(a + b).toBeLessThanOrEqual(10);
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
    const a = Array.from({ length: 5 }, () => addTo10.generate(mulberry32(7)));
    const b = Array.from({ length: 5 }, () => addTo10.generate(mulberry32(7)));
    expect(a).toEqual(b);
  });

  // Sprint 0.6.3 Story 7 — added after playtest surfaced that the prior
  // algorithm gave sum=10 ~27% of the time and sum=0 ~0.8%. The current
  // algorithm picks the SUM uniformly first, so every sum 0-10 should
  // appear roughly equally often.
  describe('answer distribution (uniform over sums)', () => {
    it('every sum 0-10 appears within ±25% of the expected 1/11 share', () => {
      const ITERATIONS = 11000; // 1000 per sum at perfect uniformity
      const EXPECTED_PER_SUM = ITERATIONS / 11;
      const TOLERANCE = 0.25; // ±25% of expected — generous to dodge flakes
      const rng = mulberry32(42);
      const counts = new Array(11).fill(0);
      for (let i = 0; i < ITERATIONS; i++) {
        const q = addTo10.generate(rng);
        counts[q.correctAnswer]++;
      }
      for (let sum = 0; sum <= 10; sum++) {
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
