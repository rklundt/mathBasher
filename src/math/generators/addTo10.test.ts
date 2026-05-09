// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import addTo10 from '@/math/generators/addTo10';
import { config } from '@/core/config';

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('addTo10 generator', () => {
  it('has the expected identity', () => {
    expect(addTo10.id).toBe('add-to-10');
    expect(addTo10.label).toBe('Add to 10');
    expect(addTo10.description).toMatch(/sum at most 10/i);
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
});
