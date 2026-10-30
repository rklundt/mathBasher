// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { SceneKeys, puzzleSetupSceneKeyFor } from '@/core/sceneKeys';
import { isMathGameId, type GameId } from '@/core/gameIds';
import { gamesStepFor, type ChooserStep } from '@/core/chooserSteps';
import { _th, SeverityLevel } from '@/core/telemetry';
import { Settings } from '@/services/Settings';

/** Sprint 2.15 — what the Game Chooser opens on (`init` data). */
export interface GameChooserInit {
  /** The step to show; left out, the subjects. */
  step?: ChooserStep;
}

/** Sprint 2.15 — My Scores' Back returns to the screen it was opened from. */
export interface MyScoresInit {
  back: { key: string; data?: object };
}

/** Open the Game Chooser on a step (the Title Screen's Play: the subjects). */
export function openChooser(scene: Phaser.Scene, step?: ChooserStep): void {
  const init: GameChooserInit = step === undefined ? {} : { step };
  scene.scene.start(SceneKeys.GameChooser, init);
}

/** Change Game (pause or end of round): the games list this game is on. */
export function openGamesFor(scene: Phaser.Scene, game: GameId): void {
  openChooser(scene, gamesStepFor(game));
}

/** My Scores, coming back to this scene (with this data) on Back. */
export function openMyScores(scene: Phaser.Scene, backData?: object): void {
  const init: MyScoresInit = { back: { key: scene.scene.key, ...(backData !== undefined && { data: backData }) } };
  scene.scene.start(SceneKeys.MyScores, init);
}

/**
 * A game picked on the chooser: its setup screen. A math game's setup comes
 * first (Loading follows Start); a puzzle's setup shows the puzzle's own
 * pictures, so it's reached through Loading (once cached, Loading passes
 * straight through).
 */
export function openSetup(scene: Phaser.Scene, game: GameId): void {
  Settings.setGameId(game);
  _th.logToAi('GamePicked', SeverityLevel.Information, { gameId: game });
  if (isMathGameId(game)) {
    scene.scene.start(SceneKeys.MathSetup);
    return;
  }
  scene.scene.start(SceneKeys.Loading, { targetSceneKey: puzzleSetupSceneKeyFor(game), gameId: game });
}
