// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { InMemoryStorage, type MinimalStorage } from '@/services/storage';
import { PAIR_PALS_STORAGE_KEY, PairPalsProgress } from '@/services/PairPalsProgress';

describe('PairPalsProgress (sprint 2.13)', () => {
  it('starts on Cute Animals, Easy, with no bests', () => {
    const p = new PairPalsProgress(new InMemoryStorage());
    expect(p.theme).toBe('animals');
    expect(p.size).toBe('easy');
    expect(p.best('easy')).toBeNull();
  });

  it('remembers the picks and the bests across a reload', () => {
    const storage = new InMemoryStorage();
    const a = new PairPalsProgress(storage);
    a.choose('dragons', 'hard');
    a.recordWin('hard', 30);
    const b = new PairPalsProgress(storage);
    expect(b.theme).toBe('dragons');
    expect(b.size).toBe('hard');
    expect(b.best('hard')).toBe(30);
    expect(b.best('easy')).toBeNull();
  });

  it('a best only goes down; the first win is a new best', () => {
    const p = new PairPalsProgress(new InMemoryStorage());
    expect(p.recordWin('easy', 12)).toEqual({ turns: 12, previousBest: null, newBest: true });
    expect(p.recordWin('easy', 14)).toEqual({ turns: 14, previousBest: 12, newBest: false });
    expect(p.best('easy')).toBe(12);
    expect(p.recordWin('easy', 9)).toEqual({ turns: 9, previousBest: 12, newBest: true });
    expect(p.recordWin('easy', 9).newBest).toBe(false); // a tie isn't a new best
    expect(p.best('easy')).toBe(9);
  });

  it('bests are kept per size', () => {
    const p = new PairPalsProgress(new InMemoryStorage());
    p.recordWin('easy', 8);
    p.recordWin('medium', 20);
    expect([p.best('easy'), p.best('medium'), p.best('hard')]).toEqual([8, 20, null]);
  });

  it('starts fresh from a corrupt or foreign entry, and cleans odd values', () => {
    const storage = new InMemoryStorage();
    storage.setItem(PAIR_PALS_STORAGE_KEY, '{not json');
    expect(new PairPalsProgress(storage).theme).toBe('animals');
    storage.setItem(PAIR_PALS_STORAGE_KEY, JSON.stringify({ v: 2, theme: 'aliens' }));
    expect(new PairPalsProgress(storage).theme).toBe('animals');
    storage.setItem(
      PAIR_PALS_STORAGE_KEY,
      JSON.stringify({ v: 1, theme: 'robots', size: 'giant', best: { easy: 7, medium: -3, hard: 2.5, huge: 4 } }),
    );
    const p = new PairPalsProgress(storage);
    expect([p.theme, p.size]).toEqual(['animals', 'easy']);
    expect([p.best('easy'), p.best('medium'), p.best('hard')]).toEqual([7, null, null]);
  });

  it('keeps going in memory when storage refuses (private mode, full)', () => {
    const broken: MinimalStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    };
    const p = new PairPalsProgress(broken);
    p.choose('desserts', 'medium');
    expect(p.recordWin('medium', 15).newBest).toBe(true);
    expect([p.theme, p.size, p.best('medium')]).toEqual(['desserts', 'medium', 15]);
  });
});
