// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { config, type PairPalsSize } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';
import {
  boardLayout,
  deal,
  moveFocus,
  newBoard,
  pickPictures,
  releaseMiss,
  tapCard,
  totalPairs,
  touchingPairs,
} from '@/game/systems/pairPalsMath';

const P = config.pairPals;
const SIZES = Object.keys(P.sizes) as PairPalsSize[];

describe('Pair Pals deal (sprint 2.13)', () => {
  it('every size: cols × rows cards, each picture exactly twice, from the theme', () => {
    for (const size of SIZES) {
      const { cols, rows } = P.sizes[size];
      for (const theme of P.themes) {
        const cards = deal(cols, rows, P.picturesPerTheme, P.twinGroups[theme], mulberry32(7));
        expect(cards.length, `${size} ${theme}`).toBe(cols * rows);
        const counts = new Map<number, number>();
        for (const p of cards) counts.set(p, (counts.get(p) ?? 0) + 1);
        expect([...counts.values()].every((n) => n === 2)).toBe(true);
        expect(cards.every((p) => p >= 0 && p < P.picturesPerTheme)).toBe(true);
      }
    }
  });

  it('is seeded: the same seed deals the same board, another seed a different one', () => {
    const a = deal(6, 5, 20, [], mulberry32(1));
    expect(deal(6, 5, 20, [], mulberry32(1))).toEqual(a);
    expect(deal(6, 5, 20, [], mulberry32(2))).not.toEqual(a);
  });

  it('keeps look-alikes apart when there are enough other pictures', () => {
    for (const theme of P.themes) {
      const groups = P.twinGroups[theme];
      const distinct = P.picturesPerTheme - groups.reduce((sum, g) => sum + g.length - 1, 0);
      for (const size of SIZES) {
        const { cols, rows } = P.sizes[size];
        const pairs = (cols * rows) / 2;
        for (let seed = 1; seed <= 200; seed++) {
          const picked = pickPictures(pairs, P.picturesPerTheme, groups, mulberry32(seed));
          const twins = groups.map((g) => g.filter((p) => picked.includes(p)).length);
          if (pairs <= distinct) {
            expect(Math.max(0, ...twins), `${theme} ${size} seed ${String(seed)}`).toBeLessThanOrEqual(1);
          } else {
            // Only as many second look-alikes as the board needs.
            const extra = twins.reduce((sum, n) => sum + Math.max(0, n - 1), 0);
            expect(extra, `${theme} ${size} seed ${String(seed)}`).toBe(pairs - distinct);
          }
        }
      }
    }
  });

  it('no matching pair touches (side, above / below or corner), on every size, over many deals', () => {
    for (const size of SIZES) {
      const { cols, rows } = P.sizes[size];
      for (let seed = 1; seed <= 300; seed++) {
        const cards = deal(cols, rows, P.picturesPerTheme, [], mulberry32(seed));
        expect(touchingPairs(cards, cols), `${size} seed ${String(seed)}`).toBe(0);
      }
    }
  });

  it('counts touching pairs: side by side, above / below, corner to corner, not across a row end', () => {
    // 3 across: 1 2 3 / 4 5 6
    expect(touchingPairs([1, 1, 2, 3, 4, 5], 3)).toBe(1); // side by side
    expect(touchingPairs([1, 2, 3, 1, 4, 5], 3)).toBe(1); // above / below
    expect(touchingPairs([1, 2, 3, 4, 1, 5], 3)).toBe(1); // corner to corner
    expect(touchingPairs([1, 2, 3, 3, 4, 5], 3)).toBe(0); // the end of a row and the start of the next aren't neighbours
    expect(touchingPairs([1, 2, 3, 4, 5, 1], 3)).toBe(0);
  });

  it('every twin group names real, different pictures', () => {
    for (const theme of P.themes) {
      const all = P.twinGroups[theme].flat();
      expect(new Set(all).size, theme).toBe(all.length);
      expect(all.every((p) => p >= 0 && p < P.picturesPerTheme)).toBe(true);
    }
  });
});

