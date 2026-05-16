// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import divTo144 from '@/math/generators/divTo144';
import { config } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';

describe('divTo144 generator', () => {
  it('has the expected identity', () => {
    expect(divTo144.id).toBe('div-to-144');
    expect(divTo144.label).toBe('Divide 12×12');
    expect(divTo144.description).toMatch(/up to 12×12/i);
    expect(divTo144.isStub).toBeFalsy();
  });

  describe('1000 sampled questions (seeded)', () => {
    const rng = mulberry32(2026);
    const samples = Array.from({ length: 1000 }, () => divTo144.generate(rng));

    it('every prompt parses as `dividend ÷ divisor = ?` with divisor,quotient ∈ [2,12] and integer dividend ∈ [4,144]', () => {
      const re = /^(\d+) ÷ (\d+) = \?$/;
      for (const q of samples) {
        const match = re.exec(q.prompt);
        expect(match, `prompt did not parse: ${q.prompt}`).not.toBeNull();
        const dividend = Number(match![1]);
        const divisor = Number(match![2]);
        const quotient = dividend / divisor;
        expect(Number.isInteger(quotient), `non-integer quotient for ${q.prompt}`).toBe(true);
        expect(divisor).toBeGreaterThanOrEqual(2);
        expect(divisor).toBeLessThanOrEqual(12);
        expect(quotient).toBeGreaterThanOrEqual(2);
        expect(quotient).toBeLessThanOrEqual(12);
        expect(dividend).toBeGreaterThanOrEqual(4);
        expect(dividend).toBeLessThanOrEqual(144);
        expect(q.correctAnswer).toBe(quotient);
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

    it('every choice is a distinct integer in [2, 12]', () => {
      for (const q of samples) {
        expect(new Set(q.choices).size).toBe(q.choices.length);
        for (const c of q.choices) {
          expect(Number.isInteger(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(2);
          expect(c).toBeLessThanOrEqual(12);
        }
      }
    });
  });

  it('produces the same sequence given the same seed', () => {
    const a = Array.from({ length: 5 }, () => divTo144.generate(mulberry32(7)));
    const b = Array.from({ length: 5 }, () => divTo144.generate(mulberry32(7)));
    expect(a).toEqual(b);
  });

  describe('divisor distribution (uniform over factors)', () => {
    it('each divisor value 2-12 appears within ±20% of the expected 1/11 share', () => {
      const ITERATIONS = 11_000;
      const EXPECTED_PER_FACTOR = ITERATIONS / 11;
      const TOLERANCE = 0.2;
      const rng = mulberry32(42);
      const counts = new Array(13).fill(0); // index 2..12 used
      const re = /^(\d+) ÷ (\d+) = \?$/;
      for (let i = 0; i < ITERATIONS; i++) {
        const q = divTo144.generate(rng);
        const divisor = Number(re.exec(q.prompt)![2]);
        counts[divisor]++;
      }
      for (let f = 2; f <= 12; f++) {
        const ratio = counts[f] / EXPECTED_PER_FACTOR;
        expect(
          ratio,
          `divisor=${f} appeared ${counts[f]} times (${(ratio * 100).toFixed(0)}% of expected)`,
        ).toBeGreaterThan(1 - TOLERANCE);
        expect(ratio).toBeLessThan(1 + TOLERANCE);
      }
    });
  });
});
