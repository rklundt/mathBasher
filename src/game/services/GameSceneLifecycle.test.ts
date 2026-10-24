// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { beforeEach, describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { GameSceneLifecycle } from '@/game/services/GameSceneLifecycle';
import { RoundController } from '@/game/services/RoundController';
import { SessionTotalScore } from '@/services/SessionTotalScore';
import { getMyScores } from '@/services/MyScores';
import { SceneKeys } from '@/core/sceneKeys';
import { config } from '@/core/config';
import { finishBonus, perfectBonus } from '@/services/ScoreCalculator';
import type { GameOverData } from '@/game/scenes/GameOverScene';
import '@/math/registry';

/**
 * Sprint 2.9.2 — how a round is counted: once, at Game Over (finished) or
 * when the child leaves mid-round (ended early), in both the "This visit"
 * total and My Scores. The scene is a stub: only the calls endRound and
 * quitToMenu make.
 */
function fakeScene(): { scene: Phaser.Scene; started: string[]; data: unknown[] } {
  const started: string[] = [];
  const data: unknown[] = [];
  const scene = {
    scene: {
      key: SceneKeys.Game,
      start: (key: string, d?: unknown) => {
        started.push(key);
        data.push(d);
      },
      stop: () => undefined,
      isActive: () => false,
    },
    tweens: { resumeAll: () => undefined },
  } as unknown as Phaser.Scene;
  return { scene, started, data };
}

/** A round with `n` answers, right unless listed in `misses` (a miss first, then right). */
function playedRound(n: number, misses: number[] = []): RoundController {
  const rc = new RoundController('add-to-10', 'medium');
  for (let i = 0; i < n; i++) {
    rc.drawNextQuestion();
    rc.recordOutcome({ wasCorrect: true, usedWrongShot: misses.includes(i) });
    rc.advanceQuestionIndex();
  }
  return rc;
}

function lifecycleFor(rc: RoundController): { lc: GameSceneLifecycle; started: string[]; data: unknown[] } {
  const { scene, started, data } = fakeScene();
  const lc = new GameSceneLifecycle({
    scene,
    gameId: 'alien-shoot',
    mathId: 'add-to-10',
    speed: 'medium',
    roundController: rc,
  });
  return { lc, started, data };
}

describe('GameSceneLifecycle round counting', () => {
  let before: { points: number; finished: number; unfinished: number };

  const addTo10 = (): { points: number; finished: number; unfinished: number } =>
    getMyScores()
      .today()
      .subjects.flatMap((s) => s.challenges)
      .find((c) => c.id === 'add-to-10')?.tally ?? { points: 0, finished: 0, unfinished: 0 };

  beforeEach(() => {
    SessionTotalScore.reset();
    before = addTo10();
  });

  it('Game Over counts the round once, as finished', () => {
    const rc = playedRound(3);
    const { lc, started } = lifecycleFor(rc);
    lc.endRound();
    lc.endRound();
    lc.quitToMenu();
    expect(started).toEqual([SceneKeys.GameOver]);
    expect(SessionTotalScore.get()).toBe(rc.score);
    expect(addTo10()).toEqual({
      points: before.points + rc.score,
      finished: before.finished + 1,
      unfinished: before.unfinished,
    });
  });

  it('leaving mid-round counts the points so far, as ended early', () => {
    const rc = playedRound(2);
    const { lc, started } = lifecycleFor(rc);
    lc.quitToMenu('game-select');
    lc.quitToMenu('menu');
    expect(started).toEqual([SceneKeys.GameSelect]);
    expect(rc.score).toBeGreaterThan(0);
    expect(SessionTotalScore.get()).toBe(rc.score);
    expect(addTo10()).toEqual({
      points: before.points + rc.score,
      finished: before.finished,
      unfinished: before.unfinished + 1,
    });
  });

  it('leaving before the first answer is not a round', () => {
    const { lc, started } = lifecycleFor(playedRound(0));
    lc.quitToMenu();
    expect(started).toEqual([SceneKeys.Menu]);
    expect(addTo10()).toEqual(before);
  });

  describe('round-end bonuses (sprint 2.10)', () => {
    const questions = config.round.questionsPerRound;
    const finish = finishBonus('add-to-10', 'medium');
    const perfect = perfectBonus('add-to-10', 'medium');

    it('a perfect round earns both bonuses, everywhere the score goes', () => {
      const rc = playedRound(questions);
      const { lc, data } = lifecycleFor(rc);
      lc.endRound();
      const over = data[0] as GameOverData;
      expect(over).toMatchObject({ finishBonus: finish, perfectBonus: perfect, score: rc.score + finish + perfect });
      expect(SessionTotalScore.get()).toBe(rc.score + finish + perfect);
      expect(addTo10().points).toBe(before.points + rc.score + finish + perfect);
    });

    it('a miss on the way still earns the Finish Bonus, not Perfect Round', () => {
      const rc = playedRound(questions, [5]);
      const { lc, data } = lifecycleFor(rc);
      lc.endRound();
      expect(data[0]).toMatchObject({ finishBonus: finish, perfectBonus: 0, score: rc.score + finish });
    });

    it('a round cut short (out of lives) earns neither', () => {
      const rc = playedRound(7);
      const { lc, data } = lifecycleFor(rc);
      lc.endRound();
      expect(data[0]).toMatchObject({ finishBonus: 0, perfectBonus: 0, score: rc.score });
    });

    it('pause is refused once the last answer is in or the game has started its end', () => {
      const almost = lifecycleFor(playedRound(questions - 1)).lc;
      expect(almost.isRoundEnding).toBe(false);
      almost.beginRoundEnd();
      expect(almost.isRoundEnding).toBe(true);
      expect(lifecycleFor(playedRound(questions)).lc.isRoundEnding).toBe(true);
    });
  });
});
