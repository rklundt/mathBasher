// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { config, type SpeedKey } from '@/core/config';
import { generators, getImplementedIds } from '@/math/registry';
import { extendChoices, parseFractionDisplay } from '@/math/extendChoices';
import { mulberry32 } from '@/test-utils/mulberry32';

describe('extendChoices', () => {
  it('parses fraction labels, including 0 and whole numbers', () => {
    expect(parseFractionDisplay('3/4')).toEqual({ num: 3, den: 4 });
    expect(parseFractionDisplay('1 1/2')).toEqual({ num: 3, den: 2 });
    expect(parseFractionDisplay('2')).toEqual({ num: 2, den: 1 });
    expect(parseFractionDisplay('0')).toEqual({ num: 0, den: 1 });
    expect(parseFractionDisplay('x')).toBeNull();
  });

  it('every math type, every difficulty: Hard gets enough distinct choices, the right one kept', () => {
    const target = Math.max(...Object.values(config.spaceShooter.speed).map((s) => s.shipCount));
    const rng = mulberry32(2026);
    for (const id of getImplementedIds()) {
      for (const speed of ['slow', 'medium', 'fast'] as SpeedKey[]) {
        for (let n = 0; n < 60; n++) {
          const q = generators[id].generate(rng, speed);
          const out = extendChoices(q, target, rng);
          expect(out.choices, `${id} ${speed}`).toHaveLength(target);
          expect(new Set(out.choices.map((c) => c.toFixed(6))).size, `${id} ${speed}`).toBe(target);
          expect(out.choices).toContain(q.correctAnswer);
          expect(out.choices.slice(0, q.choices.length)).toEqual(q.choices);
          if (q.choiceDisplays) {
            expect(out.choiceDisplays).toHaveLength(target);
            const extra = parseFractionDisplay(out.choiceDisplays![target - 1]!)!;
            expect(extra.num / extra.den).toBeCloseTo(out.choices[target - 1]!, 9);
          } else {
            for (const c of out.choices) expect(c).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('whole numbers: prefers an unused value inside the choices range', () => {
    // 8 is free between 3 and 10, so the answer 10 doesn't get an 11.
    const out = extendChoices({ choices: [3, 7, 9, 10], correctAnswer: 10 }, 5, mulberry32(1));
    expect(out.choices[4]).toBe(8);
  });

  it('whole numbers: steps past taken neighbours (144 with 143–146 on screen)', () => {
    const out = extendChoices({ choices: [143, 144, 145, 146], correctAnswer: 144 }, 5, mulberry32(3));
    expect([142, 147]).toContain(out.choices[4]);
  });

  it('answer 0 never gets a negative neighbour', () => {
    const out = extendChoices({ choices: [0, 1, 2, 3], correctAnswer: 0 }, 5, mulberry32(8));
    expect(out.choices[4]).toBe(4);
  });

  it('a fraction answer of 0 still gets a labelled extra', () => {
    const q = { choices: [0, 0.25, 0.5, 0.75], correctAnswer: 0, correctDisplay: '0', choiceDisplays: ['0', '1/4', '1/2', '3/4'] };
    const out = extendChoices(q, 5, mulberry32(4));
    expect(out.choices).toHaveLength(5);
    expect(out.choiceDisplays).toHaveLength(5);
  });

  it('leaves 4 choices alone when only 4 are needed', () => {
    expect(extendChoices({ choices: [1, 2, 3, 4], correctAnswer: 2 }, 4, mulberry32(1)).choices).toEqual([1, 2, 3, 4]);
  });
});
