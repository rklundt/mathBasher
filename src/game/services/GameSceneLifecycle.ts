// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import type { MathId, SpeedKey } from '@/core/config';
import { Settings, type GameId } from '@/services/Settings';
import { SessionTotalScore } from '@/services/SessionTotalScore';
import { GAME_MIDGROUND_MAP, GAME_MUSIC_MAP } from '@/core/audioKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { setupScene } from '@/game/scenes/sceneSetup';
import type { HudSceneInit } from '@/game/scenes/gameSceneContract';
import type { RoundController } from '@/game/services/RoundController';

/**
 * Sprint 2.1.9 — game-mode-AGNOSTIC scene lifecycle helper. Extracted
 * from `GameScene` + `AsteroidFieldScene`, which shared ~150 lines of
 * near-identical boilerplate: telemetry events, audio loop start/stop,
 * HUD launch, pause/resume hooks, endRound → SessionTotalScore add →
 * GameOver transition, defensive `Settings.setGameId` invariant.
 *
 * Composition (not inheritance). Scene-specific bits (wave system,
 * input system, projectile, hero) stay in the scene; the lifecycle
 * helper handles the cross-cutting concerns that are identical
 * across game modes.
 *
 * Pairs with `RoundController` (sprint 2.1) which extracted the
 * question-loop bookkeeping. Together they cover the "every game
 * mode needs this" surface; what's left in each scene is genuinely
 * mode-specific.
 *
 * Adding the third game mode (2.2 Number Climb) consumes this helper
 * with the same construction call shape — no copy-paste of
 * lifecycle plumbing.
 *
 * ## Call site pattern
 *
 * Inside the game scene's `create()`:
 *
 * ```ts
 * // ... set up mathId / speed / roundController / subsystems first
 * this.lifecycle = new GameSceneLifecycle(this, {
 *   gameId: this.gameId,
 *   mathId: this.mathId,
 *   speed: this.speed,
 *   roundController: this.roundController,
 * });
 * this.lifecycle.enter();
 * this.events.once('shutdown', () => this.lifecycle.exit());
 * ```
 *
 * Inside `endRound()`:
 *
 * ```ts
 * this.lifecycle.endRound();
 * ```
 *
 * Inside `pause()` / `resume()` / `quitToMenu()` — call AFTER the
 * scene's own subsystem pause/resume (waveSystem.pause, etc) so the
 * lifecycle's telemetry reflects "we paused everything":
 *
 * ```ts
 * pause(): void {
 *   if (this.paused) return;
 *   this.paused = true;
 *   this.waveSystem?.pause();        // subsystem
 *   this.inputSystem?.setPaused(true); // subsystem
 *   this.lifecycle.pause();          // cross-cutting
 * }
 * ```
 */
export interface GameSceneLifecycleOpts {
  /** The scene being managed (used for scene.scene.X calls + telemetry binding). */
  readonly scene: Phaser.Scene;
  /** Which game mode this scene represents. Used in `Settings.setGameId` + every telemetry props object. */
  readonly gameId: GameId;
  /** Selected math type for this round. Forwarded to telemetry + GameOver scene init. */
  readonly mathId: MathId;
  /** Selected speed for this round. Forwarded to telemetry + GameOver scene init. */
  readonly speed: SpeedKey;
  /**
   * Round controller for this scene's round. The helper reads
   * `roundController.score` / `.correctCount` / `.passed` / `.stars` /
   * `.questionIndex` for endRound + pause/resume telemetry. The scene
   * still drives the controller; the helper only reads.
   */
  readonly roundController: RoundController;
}

export class GameSceneLifecycle {
  constructor(private readonly opts: GameSceneLifecycleOpts) {}

  /**
   * Called from `scene.create()` after subsystems are ready. Handles:
   *  - Defensive `Settings.setGameId(this.gameId)` invariant (closes
   *    the gap if a future entry path bypassed GameSelectScene).
   *  - `setupScene` lifecycle telemetry (Started/Completed pair).
   *  - `RoundStarted` domain event.
   *  - HudScene launch (parallel scene, guarded against double-launch).
   *  - Music + midground audio loop start (per `GAME_MUSIC_MAP[gameId]` +
   *    `MidgroundKeys.Skittering1`).
   */
  enter(): void {
    const { scene, gameId, mathId, speed } = this.opts;
    // Defensive: assert the gameId matches the active scene. Normally
    // GameSelectScene's tile click already sets this; the redundant
    // set here closes the gap if a future entry path (Play Again,
    // deep link, HMR-survived state) forgets to update Settings.
    // Without this, downstream code branching on
    // `Settings.round.gameId` (e.g. SettingsScene's Game-tab
    // visibility) could miss-render based on stale state.
    Settings.setGameId(gameId);

    const props: TelemetryProps = { gameId, mathId, speed };
    setupScene(scene, props);
    _th.logToAi('RoundStarted', SeverityLevel.Information, props);

    // HudScene as a parallel scene. Pass our scene key so HudScene
    // knows which game scene to bind events on (sprint 2.1 plumbing).
    if (!scene.scene.isActive(SceneKeys.Hud)) {
      const hudInit: HudSceneInit = { gameSceneKey: scene.scene.key };
      scene.scene.launch(SceneKeys.Hud, hudInit);
    }

    // Audio loops. Music + midground both per-game (sprint 2.1.9
    // story 6 lifted midground from a hard-coded Skittering1 to
    // GAME_MIDGROUND_MAP[gameId] so Asteroid Field gets its own
    // ambient space-noises loop instead of the Alien-Shoot-hero
    // skittering loop).
    const audio = getAudioManager();
    audio.playLoop(GAME_MUSIC_MAP[gameId], 'music');
    audio.playLoop(GAME_MIDGROUND_MAP[gameId], 'midground');
  }

