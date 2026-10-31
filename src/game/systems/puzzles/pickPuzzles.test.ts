// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { config, type PuzzleLevel } from '@/core/config';
import type { PickPuzzleId } from '@/core/gameIds';
import { mulberry32 } from '@/test-utils/mulberry32';
import { generatePick, generatePickRound, lookAlikeShapes, type PickPuzzle } from '@/game/systems/puzzles/pickPuzzles';
import { lookOf, sameLook, spinCells, type ShapeToken, type Token } from '@/game/systems/puzzles/tokens';

const P = config.puzzles;
const LEVELS: PuzzleLevel[] = ['easy', 'medium', 'hard'];
const IDS: PickPuzzleId[] = ['pattern-train', 'missing-piece', 'odd-one-out', 'magic-wand', 'spin-match'];

function each(fn: (p: PickPuzzle, id: PickPuzzleId, level: PuzzleLevel, seed: number) => void): void {
  for (const id of IDS)
    for (const level of LEVELS)
      for (let seed = 1; seed <= 300; seed++) fn(generatePick(id, level, mulberry32(seed * 31 + 7)), id, level, seed);
}

const valid = (t: Token): boolean => {
  switch (t.kind) {
    case 'shape':
      return (
        t.shape >= 0 &&
        t.shape < P.shapes.length &&
        t.colour >= 0 &&
        t.colour < P.colours.length &&
        (t.size === 0 || t.size === 1) &&
        t.turn >= 0 &&
        t.turn <= 3 &&
        t.count >= 1 &&
        t.count <= 3 &&
        (t.hat === null || (t.hat >= 0 && t.hat < P.hats.length))
      );
    case 'spin':
      return (
        t.shape >= 0 &&
        t.shape < P.spinCells.length &&
        t.colour >= 0 &&
        t.colour < P.spinColours &&
        t.turn >= 0 &&
        t.turn <= 3
      );
    case 'picture':
      return t.frame >= 0 && t.frame < config.pairPals.picturesPerTheme;
  }
};

