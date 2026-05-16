// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import multTo144 from '@/math/generators/multTo144';
import { config } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';

describe('multTo144 generator', () => {
  it('has the expected identity', () => {
    expect(multTo144.id).toBe('mult-to-144');
    expect(multTo144.label).toBe('Multiply 12×12');
    expect(multTo144.description).toMatch(/up to 12×12/i);
    expect(multTo144.isStub).toBeFalsy();
  });

  describe('1000 sampled questions (seeded)', () => {
    const rng = mulberry32(2026);
    const samples = Array.from({ length: 1000 }, () => multTo144.generate(rng));

    it('every prompt parses as `a × b = ?` with a,b ∈ [2,12] and product ∈ [4,144]', () => {
      const re = /^(\d+) × (\d+) = \?$/;
      for (const q of samples) {
        const match = re.exec(q.prompt);
        expect(match, `prompt did not parse: ${q.prompt}`).not.toBeNull();
        const a = Number(match![1]);
        const b = Number(match![2]);
        expect(Number.isInteger(a)).toBe(true);
        expect(Number.isInteger(b)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(2);
        expect(a).toBeLessThanOrEqual(12);
        expect(b).toBeGreaterThanOrEqual(2);
        expect(b).toBeLessThanOrEqual(12);
        expect(a * b).toBeGreaterThanOrEqual(4);
        expect(a * b).toBeLessThanOrEqual(144);
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

    it('every choice is a distinct integer in [4, 144]', () => {
      for (const q of samples) {
        expect(new Set(q.choices).size).toBe(q.choices.length);
        for (const c of q.choices) {
          expect(Number.isInteger(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(4);
          expect(c).toBeLessThanOrEqual(144);
        }
      }
    });
  });

  it('produces the same sequence given the same seed', () => {
    const a = Array.from({ length: 5 }, () => multTo144.generate(mulberry32(7)));
    const b = Array.from({ length: 5 }, () => multTo144.generate(mulberry32(7)));
    expect(a).toEqual(b);
  });

  describe('factor distribution (uniform over factors)', () => {
    it('each factor value 2-12 appears within ±20% of the expected 1/11 share as the first factor', () => {
      const ITERATIONS = 11_000;
      const EXPECTED_PER_FACTOR = ITERATIONS / 11;
      const TOLERANCE = 0.2;
      const rng = mulberry32(42);
      const counts = new Array(13).fill(0); // index 2..12 used
      const re = /^(\d+) × (\d+) = \?$/;
      for (let i = 0; i < ITERATIONS; i++) {
        const q = multTo144.generate(rng);
        const a = Number(re.exec(q.prompt)![1]);
        counts[a]++;
      }
      for (let f = 2; f <= 12; f++) {
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