  /**
   * Called from the scene's shutdown handler. Stops audio loops +
   * tears down parallel scenes (HUD, PauseOverlay, Settings if any
   * are still active). Idempotent — safe to call more than once.
   */
  exit(): void {
    const { scene, gameId } = this.opts;
    const audio = getAudioManager();
    audio.stopLoop(GAME_MUSIC_MAP[gameId]);
    audio.stopLoop(GAME_MIDGROUND_MAP[gameId]);
    if (scene.scene.isActive(SceneKeys.Hud)) scene.scene.stop(SceneKeys.Hud);
    if (scene.scene.isActive(SceneKeys.PauseOverlay)) scene.scene.stop(SceneKeys.PauseOverlay);
    if (scene.scene.isActive(SceneKeys.Settings)) scene.scene.stop(SceneKeys.Settings);
  }

  /**
   * Called from the scene's `endRound()`. Contributes this round's
   * score to the session total, fires `RoundEnded` telemetry, stops
   * HUD, transitions to GameOver. Quit-to-menu mid-round explicitly
   * does NOT route through here — `quitToMenu()` instead.
   */
  endRound(): void {
    const { scene, gameId, mathId, speed, roundController } = this.opts;
    // Sprint 2.1.5 invariant — contribute BEFORE GameOver transition.
    SessionTotalScore.add(roundController.score);

    const props: TelemetryProps = {
      gameId,
      mathId,
      speed,
      roundScore: String(roundController.score),
      roundCorrectCount: String(roundController.correctCount),
      passed: String(roundController.passed),
    };
    _th.logToAi('RoundEnded', SeverityLevel.Information, props);

    scene.scene.stop(SceneKeys.Hud);
    scene.scene.start(SceneKeys.GameOver, {
      score: roundController.score,
      correctCount: roundController.correctCount,
      passed: roundController.passed,
      stars: roundController.stars,
      mathId,
      speed,
      gameId,
    });
  }

  /**
   * Game-mode-agnostic pause work: pause tweens, pause audio loops,
   * pause HUD, fire GamePaused telemetry. Call AFTER the scene's
   * subsystem pause (waveSystem.pause, inputSystem.setPaused, etc.)
   * so the telemetry-fires-at-the-end timing reads as "fully paused."
   */
  pause(): void {
    const { scene, gameId, mathId, speed, roundController } = this.opts;
    scene.tweens.pauseAll();
    getAudioManager().pauseAllLoops();
    if (scene.scene.isActive(SceneKeys.Hud)) scene.scene.pause(SceneKeys.Hud);
    _th.logToAi('GamePaused', SeverityLevel.Information, {
      gameId,
      mathId,
      speed,
      questionIndex: String(roundController.questionIndex),
    });
  }

  /**
   * Inverse of `pause()`. Call AFTER the scene's subsystem resume.
   */
  resume(): void {
    const { scene, gameId, mathId, speed, roundController } = this.opts;
    getAudioManager().resumeAllLoops();
    scene.tweens.resumeAll();
    if (scene.scene.isPaused(SceneKeys.Hud)) scene.scene.resume(SceneKeys.Hud);
    _th.logToAi('GameResumed', SeverityLevel.Information, {
      gameId,
      mathId,
      speed,
      questionIndex: String(roundController.questionIndex),
    });
  }

  /**
   * Called from the scene's `quitToMenu()`. Fires `RoundAbandoned`
   * telemetry, resumes tweens (so the Menu scene doesn't inherit
   * paused tweens — they'd freeze the Menu's animations), starts
   * Menu. Does NOT call `SessionTotalScore.add` — partial-round
   * abandonment doesn't earn points per the existing convention
   * (mirrors the score-store's policy on incomplete rounds).
   */
  quitToMenu(): void {
    const { scene, gameId, mathId, speed, roundController } = this.opts;
    _th.logToAi('RoundAbandoned', SeverityLevel.Information, {
      gameId,
      mathId,
      speed,
      questionsCompleted: String(roundController.questionIndex),
    });
    scene.tweens.resumeAll();
    scene.scene.start(SceneKeys.Menu);
  }
}