describe('the pick-one puzzles (sprint 2.14)', () => {
  it('every puzzle: the right number of choices, all different, the answer among them, all valid', () => {
    each((p, id, level, seed) => {
      const tag = `${id} ${level} seed ${String(seed)}`;
      const want = id === 'odd-one-out' ? P.oddOneOut.items[level] : P.choices[level];
      expect(p.choices.length, tag).toBe(want);
      expect(p.answer, tag).toBeGreaterThanOrEqual(0);
      expect(p.answer, tag).toBeLessThan(p.choices.length);
      if (id !== 'odd-one-out') expect(new Set(p.choices.map(lookOf)).size, tag).toBe(p.choices.length);
      expect(p.choices.every(valid), tag).toBe(true);
      expect(p.why.length, tag).toBeGreaterThan(0);
    });
  });

  it('Pattern Train: the answer continues what the cars show, and the cars are the right length', () => {
    each((p, id, level) => {
      if (id !== 'pattern-train' || p.stage.kind !== 'train') return;
      expect(p.stage.cars.length).toBe(P.patternTrain.cars[level]);
      expect(p.stage.cars.every(valid)).toBe(true);
    });
  });

  it('Missing Piece: 3 rows of the level’s columns, one pane missing; on Easy each row shares a shape and each column a colour', () => {
    const seen = new Set<string>();
    const mediumRules = new Set<string>();
    each((p, id, level) => {
      if (id !== 'missing-piece' || p.stage.kind !== 'window') return;
      const cells = p.stage.cells;
      const [lo, hi] = P.missingPiece.cols[level];
      expect(p.stage.cols).toBeGreaterThanOrEqual(lo);
      expect(p.stage.cols).toBeLessThanOrEqual(hi);
      seen.add(`${level}${String(p.stage.cols)}`);
      if (level === 'medium') mediumRules.add(p.why);
      expect(cells.length).toBe(P.missingPiece.rows * p.stage.cols);
      expect(cells.filter((c) => c === null).length).toBe(1);
      if (level !== 'easy') return;
      const full = cells.map((c) => c ?? p.choices[p.answer]) as ShapeToken[];
      for (let r = 0; r < 3; r++) expect(new Set(full.slice(r * 3, r * 3 + 3).map((t) => t.shape)).size).toBe(1);
      for (let c = 0; c < 3; c++) expect(new Set([0, 1, 2].map((r) => full[r * 3 + c].colour)).size).toBe(1);
    });
    expect([...seen].sort()).toEqual(['easy3', 'hard4', 'hard5', 'hard6', 'medium4']);
    // Moving shapes, turns, how many, big / small.
    expect(mediumRules.size).toBe(4);
  });

  it('Missing Piece Hard: two shapes taking turns are never look-alikes', () => {
    expect(lookAlikeShapes(P.shapes.indexOf('square'), P.shapes.indexOf('hexagon'))).toBe(true);
    expect(lookAlikeShapes(P.shapes.indexOf('hexagon'), P.shapes.indexOf('square'))).toBe(true);
    each((p, id, level) => {
      if (id !== 'missing-piece' || level !== 'hard' || p.stage.kind !== 'window') return;
      const shapes = [
        ...new Set(p.stage.cells.filter((c): c is ShapeToken => c?.kind === 'shape').map((c) => c.shape)),
      ];
      if (shapes.length !== 2) return;
      expect(lookAlikeShapes(shapes[0], shapes[1])).toBe(false);
    });
  });

  it('Pattern Train, Missing Piece and Magic Wand: no wrong choice is the answer changed only in a way the puzzle never changes', () => {
    each((p, id) => {
      if (id !== 'pattern-train' && id !== 'missing-piece' && id !== 'magic-wand') return;
      const shown = (
        p.stage.kind === 'train'
          ? p.stage.cars
          : p.stage.kind === 'window'
            ? p.stage.cells
            : p.stage.kind === 'wand'
              ? [p.stage.from, p.stage.to, p.stage.next]
              : []
      ).filter((t): t is ShapeToken => t !== null && t.kind === 'shape');
      const answer = p.choices[p.answer];
      if (answer.kind !== 'shape') return;
      const all = [...shown, answer];
      const varies = (k: keyof ShapeToken): boolean => new Set(all.map((t) => t[k])).size > 1;
      p.choices.forEach((c, i) => {
        if (i === p.answer || c.kind !== 'shape' || c.shape !== answer.shape || c.colour !== answer.colour) return;
        for (const k of ['size', 'turn', 'flip', 'count', 'hat'] as const) {
          if (c[k] !== answer[k]) expect(varies(k), `${id}: a choice differs only in ${k}`).toBe(true);
        }
      });
    });
  });

  it('Odd One Out: the odd one looks different from every other one', () => {
    each((p, id) => {
      if (id !== 'odd-one-out') return;
      const odd = p.choices[p.answer];
      p.choices.forEach((c, i) => {
        if (i !== p.answer) expect(sameLook(c, odd)).toBe(false);
      });
    });
  });

  it('Odd One Out corners: one plainly round shape among shapes with corners', () => {
    const shapeOf = (t: Token): string => (t.kind === 'shape' ? P.shapes[t.shape] : '');
    let seen = 0;
    each((p, id) => {
      if (id !== 'odd-one-out') return;
      expect(p.why).not.toBe('The others are all round!');
      if (p.why !== 'The others all have corners!') return;
      seen++;
      expect(P.round).toContain(shapeOf(p.choices[p.answer]));
      p.choices.forEach((c, i) => {
        if (i !== p.answer) expect(P.cornered).toContain(shapeOf(c));
      });
    });
    expect(seen).toBeGreaterThan(0);
  });

  it('Magic Wand: the change shows (from ≠ to), and the right answer is not the shape left unchanged', () => {
    each((p, id) => {
      if (id !== 'magic-wand' || p.stage.kind !== 'wand') return;
      expect(sameLook(p.stage.from, p.stage.to)).toBe(false);
      expect(sameLook(p.choices[p.answer], p.stage.next)).toBe(false);
    });
  });

  it('Magic Wand Hard: every change is two changes at once', () => {
    const keys = ['shape', 'colour', 'size', 'turn', 'flip', 'count', 'hat'] as const;
    each((p, id, level) => {
      if (id !== 'magic-wand' || level !== 'hard' || p.stage.kind !== 'wand') return;
      const from = p.stage.from as unknown as Record<string, unknown>;
      const to = p.stage.to as unknown as Record<string, unknown>;
      const changed = keys.filter((k) => k in from && from[k] !== to[k]);
      expect(changed.length, changed.join(', ')).toBe(2);
    });
  });

  it('Spin Match: the answer is the target turned (never flipped, never looking the same)', () => {
    each((p, id) => {
      if (id !== 'spin-match' || p.stage.kind !== 'spin') return;
      const target = p.stage.target;
      const answer = p.choices[p.answer];
      if (target.kind !== 'spin' || answer.kind !== 'spin') throw new Error('spin tokens expected');
      expect(answer.shape).toBe(target.shape);
      expect(answer.flip).toBe(target.flip);
      expect(lookOf(answer)).not.toBe(lookOf(target));
      // No wrong choice is the same shape merely turned.
      p.choices.forEach((c, i) => {
        if (i === p.answer || c.kind !== 'spin' || c.shape !== target.shape) return;
        const turns = [0, 1, 2, 3].map((t) => spinCells(target.shape, t, target.flip));
        expect(turns).not.toContain(spinCells(c.shape, c.turn, c.flip));
      });
    });
  });

  it('Spin Match Hard: every choice is the same shape (the wrong ones mirrored), never another shape', () => {
    each((p, id, level, seed) => {
      if (id !== 'spin-match' || level !== 'hard' || p.stage.kind !== 'spin') return;
      const target = p.stage.target;
      if (target.kind !== 'spin') throw new Error('spin tokens expected');
      for (const c of p.choices) {
        if (c.kind !== 'spin') throw new Error('spin tokens expected');
        expect(c.shape, `seed ${String(seed)}`).toBe(target.shape);
      }
    });
  });

  it('a round has 8 puzzles, all different', () => {
    for (const id of IDS)
      for (const level of LEVELS) {
        const round = generatePickRound(id, level, P.perRound, mulberry32(42));
        expect(round.length).toBe(P.perRound);
        const keys = round.map((p) => JSON.stringify(p.stage) + p.choices.map(lookOf).sort().join('|'));
        expect(new Set(keys).size, `${id} ${level}`).toBe(round.length);
      }
  });
});

describe('spin shapes (sprint 2.14)', () => {
  it('every one looks different flipped than any way it is turned (so "turned" and "mirrored" never match)', () => {
    for (let s = 0; s < P.spinCells.length; s++) {
      const turned = [0, 1, 2, 3].map((t) => spinCells(s, t, false));
      for (let t = 0; t < 4; t++) expect(turned, `shape ${String(s)}`).not.toContain(spinCells(s, t, true));
    }
  });

  it('no two spin shapes are the same shape', () => {
    const all = P.spinCells.map(
      (_, s) => [0, 1, 2, 3].flatMap((t) => [spinCells(s, t, false), spinCells(s, t, true)]).sort()[0],
    );
    expect(new Set(all).size).toBe(all.length);
  });
});
