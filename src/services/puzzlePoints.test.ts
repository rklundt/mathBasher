// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { config } from '@/core/config';
import { maxRoundScore } from '@/services/challengePoints';
import {
  PuzzleScore,
  levelSpeed,
  pairPalsMaxPoints,
  pairPalsPoints,
  puzzleAnswerWorth,
  puzzleRoundMax,
} from '@/services/puzzlePoints';

const ADD_TO_10 = (level: 'easy' | 'medium' | 'hard'): number =>
  maxRoundScore('add-to-10', levelSpeed(level), config.round.questionsPerRound);

describe('puzzle points (sprint 2.14)', () => {
  it('levels score like the math difficulties: Easy 1×, Medium 1.25×, Hard 1.5×', () => {
    expect(['easy', 'medium', 'hard'].map((l) => levelSpeed(l as 'easy'))).toEqual(['slow', 'medium', 'fast']);
    expect(puzzleAnswerWorth('easy')).toBe(75);
    expect(puzzleAnswerWorth('medium')).toBe(93.75);
    expect(puzzleAnswerWorth('hard')).toBe(112.5);
  });

  it('a perfect puzzle round is worth half an Add to 10 round at the same difficulty', () => {
    expect(ADD_TO_10('easy')).toBe(2400);
    for (const level of ['easy', 'medium', 'hard'] as const) {
      expect(puzzleRoundMax(level)).toBe(ADD_TO_10(level) / 2);
    }
  });

  it('a right answer: full, halved after a miss, plus the math speed bonus', () => {
    const s = new PuzzleScore('easy');
    expect(s.right(0, 0.9)).toEqual({ points: 75, tier: 0 }); // slow: no bonus
    expect(s.right(0, 0.1)).toEqual({ points: 112.5, tier: 3 }); // ⚡⚡⚡ +50 %
    expect(s.right(1, 0.9)).toEqual({ points: 37.5, tier: 0 }); // after a miss: half
    expect(s.points).toBe(75 + 112.5 + 37.5);
  });

  it('a played-out round with every answer fastest and green reaches the max', () => {
    const s = new PuzzleScore('hard');
    for (let i = 0; i < config.puzzles.perRound; i++) s.right(0, 0);
    s.finish(true);
    expect(s.points).toBe(puzzleRoundMax('hard'));
    const t = new PuzzleScore('easy');
    t.right(0, 1);
    expect(t.finish(false)).toEqual({ finish: 150, perfect: 0 });
  });

  it('Pair Pals: a whole Add to 10 round at most; full points up to one turn per card', () => {
    expect(pairPalsMaxPoints('hard')).toBe(ADD_TO_10('hard'));
    expect(pairPalsPoints('hard', 30, 15)).toBe(3600);
    expect(pairPalsPoints('hard', 30, 30)).toBe(3600);
    expect(pairPalsPoints('hard', 30, 32)).toBe(3600); // not a whole step yet
    expect(pairPalsPoints('hard', 30, 33)).toBe(3240); // 3 extra turns = 10 % off
    expect(pairPalsPoints('hard', 30, 36)).toBe(2880);
    expect(pairPalsPoints('hard', 30, 500)).toBe(0); // never below 0
  });

  it('Pair Pals: a step that would be a fraction of a turn rounds up, the player’s way', () => {
    // 12 cards: 10 % is 1.2 turns, so a step is 2 turns.
    expect(pairPalsPoints('easy', 12, 13)).toBe(2400);
    expect(pairPalsPoints('easy', 12, 14)).toBe(2160);
    // 20 cards: exactly 2 turns a step.
    expect(pairPalsPoints('medium', 20, 21)).toBe(3000);
    expect(pairPalsPoints('medium', 20, 22)).toBe(2700);
  });
});
