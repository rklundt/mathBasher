// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import type { MathId, SpeedKey } from '@/core/config';
import { Settings } from '@/services/Settings';
import type { MathGameId } from '@/core/gameIds';
import { SessionTotalScore } from '@/services/SessionTotalScore';
import { getMyScores } from '@/services/MyScores';
import { roundBonuses } from '@/services/ScoreCalculator';
import { GAME_MIDGROUND_MAP, GAME_MUSIC_MAP } from '@/core/audioKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { setupScene } from '@/game/scenes/sceneSetup';
import type { QuitDestination } from '@/game/scenes/gameSceneContract';
import type { HudSceneInit } from '@/game/scenes/gameSceneContract';
import type { RoundController } from '@/game/services/RoundController';
import type { GameOverData } from '@/game/scenes/GameOverScene';

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
  readonly gameId: MathGameId;
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
  /**
   * Sprint 2.9.2 — set once the round is scored (Game Over or a quit), so a
   * second `endRound` / `quitToMenu` (a double tap, a timer firing in the
   * same frame) can't count it twice: My Scores saves it for good.
   */
  private settled = false;
  /** Sprint 2.10 — the game has started its end (an "Out of lives!" banner, a fall). */
  private ending = false;

  constructor(private readonly opts: GameSceneLifecycleOpts) {}

  /**
   * Sprint 2.9.2 — count the round's points once: the "This visit" total and
   * My Scores (finished = it reached Game Over). Returns false when the round
   * was already counted.
   */
  private settle(finished: boolean, points: number): boolean {
    if (this.settled) return false;
    this.settled = true;
    const { mathId, roundController } = this.opts;
    SessionTotalScore.add(points);
    // A round left before the first answer (browsing games) isn't a round.
    if (finished || roundController.questionIndex > 0 || points > 0) {
      getMyScores().record(mathId, points, finished);
    }
    return true;
  }

  /**
   * Sprint 2.10 — a game calls this when it starts a delayed end that isn't
   * the last answer (the "Out of lives!" banner, Space Escape's fall or
   * "Out of time!"), so pause can't open over it.
   */
  beginRoundEnd(): void {
    this.ending = true;
  }

  /**
   * Sprint 2.10 — the round is over or about to be (the last answer is in,
   * or the game started its end): HudScene won't open pause. Pausing there
   * didn't stop the end anyway (some games' timers run on), and quitting
   * would count a finished round as ended early and lose its bonus.
   */
  get isRoundEnding(): boolean {
    return this.settled || this.ending || this.opts.roundController.lastAnswerIn;
  }

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
    for (const key of GAME_MIDGROUND_MAP[gameId]) audio.playLoop(key, 'midground');
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
    for (const key of GAME_MIDGROUND_MAP[gameId]) audio.stopLoop(key);
    if (scene.scene.isActive(SceneKeys.Hud)) scene.scene.stop(SceneKeys.Hud);
    if (scene.scene.isActive(SceneKeys.PauseOverlay)) scene.scene.stop(SceneKeys.PauseOverlay);
    if (scene.scene.isActive(SceneKeys.Settings)) scene.scene.stop(SceneKeys.Settings);
  }

  /**
   * Called from the scene's `endRound()`. Contributes this round's
   * score to the session total and My Scores (as finished), fires
   * `RoundEnded` telemetry, stops HUD, transitions to GameOver.
   * Quit-to-menu mid-round does NOT route through here — `quitToMenu()`
   * instead. A second call (the round is already scored) does nothing.
   *
   * Sprint 2.1.9 default: uses `roundController.passed` + `.stars`
   * (correct-count-based). Sprint 2.2 adds optional overrides for
   * Number Climb which computes stars by HEIGHT REACHED + passed
   * by REACHED THE TOP. Other modes ignore the overrides and use
   * the defaults.
   */
  endRound(overrides?: { passedOverride?: boolean; starsOverride?: 0 | 1 | 2 | 3 }): void {
    const { scene, gameId, mathId, speed, roundController } = this.opts;
    // Sprint 2.10 — a round that reached its end (every game advances to the
    // last question only by answering it; lives and timers end it sooner)
    // earns the Finish Bonus, and the Perfect Round bonus if every question
    // was right first try.
    const bonus = roundBonuses(mathId, speed, roundController.isRoundOver, roundController.isPerfect);
    const total = roundController.score + bonus.finish + bonus.perfect;
    // Sprint 2.1.5 invariant — contribute BEFORE GameOver transition.
    if (!this.settle(true, total)) return;

    const finalPassed = overrides?.passedOverride ?? roundController.passed;
    const finalStars = overrides?.starsOverride ?? roundController.stars;

    const props: TelemetryProps = {
      gameId,
      mathId,
      speed,
      roundScore: String(total),
      roundCorrectCount: String(roundController.correctCount),
      passed: String(finalPassed),
      finishBonus: String(bonus.finish),
      perfectBonus: String(bonus.perfect),
      speedBonus: String(Math.round(roundController.speedBonus)),
    };
    _th.logToAi('RoundEnded', SeverityLevel.Information, props);

    scene.scene.stop(SceneKeys.Hud);
    const gameOver: GameOverData = {
      score: total,
      finishBonus: bonus.finish,
      perfectBonus: bonus.perfect,
      // Whole points, so Game Over's subtotal and "+N" add up on screen.
      speedBonus: Math.round(roundController.speedBonus),
      correctCount: roundController.correctCount,
      passed: finalPassed,
      stars: finalStars,
      mathId,
      speed,
      gameId,
      // Sprint 2.2 — Climb overrides this to 10; other modes pass 20
      // (the default from config.round.questionsPerRound). Drives the
      // "Correct: N / total" denominator on GameOver.
      totalQuestions: roundController.questionsPerRound,
    };
    scene.scene.start(SceneKeys.GameOver, gameOver);
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
   * telemetry, resumes tweens (so the next scene doesn't inherit
   * paused tweens — they'd freeze its animations), starts Menu or, for
   * the pause menu's "Change Game" (sprint 2.6.5), Game Select.
   *
   * Sprint 2.9.2 — the points earned so far now count: they go to the
   * "This visit" total and to My Scores as a round that ended early (if
   * the child answered at least once). The high-score store still ignores
   * unfinished rounds. A call after the round is scored does nothing.
   */
  quitToMenu(destination: QuitDestination = 'menu'): void {
    const { scene, gameId, mathId, speed, roundController } = this.opts;
    if (!this.settle(false, roundController.score)) return;
    // Sprint 2.9 — 'difficulty': the pause card's Change challenge (a new
    // challenge is already set; this game's Difficulty shows it) and, since
    // 2.13, its Change Difficulty.
    const target =
      destination === 'game-select'
        ? SceneKeys.GameSelect
        : destination === 'difficulty'
          ? SceneKeys.Difficulty
          : SceneKeys.Menu;
    _th.logToAi('RoundAbandoned', SeverityLevel.Information, {
      gameId,
      mathId,
      speed,
      questionsCompleted: String(roundController.questionIndex),
      // Where the player went: the menu, Game Select (pause → Change Game) or
      // Difficulty (pause → a new challenge).
      sceneKey: target,
    });
    scene.tweens.resumeAll();
    scene.scene.start(target);
  }
}
