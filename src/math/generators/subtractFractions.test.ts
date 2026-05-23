// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import subtractFractions from '@/math/generators/subtractFractions';
import { config } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';

/**
 * Sprint 2.4 story 4 — Subtract Fractions generator tests. Mirrors the
 * `addFractions.test.ts` shape with one critical difference: the
 * **non-negative-result invariant** is enforced by an explicit cross-band
 * check (`correctAnswer >= 0` for every sample). A negative answer is
 * the bug class this generator's careful operand-ordering exists to
 * prevent.
 */

const SAMPLE_COUNT = 500;

describe('subtractFractions generator', () => {
  it('has the expected identity', () => {
    expect(subtractFractions.id).toBe('subtract-fractions');
    expect(subtractFractions.label).toBe('Subtract Fractions');
  });

  it('produces the same sequence given the same seed', () => {
    const a = Array.from({ length: 5 }, () => subtractFractions.generate(mulberry32(7), 'slow'));
    const b = Array.from({ length: 5 }, () => subtractFractions.generate(mulberry32(7), 'slow'));
    expect(a).toEqual(b);
  });

  it('defaults to Easy band when speed is omitted', () => {
    const q = subtractFractions.generate(mulberry32(11));
    const easyShape = /^\d+\/\d+ − \d+\/\d+ = \?$/;
    expect(easyShape.test(q.prompt)).toBe(true);
    const denoms = [...q.prompt.matchAll(/\/(\d+)/g)].map((m) => Number(m[1]));
    expect(denoms[0]).toBe(denoms[1]);
  });

  // --------------------------------------------------------------------
  // Cross-band invariant: result is NEVER negative.
  // --------------------------------------------------------------------

  describe.each(['slow', 'medium', 'fast'] as const)(
    '%s band — non-negative result invariant',
    (speed) => {
      it('correctAnswer is >= 0 for all samples', () => {
        const rng = mulberry32(speed === 'slow' ? 1000 : speed === 'medium' ? 2000 : 3000);
        for (let i = 0; i < SAMPLE_COUNT; i++) {
          const q = subtractFractions.generate(rng, speed);
          expect(
            q.correctAnswer,
            `${speed} sample ${i}: prompt "${q.prompt}" produced negative answer ${q.correctAnswer}`,
          ).toBeGreaterThanOrEqual(0);
        }
      });
    },
  );

  // --------------------------------------------------------------------
  // Shape invariants — apply to all three bands.
  // --------------------------------------------------------------------

  describe.each(['slow', 'medium', 'fast'] as const)('%s band — shape invariants', (speed) => {
    const rng = mulberry32(speed === 'slow' ? 100 : speed === 'medium' ? 200 : 300);
    const samples = Array.from({ length: SAMPLE_COUNT }, () =>
      subtractFractions.generate(rng, speed),
    );

    it('every Question has CHOICE_COUNT (4) choices', () => {
      for (const q of samples) {
        expect(q.choices).toHaveLength(config.layout.targetLanes);
        expect(q.choiceDisplays).toHaveLength(config.layout.targetLanes);
      }
    });

    it('correctAnswer is one of the choices', () => {
      for (const q of samples) {
        expect(q.choices).toContain(q.correctAnswer);
      }
    });

    it('correctDisplay is one of the choiceDisplays', () => {
      for (const q of samples) {
        expect(q.choiceDisplays).toContain(q.correctDisplay);
      }
    });

    it('correctAnswer and correctDisplay are at the SAME index', () => {
      for (const q of samples) {
        const idx = q.choices.indexOf(q.correctAnswer);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(q.choiceDisplays![idx]).toBe(q.correctDisplay);
      }
    });

    it('choices are all distinct decimal values', () => {
      for (const q of samples) {
        expect(new Set(q.choices).size).toBe(q.choices.length);
      }
    });

    it('choiceDisplays are all distinct strings', () => {
      for (const q of samples) {
        expect(new Set(q.choiceDisplays).size).toBe(q.choiceDisplays!.length);
      }
    });

    it('every choice has a non-negative numeric value', () => {
      for (const q of samples) {
        for (const c of q.choices) {
          expect(c).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('every choiceDisplay is a valid fraction / mixed / whole / zero string', () => {
      // Accepted shapes: "0", "N", "N/D", "W N/D"
      const shape = /^(\d+|\d+\/\d+|\d+ \d+\/\d+)$/;
      for (const q of samples) {
        for (const d of q.choiceDisplays!) {
          expect(shape.test(d), `bad display: "${d}"`).toBe(true);
        }
      }
    });
  });

  // --------------------------------------------------------------------
  // Per-band content invariants.
  // --------------------------------------------------------------------

  describe('Easy band — like fractions', () => {
    const rng = mulberry32(101);
    const samples = Array.from({ length: SAMPLE_COUNT }, () =>
      subtractFractions.generate(rng, 'slow'),
    );

    it('prompt is two like fractions: a/d − b/d, with a >= b', () => {
      const re = /^(\d+)\/(\d+) − (\d+)\/(\d+) = \?$/;
      for (const q of samples) {
        const m = re.exec(q.prompt);
        expect(m, `prompt did not match: ${q.prompt}`).not.toBeNull();
        const a = Number(m![1]);
        const den1 = Number(m![2]);
        const b = Number(m![3]);
        const den2 = Number(m![4]);
        expect(den1).toBe(den2); // like fractions
        expect(den1).toBeGreaterThanOrEqual(2);
        expect(den1).toBeLessThanOrEqual(12);
        expect(a).toBeGreaterThanOrEqual(b); // non-negative result
      }
    });

    it('correctAnswer equals the actual decimal difference', () => {
      const re = /^(\d+)\/(\d+) − (\d+)\/(\d+) = \?$/;
      for (const q of samples) {
        const m = re.exec(q.prompt)!;
        const a = Number(m[1]);
        const d = Number(m[2]);
        const b = Number(m[3]);
        const expected = (a - b) / d;
        expect(q.correctAnswer).toBeCloseTo(expected, 10);
      }
    });
  });

  describe('Medium band — mixed numbers', () => {
    const rng = mulberry32(201);
    const samples = Array.from({ length: SAMPLE_COUNT }, () =>
      subtractFractions.generate(rng, 'medium'),
    );

    it('prompt is two mixed numbers: W1 a/d − W2 b/d, with first >= second', () => {
      const re = /^(\d+) (\d+)\/(\d+) − (\d+) (\d+)\/(\d+) = \?$/;
      for (const q of samples) {
        const m = re.exec(q.prompt);
        expect(m, `prompt did not match: ${q.prompt}`).not.toBeNull();
        const w1 = Number(m![1]);
        const f1 = Number(m![2]);
        const den1 = Number(m![3]);
        const w2 = Number(m![4]);
        const f2 = Number(m![5]);
        const den2 = Number(m![6]);
        expect(den1).toBe(den2);
        expect(den1).toBeGreaterThanOrEqual(2);
        expect(den1).toBeLessThanOrEqual(8);
        // Improper-form ordering: w1*d + f1 >= w2*d + f2
        const imp1 = w1 * den1 + f1;
        const imp2 = w2 * den1 + f2;
        expect(imp1).toBeGreaterThanOrEqual(imp2);
      }
    });

    it('correctAnswer equals the actual decimal difference', () => {
      const re = /^(\d+) (\d+)\/(\d+) − (\d+) (\d+)\/(\d+) = \?$/;
      for (const q of samples) {
        const m = re.exec(q.prompt)!;
        const w1 = Number(m[1]);
        const f1 = Number(m[2]);
        const d = Number(m[3]);
        const w2 = Number(m[4]);
        const f2 = Number(m[5]);
        const expected = w1 - w2 + (f1 - f2) / d;
        expect(q.correctAnswer).toBeCloseTo(expected, 10);
      }
    });
  });

  describe('Hard band — unlike fractions', () => {
    const rng = mulberry32(301);
    const samples = Array.from({ length: SAMPLE_COUNT }, () =>
      subtractFractions.generate(rng, 'fast'),
    );

    it('prompt is two unlike fractions: a/d1 − b/d2, denominators in expected ratio', () => {
      const re = /^(\d+)\/(\d+) − (\d+)\/(\d+) = \?$/;
      for (const q of samples) {
        const m = re.exec(q.prompt);
        expect(m, `prompt did not match: ${q.prompt}`).not.toBeNull();
        const den1 = Number(m![2]);
        const den2 = Number(m![4]);
        expect(den1).not.toBe(den2); // unlike
        const [smaller, larger] = den1 < den2 ? [den1, den2] : [den2, den1];
        expect(smaller).toBeGreaterThanOrEqual(2);
        expect(smaller).toBeLessThanOrEqual(4);
        const ratio = larger / smaller;
        expect(ratio === 2 || ratio === 3).toBe(true);
        expect(larger).toBeLessThanOrEqual(12);
      }
    });

    it('correctAnswer equals the actual decimal difference (first − second)', () => {
      const re = /^(\d+)\/(\d+) − (\d+)\/(\d+) = \?$/;
      for (const q of samples) {
        const m = re.exec(q.prompt)!;
        const a = Number(m[1]);
        const d1 = Number(m[2]);
        const b = Number(m[3]);
        const d2 = Number(m[4]);
        const expected = a / d1 - b / d2;
        expect(q.correctAnswer).toBeCloseTo(expected, 10);
      }
    });
  });
});
