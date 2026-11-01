// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { config, type PuzzleLevel } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';
import { generateThemed, type ThemedPuzzle } from '@/game/systems/puzzles/themedPuzzles';
import { NUMBER_RULES, makeTenBoard, makeTenSolutions } from '@/game/systems/puzzles/numberPuzzles';

const P = config.puzzles;
const LEVELS: PuzzleLevel[] = ['easy', 'medium', 'hard'];
type NumberId = 'number-train' | 'number-machine' | 'odd-number-out' | 'quick-count';
const IDS: NumberId[] = ['number-train', 'number-machine', 'odd-number-out', 'quick-count'];

function each(id: NumberId, fn: (p: ThemedPuzzle, level: PuzzleLevel, tag: string) => void): void {
  for (const level of LEVELS)
    for (let seed = 1; seed <= 300; seed++) {
      fn(generateThemed(id, level, mulberry32(seed * 41 + 3)), level, `${id} ${level} seed ${String(seed)}`);
    }
}

const values = (p: ThemedPuzzle): number[] => p.choices.map((c) => Number(c.text));
const right = (p: ThemedPuzzle): number => Number(p.choices[p.answer].text);

describe('the Numbers puzzles (sprint 2.16)', () => {
  it('every puzzle: the right number of choices, all different whole numbers, one answer', () => {
    for (const id of IDS)
      each(id, (p, level, tag) => {
        const want = id === 'odd-number-out' ? P.oddNumberOut.items[level] : P.choices[level];
        expect(p.choices.length, tag).toBe(want);
        expect(new Set(values(p)).size, tag).toBe(want);
        for (const v of values(p)) {
          expect(Number.isInteger(v), tag).toBe(true);
          expect(v, tag).toBeGreaterThanOrEqual(0);
        }
        expect(p.answer, tag).toBeGreaterThanOrEqual(0);
      });
  });

  it('Number Train: counting trains go up or down by the same step every time', () => {
    each('number-train', (p, level, tag) => {
      if (p.stage.kind !== 'train') throw new Error(tag);
      expect(p.stage.cars.filter((c) => c === null).length, tag).toBe(1);
      if (level === 'hard') return;
      const seq = p.stage.cars.map((c) => (c === null ? right(p) : Number(c.text)));
      const step = seq[1] - seq[0];
      expect(step, tag).not.toBe(0);
      seq.forEach((v, k) => expect(v, tag).toBe(seq[0] + k * step));
    });
  });

  it('Number Machine: one rule fits every row, and gives the answer', () => {
    each('number-machine', (p, _level, tag) => {
      if (p.stage.kind !== 'machine') throw new Error(tag);
      const rows = p.stage.rows.map((r) => [Number(r.input.text), Number(r.output.text)] as const);
      expect(rows.length, tag).toBeGreaterThanOrEqual(2);
      const [[x1, y1], [x2, y2]] = rows;
      const a = (y2 - y1) / (x2 - x1);
      const b = y1 - a * x1;
      for (const [x, y] of rows) expect(a * x + b, tag).toBe(y);
      expect(a * Number(p.stage.next.text) + b, tag).toBe(right(p));
    });
  });

  it('Odd Number Out: one rule all the others keep, and no other rule picks a different number', () => {
    const all = Object.values(NUMBER_RULES).flat();
    each('odd-number-out', (p, level, tag) => {
      const vals = values(p);
      const odd = right(p);
      const keeps = NUMBER_RULES[level].some((r) => !r.test(odd) && vals.every((v) => v === odd || r.test(v)));
      expect(keeps, tag).toBe(true);
      for (const r of all) {
        const fails = vals.filter((v) => !r.test(v));
        const passes = vals.filter((v) => r.test(v));
        if (fails.length === 1) expect(fails[0], `${tag} ${r.id}`).toBe(odd);
        if (passes.length === 1) expect(passes[0], `${tag} ${r.id}`).toBe(odd);
      }
    });
  });

  it('Quick Count: the answer is how many spots show, all on the mat', () => {
    each('quick-count', (p, level, tag) => {
      if (p.stage.kind !== 'flash') throw new Error(tag);
      const [lo, hi] = P.quickCount.count[level];
      expect(right(p), tag).toBe(p.stage.spots.length);
      expect(right(p), tag).toBeGreaterThanOrEqual(lo);
      expect(right(p), tag).toBeLessThanOrEqual(hi);
      for (const s of p.stage.spots) {
        expect(s.x, tag).toBeGreaterThan(0);
        expect(s.x, tag).toBeLessThan(1);
        expect(s.y, tag).toBeGreaterThan(0);
        expect(s.y, tag).toBeLessThan(1);
      }
    });
  });
});

describe('Make Ten (sprint 2.16)', () => {
  it('every board can be solved (a few ways at most), with the level’s cards, pick and target', () => {
    for (const level of LEVELS)
      for (let seed = 1; seed <= 300; seed++) {
        const b = makeTenBoard(level, mulberry32(seed));
        const tag = `${level} seed ${String(seed)}`;
        expect(b.cards.length, tag).toBe(P.makeTen.cards[level]);
        expect(b.pick, tag).toBe(P.makeTen.pick[level]);
        expect(b.target, tag).toBe(P.makeTen.target[level]);
        expect(
          b.solution.reduce((a, c) => a + c, 0),
          tag,
        ).toBe(b.target);
        const ways = makeTenSolutions(b.cards, b.pick, b.target).length;
        expect(ways, tag).toBeGreaterThanOrEqual(1);
        expect(ways, tag).toBeLessThanOrEqual(3);
        for (const c of b.cards) expect(c, tag).toBeGreaterThanOrEqual(1);
      }
  });
});
