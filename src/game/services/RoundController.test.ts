// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { RoundController } from '@/game/services/RoundController';
import { config } from '@/core/config';
// Side-effect import so the mixed generator's delegate picker is wired up
// (RoundController might draw a mixed question depending on the test math
// type; without this, `mixed.generate()` throws because setMixedDelegate
// was never called).
import '@/math/registry';

describe('RoundController', () => {
  describe('drawNextQuestion', () => {
    it('returns a Question while inside the round, then null when complete', () => {
      const rc = new RoundController('add-to-10', 'medium');
      const drawn: unknown[] = [];
      while (true) {
        const q = rc.drawNextQuestion();
        if (q === null) break;
        drawn.push(q);
        // Caller advances the index after recording an outcome — simulate
        // by recording a no-op outcome + advancing immediately.
        rc.recordOutcome({ wasCorrect: false, usedWrongShot: false });
        rc.advanceQuestionIndex();
      }
      expect(drawn).toHaveLength(config.round.questionsPerRound);
    });

    it('respects the anti-repeat sliding window (sprint 1.1 invariant preserved)', () => {
      // With historyLimit=4 (the default), no prompt should repeat within
      // 5 consecutive draws.
      const rc = new RoundController('add-to-10', 'medium');
      const prompts: string[] = [];
      for (let i = 0; i < 20; i++) {
        const q = rc.drawNextQuestion();
        if (q === null) break;
        prompts.push(q.prompt);
        rc.recordOutcome({ wasCorrect: false, usedWrongShot: false });
        rc.advanceQuestionIndex();
      }
      const limit = config.round.recentPromptHistoryLimit;
      for (let i = 1; i < prompts.length; i++) {
        for (let back = 1; back <= limit && i - back >= 0; back++) {
          expect(
            prompts[i] === prompts[i - back],
            `q${i} "${prompts[i]}" matches q${i - back} (within historyLimit=${limit})`,
          ).toBe(false);
        }
      }
    });
  });

  describe('recordOutcome', () => {
    it('returns scoreDelta = newScore - oldScore on correct', () => {
      const rc = new RoundController('add-to-10', 'medium');
      const before = rc.score;
      const result = rc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
      expect(result.scoreDelta).toBeGreaterThan(0);
      expect(result.newScore).toBe(before + result.scoreDelta);
      expect(rc.score).toBe(result.newScore);
    });

    it('scoreDelta is 0 on wrong (timeout)', () => {
      const rc = new RoundController('add-to-10', 'medium');
      const result = rc.recordOutcome({ wasCorrect: false, usedWrongShot: false });
      expect(result.scoreDelta).toBe(0);
    });

    it('correctCount tracks the number of correct outcomes', () => {
      const rc = new RoundController('add-to-10', 'medium');
      rc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
      rc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
      rc.recordOutcome({ wasCorrect: false, usedWrongShot: false });
      expect(rc.correctCount).toBe(2);
    });

    it('respects the after-wrong-shot multiplier (correct after a miss = half points)', () => {
      const rc = new RoundController('add-to-10', 'medium');
      const cleanResult = rc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
      const wrongShotResult = rc.recordOutcome({ wasCorrect: true, usedWrongShot: true });
      expect(wrongShotResult.scoreDelta).toBe(
        cleanResult.scoreDelta * config.scoring.afterWrongShotMultiplier,
      );
    });
  });

  describe('round-state views', () => {
    it('starts at questionIndex=0, score=0, correctCount=0, !passed, 0 stars', () => {
      const rc = new RoundController('add-to-10', 'medium');
      expect(rc.questionIndex).toBe(0);
      expect(rc.score).toBe(0);
      expect(rc.correctCount).toBe(0);
      expect(rc.passed).toBe(false);
      expect(rc.stars).toBe(0);
      expect(rc.isRoundOver).toBe(false);
    });

    it('isRoundOver becomes true after questionsPerRound advances', () => {
      const rc = new RoundController('add-to-10', 'medium');
      for (let i = 0; i < config.round.questionsPerRound; i++) {
        expect(rc.isRoundOver).toBe(false);
        rc.advanceQuestionIndex();
      }
      expect(rc.isRoundOver).toBe(true);
    });

    it('passed becomes true after enough correct outcomes', () => {
      const rc = new RoundController('add-to-10', 'medium');
      for (let i = 0; i < config.round.passingCorrect; i++) {
        rc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
      }
      expect(rc.passed).toBe(true);
    });
  });
});
