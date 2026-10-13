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

    it('every prompt parses to two integers ≥ 1 summing to [2, 20]', () => {
      const re = /^(\d+) \+ (\d+) = \?$/;
      for (const q of samples) {
        const match = re.exec(q.prompt);
        expect(match, `prompt did not parse: ${q.prompt}`).not.toBeNull();
        const a = Number(match![1]);
        const b = Number(match![2]);
        expect(Number.isInteger(a)).toBe(true);
        expect(Number.isInteger(b)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(1);
        expect(b).toBeGreaterThanOrEqual(1);
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

    it('every choice is a distinct integer in [2, 24] (wrong answers may slip past 20)', () => {
      for (const q of samples) {
        expect(new Set(q.choices).size).toBe(q.choices.length);
        for (const c of q.choices) {
          expect(Number.isInteger(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(2);
          expect(c).toBeLessThanOrEqual(24);
        }
      }
    });
  });

  it('produces the same sequence given the same seed', () => {
    const a = Array.from({ length: 5 }, () => addTo20.generate(mulberry32(7)));
    const b = Array.from({ length: 5 }, () => addTo20.generate(mulberry32(7)));
    expect(a).toEqual(b);
  });

  // The answer / factor mix (sprint 2.5.7 weights) is locked for every
  // whole-number generator in `src/math/questionMix.test.ts`.
});
