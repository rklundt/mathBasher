// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import type { MathId, SpeedKey } from '@/core/config';
import { getGenerator, getImplementedIds } from '@/math/registry';
import { panValue, toMissingNumber, weightError, type MissingNumberQuestion } from '@/math/missingNumber';
import { wholeParts } from '@/math/equationParts';
import type { Question } from '@/math/types';

/** A tiny seeded RNG so failures reproduce. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SPEEDS: SpeedKey[] = ['slow', 'medium', 'fast'];

function draw(id: MathId, speed: SpeedKey, count: number, rng: () => number): MissingNumberQuestion {
  for (let i = 0; i < 50; i++) {
    const q = toMissingNumber(getGenerator(id).generate(rng, speed), { count, reversedAllowed: speed !== 'slow', rng });
    if (q) return q;
  }
  throw new Error(`no missing-number question for ${id} ${speed}`);
}

describe('toMissingNumber (sprint 2.12)', () => {
  it('every challenge gives its sentence parts', () => {
    for (const id of getImplementedIds()) {
      for (const speed of SPEEDS)
        expect(getGenerator(id).generate(seeded(1), speed).parts, `${id} ${speed}`).toBeDefined();
    }
  });

  it('every challenge, difficulty and tray size: a fair sentence with one right weight', () => {
    const rng = seeded(42);
    for (const id of getImplementedIds()) {
      for (const speed of SPEEDS) {
        for (const count of [3, 4, 5]) {
          for (let n = 0; n < 60; n++) {
            const q = draw(id, speed, count, rng);
            const tag = `${id} ${speed} ${q.prompt} [${(q.choiceDisplays ?? q.choices.map(String)).join(', ')}]`;
            const s = q.sentence;
            expect(q.choices, tag).toHaveLength(count);
            expect(q.prompt.split('?').length - 1, tag).toBe(1);
            // The right weight balances; every other weight doesn't, and differs in value.
            expect(Math.abs(panValue(s, q.correctAnswer) - s.total.value), tag).toBeLessThan(1e-9);
            const values = q.choices.map((v) => Math.round(v * 1e9));
            expect(new Set(values).size, tag).toBe(count);
            for (const v of q.choices) {
              if (Math.abs(v - q.correctAnswer) < 1e-9) continue;
              expect(Math.abs(weightError(s, v)), tag).toBeGreaterThan(0);
              expect(panValue(s, v), tag).toBeGreaterThanOrEqual(-1e-9);
              expect(v, tag).toBeGreaterThan(id.includes('fractions') ? 0 : -1);
            }
            // Never a blank zero, never a zero total.
            expect(q.correctAnswer, tag).not.toBe(0);
            expect(s.total.value, tag).not.toBe(0);
            // Displays: all or none.
            if (q.choiceDisplays) expect(q.choiceDisplays, tag).toHaveLength(count);
            // Reversed only on Medium and Hard.
            if (speed === 'slow') expect(s.reversed, tag).toBe(false);
          }
        }
      }
    }
  });

  it('uses every form on Medium (blank either side, reversed or not)', () => {
    const rng = seeded(7);
    const seen = new Set<string>();
    for (let n = 0; n < 200; n++) {
      const s = draw('add-to-20', 'medium', 4, rng).sentence;
      seen.add(`${String(s.blank)}${String(s.reversed)}`);
    }
    expect([...seen].sort()).toEqual(['0false', '0true', '1false', '1true']);
  });

  it('writes the sentence the way the forms read', () => {
    const q: Question = {
      prompt: '12 + 5 = ?',
      correctAnswer: 17,
      choices: [17],
      parts: wholeParts(12, '+', 5, 17, 1, 19),
    };
    const forms = new Set<string>();
    const rng = seeded(3);
    for (let n = 0; n < 80; n++) forms.add(toMissingNumber(q, { count: 4, reversedAllowed: true, rng })!.prompt);
    expect([...forms].sort()).toEqual(['12 + ? = 17', '17 = 12 + ?', '17 = ? + 5', '? + 5 = 17']);
  });

  it('never blanks a zero, and skips a zero total', () => {
    const rng = seeded(5);
    const plusZero: Question = {
      prompt: '7 + 0 = ?',
      correctAnswer: 7,
      choices: [7],
      parts: wholeParts(7, '+', 0, 7, 0, 10),
    };
    for (let n = 0; n < 30; n++)
      expect(toMissingNumber(plusZero, { count: 3, reversedAllowed: false, rng })!.prompt).toBe('? + 0 = 7');
    const zeroTotal: Question = {
      prompt: '4 − 4 = ?',
      correctAnswer: 0,
      choices: [0],
      parts: wholeParts(4, '−', 4, 0, 0, 10),
    };
    expect(toMissingNumber(zeroTotal, { count: 3, reversedAllowed: false, rng })).toBeNull();
    expect(
      toMissingNumber({ prompt: 'x', correctAnswer: 1, choices: [1] }, { count: 3, reversedAllowed: false, rng }),
    ).toBeNull();
  });

  it('a missing dividend comes with whole wrong dividends (quotients × the divisor)', () => {
    const rng = seeded(9);
    const q: Question = {
      prompt: '24 ÷ 4 = ?',
      correctAnswer: 6,
      choices: [6],
      parts: wholeParts(24, '÷', 4, 6, 2, 10),
    };
    for (let n = 0; n < 40; n++) {
      const m = toMissingNumber(q, { count: 5, reversedAllowed: false, rng })!;
      if (m.sentence.blank !== 0) continue;
      for (const v of m.choices) expect(v % 4).toBe(0);
    }
  });

  it('tips more for a bigger miss, and says which way', () => {
    const q: Question = {
      prompt: '12 + 5 = ?',
      correctAnswer: 17,
      choices: [17],
      parts: wholeParts(12, '+', 5, 17, 1, 19),
    };
    const m = toMissingNumber(q, { count: 4, reversedAllowed: false, rng: () => 0.99 })!; // blank the 5
    expect(weightError(m.sentence, 5)).toBe(0);
    expect(weightError(m.sentence, 8)).toBeGreaterThan(weightError(m.sentence, 6));
    expect(weightError(m.sentence, 3)).toBeLessThan(0);
  });

  it('fraction weights are written like the problem (not reduced) and never equal the answer in value', () => {
    const rng = seeded(11);
    for (let n = 0; n < 200; n++) {
      const q = draw('add-fractions', 'medium', 5, rng);
      expect(
        q.choiceDisplays!.every((d) => /^\d+ \d+\/\d+$|^\d+\/\d+$/.test(d)),
        q.choiceDisplays!.join(','),
      ).toBe(true);
    }
  });
});
