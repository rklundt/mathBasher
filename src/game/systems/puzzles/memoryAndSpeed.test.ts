// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { config, type PuzzleLevel } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';
import { copyCatLengths, copyCatSequence, huntBoard } from '@/game/systems/puzzles/memoryAndSpeed';

const P = config.puzzles;
const LEVELS: PuzzleLevel[] = ['easy', 'medium', 'hard'];

describe('Copy Cat (sprint 2.14)', () => {
  it('sequences start at the level and grow by one each round', () => {
    expect(copyCatLengths('easy')).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(copyCatLengths('hard')[0]).toBe(P.copyCat.startLength.hard);
  });

  it('a sequence uses only the pads there are and never one pad three times running', () => {
    for (const level of LEVELS) {
      const pads = P.copyCat.pads[level];
      for (let seed = 1; seed <= 300; seed++) {
        const seq = copyCatSequence(12, pads, mulberry32(seed));
        expect(seq.length).toBe(12);
        expect(seq.every((p) => p >= 0 && p < pads)).toBe(true);
        for (let i = 2; i < seq.length; i++) expect(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]).toBe(false);
      }
    }
  });

  it('there is a sound and an animal for every pad', () => {
    expect(P.copyCat.animals.length).toBeGreaterThanOrEqual(P.copyCat.pads.hard);
  });
});

describe('Symbol Hunt (sprint 2.14)', () => {
  it('every board: the level’s card count, between its min and max matches, all marked, none missed', () => {
    for (const level of LEVELS) {
      const [lo, hi] = P.symbolHunt.targets[level];
      for (let seed = 1; seed <= 300; seed++) {
        const b = huntBoard(level, mulberry32(seed));
        expect(b.cards.length).toBe(P.symbolHunt.cards[level]);
        expect(b.matches.length).toBeGreaterThanOrEqual(lo);
        expect(b.matches.length).toBeLessThanOrEqual(hi);
        b.cards.forEach((c, i) => {
          const same = c.shape === b.target.shape && c.colour === b.target.colour;
          expect(b.matches.includes(i)).toBe(same);
        });
      }
    }
  });

  it('Easy has no look-alikes; Hard has plenty', () => {
    let hardLookalikes = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const e = huntBoard('easy', mulberry32(seed));
      e.cards.forEach((c, i) => {
        if (!e.matches.includes(i)) expect(c.shape !== e.target.shape && c.colour !== e.target.colour).toBe(true);
      });
      const h = huntBoard('hard', mulberry32(seed));
      h.cards.forEach((c, i) => {
        if (!h.matches.includes(i) && (c.shape === h.target.shape || c.colour === h.target.colour)) hardLookalikes++;
      });
    }
    expect(hardLookalikes / 100).toBeGreaterThan(8);
  });

  it('the grid fits the level’s columns', () => {
    for (const level of LEVELS) expect(P.symbolHunt.cards[level] % P.symbolHunt.cols[level]).toBe(0);
  });
});
