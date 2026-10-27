// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { InMemoryStorage, type MinimalStorage } from '@/services/storage';
import { PUZZLE_PROGRESS_STORAGE_KEY, PuzzleProgress, starsFor } from '@/services/PuzzleProgress';

describe('PuzzleProgress (sprint 2.14)', () => {
  it('stars: all 8 green ★★★, 6–7 ★★, fewer ★', () => {
    expect([8, 7, 6, 5, 0].map(starsFor)).toEqual([3, 2, 2, 1, 1]);
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
