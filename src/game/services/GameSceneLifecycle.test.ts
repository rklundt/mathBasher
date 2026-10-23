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
import '@/math/registry';

/**
 * Sprint 2.9.2 — how a round is counted: once, at Game Over (finished) or
 * when the child leaves mid-round (ended early), in both the "This visit"
 * total and My Scores. The scene is a stub: only the calls endRound and
 * quitToMenu make.
 */
function fakeScene(): { scene: Phaser.Scene; started: string[] } {
  const started: string[] = [];
  const scene = {
    scene: {
      key: SceneKeys.Game,
      start: (key: string) => started.push(key),
      stop: () => undefined,
      isActive: () => false,
    },
    tweens: { resumeAll: () => undefined },
  } as unknown as Phaser.Scene;
  return { scene, started };
}

/** A round with `n` right answers. */
function playedRound(n: number): RoundController {
  const rc = new RoundController('add-to-10', 'medium');
  for (let i = 0; i < n; i++) {
    rc.drawNextQuestion();
    rc.recordOutcome({ wasCorrect: true, usedWrongShot: false });
    rc.advanceQuestionIndex();
  }
  return rc;
}

function lifecycleFor(rc: RoundController): { lc: GameSceneLifecycle; started: string[] } {
  const { scene, started } = fakeScene();
  const lc = new GameSceneLifecycle({
    scene,
    gameId: 'alien-shoot',
    mathId: 'add-to-10',
    speed: 'medium',
    roundController: rc,
  });
  return { lc, started };
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
});
