// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/test-utils/mulberry32';
import { pickRowAnswers, QuestionClock, resolveRetryEvent } from '@/game/systems/roundRules';

describe('QuestionClock', () => {
  it('expires exactly once per start, then stays quiet', () => {
    const c = new QuestionClock();
    c.start(1000);
    expect(c.tick(600)).toBe(false);
    expect(c.tick(600)).toBe(true);
    expect(c.remainingSec).toBe(0);
    // The extra frame after the last question's timeout: no second expiry.
    expect(c.tick(16)).toBe(false);
    expect(c.tick(5000)).toBe(false);
  });

  it('never expires after stop() (round over / question resolved)', () => {
    const c = new QuestionClock();
    c.start(100);
    c.stop();
    expect(c.tick(1000)).toBe(false);
  });

  it('restarts cleanly for the next question', () => {
    const c = new QuestionClock();
    c.start(50);
    expect(c.tick(50)).toBe(true);
    c.start(2000);
    expect(c.remainingSec).toBe(2);
    expect(c.tick(10)).toBe(false);
  });
});

describe('pickRowAnswers', () => {
  it('puts the right answer in exactly one slot, with no duplicates', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const count of [2, 3, 4]) {
        const row = pickRowAnswers({ choices: [3, 7, 5, 9], correctAnswer: 7 }, count, mulberry32(seed));
        expect(row).toHaveLength(count);
        expect(row.filter((p) => p.answer === 7)).toHaveLength(1);
        expect(new Set(row.map((p) => p.answer)).size).toBe(count);
      }
    }
  });

  it('labels fractions with their display strings', () => {
    const choices = [0.5, 0.25, 0.75, 1];
    const displays = ['1/2', '1/4', '3/4', '1'];
    const row = pickRowAnswers({ choices, correctAnswer: 0.25, choiceDisplays: displays }, 4, mulberry32(4));
    for (const p of row) expect(p.display).toBe(displays[choices.indexOf(p.answer)]);
  });

  it('adds extra wrong answers when there are more slots than choices (5 on Hard)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const row = pickRowAnswers({ choices: [12, 15, 18, 21], correctAnswer: 18 }, 5, mulberry32(seed));
      expect(row).toHaveLength(5);
      expect(row.filter((p) => p.answer === 18)).toHaveLength(1);
      expect(new Set(row.map((p) => p.answer)).size).toBe(5);
    }
  });
});

describe('resolveRetryEvent', () => {
  const state = (over: Partial<Parameters<typeof resolveRetryEvent>[0]> = {}) => ({
    correctAnswer: 56,
    livesUsed: 0,
    maxLives: 3,
    usedWrong: false,
    ...over,
  });

  it('right answer first time: correct, full points', () => {
    expect(resolveRetryEvent(state(), { type: 'pick', answer: 56 })).toEqual({
      kind: 'correct',
      record: { wasCorrect: true, usedWrongShot: false },
    });
  });

  it('right answer after a wrong pick or a time-out: half points', () => {
    expect(resolveRetryEvent(state({ usedWrong: true, livesUsed: 1 }), { type: 'pick', answer: 56 })).toEqual({
      kind: 'correct',
      record: { wasCorrect: true, usedWrongShot: true },
    });
  });

  it('wrong pick with lives left: a life spent, the question comes back', () => {
    expect(resolveRetryEvent(state(), { type: 'pick', answer: 48 })).toEqual({
      kind: 'wrong',
      livesUsed: 1,
      livesRemaining: 2,
      usedWrong: true,
    });
  });

  it('time-out with lives left: also costs a life', () => {
    expect(resolveRetryEvent(state({ livesUsed: 1 }), { type: 'timeout' })).toEqual({
      kind: 'timeout',
      livesUsed: 2,
      livesRemaining: 1,
      usedWrong: true,
    });
  });

  it('wrong pick on the last life: out of lives, caused by the wrong pick', () => {
    expect(resolveRetryEvent(state({ livesUsed: 2 }), { type: 'pick', answer: 48 })).toEqual({
      kind: 'out-of-lives',
      cause: 'wrong',
      livesUsed: 3,
      livesRemaining: 0,
      usedWrong: true,
      record: { wasCorrect: false, usedWrongShot: true },
    });
  });

  it('time-out on the last life: out of lives, caused by the time-out', () => {
    const d = resolveRetryEvent(state({ livesUsed: 2 }), { type: 'timeout' });
    expect(d.kind).toBe('out-of-lives');
    expect(d.kind === 'out-of-lives' && d.cause).toBe('timeout');
  });

  it('never spends more lives than there are', () => {
    const d = resolveRetryEvent(state({ maxLives: 1 }), { type: 'timeout' });
    expect(d.kind === 'out-of-lives' && d.livesUsed).toBe(1);
  });

  it('between questions nothing counts as right', () => {
    expect(resolveRetryEvent(state({ correctAnswer: null }), { type: 'pick', answer: 56 }).kind).toBe('wrong');
  });
});
