// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { InMemoryStorage, type MinimalStorage } from '@/services/storage';
import { PUZZLE_PROGRESS_STORAGE_KEY, PuzzleProgress, starsFor } from '@/services/PuzzleProgress';

describe('PuzzleProgress (sprint 2.14)', () => {
  it('stars (sprint 2.16): green counts 1, yellow half; ★★★ from 7, ★★ from 5, fewer ★', () => {
    expect([8, 7, 6, 5, 4, 0].map((g) => starsFor(g))).toEqual([3, 3, 2, 2, 1, 1]);
    // The owner's round: 5 green and 3 yellow is 6½, ★★; all right but slow (8 yellow) is 4, ★.
    expect(starsFor(5, 3)).toBe(2);
    expect(starsFor(0, 8)).toBe(1);
    expect(starsFor(6, 2)).toBe(3);
    expect(starsFor(3, 4)).toBe(2);
  });

  it('remembers the most stars too: more stars is a new best even with fewer green', () => {
    const p = new PuzzleProgress(new InMemoryStorage());
    p.recordRound('word-train', 'easy', 4);
    expect(p.bestStars('word-train', 'easy')).toBe(1);
    // 3 green and 5 yellow is 5½: ★★, more stars with fewer green.
    expect(p.recordRound('word-train', 'easy', 3, 5)).toMatchObject({ stars: 2, newBest: true });
    expect([p.best('word-train', 'easy'), p.bestStars('word-train', 'easy')]).toEqual([4, 2]);
    expect(p.recordRound('word-train', 'easy', 2, 1).newBest).toBe(false);
  });

  it('starts on Easy with no bests, and remembers the level per puzzle across a reload', () => {
    const storage = new InMemoryStorage();
    const a = new PuzzleProgress(storage);
    expect(a.level('pattern-train')).toBe('easy');
    expect(a.best('pattern-train', 'easy')).toBeNull();
    a.setLevel('pattern-train', 'hard');
    a.recordRound('pattern-train', 'hard', 5);
    const b = new PuzzleProgress(storage);
    expect(b.level('pattern-train')).toBe('hard');
    expect(b.level('copy-cat')).toBe('easy');
    expect(b.best('pattern-train', 'hard')).toBe(5);
  });

  it('a best only goes up; the first round counts as one', () => {
    const p = new PuzzleProgress(new InMemoryStorage());
    expect(p.recordRound('odd-one-out', 'medium', 4)).toEqual({
      firstTry: 4,
      stars: 1,
      previousBest: null,
      newBest: true,
    });
    expect(p.recordRound('odd-one-out', 'medium', 3).newBest).toBe(false);
    expect(p.recordRound('odd-one-out', 'medium', 4).newBest).toBe(false); // a tie isn't new
    expect(p.recordRound('odd-one-out', 'medium', 8)).toEqual({
      firstTry: 8,
      stars: 3,
      previousBest: 4,
      newBest: true,
    });
    expect(p.best('odd-one-out', 'easy')).toBeNull();
  });

  it('starts fresh from corrupt or foreign entries and drops odd values', () => {
    const storage = new InMemoryStorage();
    storage.setItem(PUZZLE_PROGRESS_STORAGE_KEY, '{oops');
    expect(new PuzzleProgress(storage).level('spin-match')).toBe('easy');
    storage.setItem(
      PUZZLE_PROGRESS_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        level: { 'spin-match': 'hard', 'not-a-puzzle': 'easy', 'copy-cat': 'impossible' },
        best: { 'spin-match': { hard: 6, easy: 99, medium: -1 }, nope: { easy: 3 } },
      }),
    );
    const p = new PuzzleProgress(storage);
    expect(p.level('spin-match')).toBe('hard');
    expect(p.level('copy-cat')).toBe('easy');
    expect([p.best('spin-match', 'hard'), p.best('spin-match', 'easy'), p.best('spin-match', 'medium')]).toEqual([
      6,
      null,
      null,
    ]);
  });

  it('keeps going in memory when storage refuses', () => {
    const broken: MinimalStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    };
    const p = new PuzzleProgress(broken);
    p.setLevel('symbol-hunt', 'medium');
    expect(p.recordRound('symbol-hunt', 'medium', 7).newBest).toBe(true);
    expect([p.level('symbol-hunt'), p.best('symbol-hunt', 'medium')]).toEqual(['medium', 7]);
  });
});