describe('Pair Pals turns (sprint 2.13)', () => {
  // Cards 0 & 2 are a pair, 1 & 3 are a pair.
  const fresh = () => newBoard([5, 9, 5, 9]);

  it('a match: the turn counts, both cards stay up, the last pair wins', () => {
    const b = fresh();
    expect(tapCard(b, 0)).toEqual({ kind: 'first', card: 0, releasing: null });
    expect(tapCard(b, 2)).toEqual({ kind: 'match', cards: [0, 2], won: false });
    expect([b.turns, b.pairsFound, b.states[0], b.states[2]]).toEqual([1, 1, 'matched', 'matched']);
    tapCard(b, 1);
    expect(tapCard(b, 3)).toEqual({ kind: 'match', cards: [1, 3], won: true });
    expect([b.turns, b.pairsFound, totalPairs(b)]).toEqual([2, 2, 2]);
  });

  it('a miss shows both cards until released; the turn counts', () => {
    const b = fresh();
    tapCard(b, 0);
    expect(tapCard(b, 1)).toEqual({ kind: 'miss', cards: [0, 1] });
    expect([b.turns, b.states[0], b.states[1], b.held]).toEqual([1, 'up', 'up', [0, 1]]);
    expect(releaseMiss(b)).toEqual([0, 1]);
    expect([b.states[0], b.states[1], b.held]).toEqual(['down', 'down', null]);
    expect(releaseMiss(b)).toBeNull();
  });

  it('a face-up, matched or the same card ignores taps and costs nothing', () => {
    const b = fresh();
    tapCard(b, 0);
    expect(tapCard(b, 0)).toEqual({ kind: 'ignored' });
    tapCard(b, 2); // matched
    expect(tapCard(b, 2)).toEqual({ kind: 'ignored' });
    expect(tapCard(b, 99)).toEqual({ kind: 'ignored' });
    expect(b.turns).toBe(1);
  });

  it('a tap during a miss: on the missed pair it just turns them back; elsewhere it also turns the new card', () => {
    const b = fresh();
    tapCard(b, 0);
    tapCard(b, 1);
    expect(tapCard(b, 1)).toEqual({ kind: 'release', cards: [0, 1] });
    expect([b.states[0], b.states[1], b.first]).toEqual(['down', 'down', null]);

    tapCard(b, 0);
    tapCard(b, 1);
    expect(tapCard(b, 3)).toEqual({ kind: 'first', card: 3, releasing: [0, 1] });
    expect([b.states[0], b.states[1], b.states[3], b.first, b.turns]).toEqual(['down', 'down', 'up', 3, 2]);
  });

  it('a tap on a matched card during a miss changes nothing', () => {
    const b = newBoard([1, 1, 2, 3, 2, 3]);
    tapCard(b, 0);
    tapCard(b, 1); // matched
    tapCard(b, 2);
    tapCard(b, 3); // miss
    expect(tapCard(b, 0)).toEqual({ kind: 'ignored' });
    expect(b.held).toEqual([2, 3]);
  });
});

describe('Pair Pals layout and focus (sprint 2.13)', () => {
  it('cards fit the board area without overlapping, at about 180 / 140 / 110 px', () => {
    const expected: Record<PairPalsSize, [number, number]> = { easy: [170, 180], medium: [135, 145], hard: [105, 115] };
    for (const size of SIZES) {
      const { cols, rows } = P.sizes[size];
      const area = { ...P.board, gapPx: P.board.gapPx[size] };
      const { cardPx, positions } = boardLayout(cols, rows, area);
      expect(cardPx, size).toBeGreaterThanOrEqual(expected[size][0]);
      expect(cardPx, size).toBeLessThanOrEqual(expected[size][1]);
      expect(positions.length).toBe(cols * rows);
      const half = cardPx / 2;
      for (const p of positions) {
        expect(p.y - half).toBeGreaterThanOrEqual(P.board.top);
        expect(p.y + half).toBeLessThanOrEqual(P.board.bottom);
        expect(p.x - half).toBeGreaterThanOrEqual(P.board.centerX - P.board.maxWidth / 2);
        expect(p.x + half).toBeLessThanOrEqual(P.board.centerX + P.board.maxWidth / 2);
      }
      // Neighbours are a card plus a gap apart.
      expect(positions[1].x - positions[0].x).toBe(cardPx + area.gapPx);
      expect(positions[cols].y - positions[0].y).toBe(cardPx + area.gapPx);
      // The mascot's strip on the left stays clear.
      expect(positions[0].x - half).toBeGreaterThan(P.mascot.x + P.mascot.sizePx / 2 - 40);
    }
  });

  it('arrow focus moves over the grid and stops at the edges', () => {
    // 4 × 3: 0 1 2 3 / 4 5 6 7 / 8 9 10 11
    expect(moveFocus(5, 'left', 4, 3)).toBe(4);
    expect(moveFocus(4, 'left', 4, 3)).toBe(4);
    expect(moveFocus(3, 'right', 4, 3)).toBe(3);
    expect(moveFocus(1, 'up', 4, 3)).toBe(1);
    expect(moveFocus(1, 'down', 4, 3)).toBe(5);
    expect(moveFocus(9, 'down', 4, 3)).toBe(9);
    expect(moveFocus(9, 'up', 4, 3)).toBe(5);
  });
});
