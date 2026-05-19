// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { RoundController } from '@/game/services/RoundController';
import type { GameSceneContract } from '@/game/scenes/gameSceneContract';
import type { Question } from '@/math/types';
import { GameSceneLifecycle } from '@/game/services/GameSceneLifecycle';
import { text } from '@/game/ui/typography';

/**
 * Number Climb — sprint 2.2 third game mode. Vertical climb across 10
 * floors; the kid picks the rung carrying the correct answer to a
 * math prompt at each floor.
 *
 * Mode-specific gameplay (full implementation in stories 6-10):
 *  - **Floor system** (story 7) — owns the per-floor rung lifecycle.
 *    Difficulty controls rung count (Easy 2 / Medium 3 / Hard 4).
 *  - **Hero** (story 6) — climbs by jumping to picked rungs. Wrong-rung
 *    mulligan falls back to the floor's base; second wrong on same
 *    floor ends the round.
 *  - **Input** (story 8) — tap/click rung OR press 1-N keys. Tap-commit;
 *    no positioning/movement.
 *  - **Cumulative timer** (story 9) — Slow 250s / Medium 180s / Fast
 *    120s for the full climb. Wrong rung subtracts 3s. Timer to 0
 *    ends the round.
 *  - **Stars by height** (story 9) — 1★ = floor 4+, 2★ = 7+, 3★ = top.
 *
 * Sprint 2.2 story 4 — THIS COMMIT lands the skeleton:
 *   - GameSceneContract compliance
 *   - GameSceneLifecycle wiring (enter/exit/pause/resume/quitToMenu/endRound)
 *   - RoundController construction with 10-floor override (story 10)
 *   - Placeholder rendering: a "Number Climb (coming soon)" splash so
 *     the scene mounts cleanly. Real gameplay rendering arrives via
 *     the subsystem stories.
 */
export class NumberClimbScene extends Phaser.Scene implements GameSceneContract {
  static readonly key = SceneKeys.NumberClimb;
  /**
   * Game-mode identifier — read by `Settings.setGameId` defensive
   * assertion + every telemetry props object. `as const` so the
   * literal type narrows correctly through `GameSceneLifecycleOpts`.
   */
  private readonly gameId = 'number-climb' as const;

  // Configured at create()
  private mathId!: MathId;
  private speed!: SpeedKey;
  private roundController!: RoundController;
  private lifecycle!: GameSceneLifecycle;

  private currentQuestion: Question | null = null;
  private transitioning = false;
  private paused = false;

  /**
   * Total floors per round. Number Climb runs SHORTER rounds (10) than
   * Alien Shoot / Asteroid Field (20) — the one-strike-on-second-wrong
   * mechanic is harsh enough that 20 floors would feel punishing.
   * Story 10 lifts this into `config.numberClimb.questionsPerRound` and
   * threads it through RoundController as an override.
   */
  private readonly totalFloors = 10;
  // `floorReached: number` — declared by story 9 when the floor-system
  // wiring exists. Story 4 skeleton has no place to read or update it.

  constructor() {
    super(NumberClimbScene.key);
  }

  // ----- GameSceneContract -------------------------------------------------

  getCurrentQuestionPayload(): { question: Question; index: number; total: number } | null {
    if (!this.currentQuestion) return null;
    return {
      question: this.currentQuestion,
      index: this.roundController.questionIndex,
      total: this.totalFloors,
    };
  }

  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Cumulative timer hook for the HUD's countdown text. Story 9 wires
   * the real cumulative-timer-remaining read here. For story 4
   * (skeleton), returns undefined so HUD treats the mode as
   * timer-less for now.
   */
  getCountdownSec(): number | undefined {
    return undefined;
  }

  // ----- Lifecycle ---------------------------------------------------------

  create(): void {
    // Phaser scene-instance reuse — explicit state reset on every mount.
    this.currentQuestion = null;
    this.transitioning = false;
    this.paused = false;

    const { mathId, speed } = Settings.round;
    this.mathId = mathId ?? 'add-to-10';
    this.speed = speed ?? 'medium';

    // RoundController owns question loop + anti-repeat + score. Story
    // 10 will add an optional `questionsPerRound` override; for the
    // skeleton, the default 20 is fine — the loop never advances past
    // floor 0 anyway since we don't have a real wave system yet.
    this.roundController = new RoundController(this.mathId, this.speed);

    // Game-mode-agnostic lifecycle (sprint 2.1.9) — telemetry, HUD
    // launch, audio loops, defensive Settings.setGameId. Audio loops
    // use the PLACEHOLDER mappings from GAME_MUSIC_MAP +
    // GAME_MIDGROUND_MAP (sharing Alien Shoot's loops) until story 1's
    // real climb audio lands.
    this.lifecycle = new GameSceneLifecycle({
      scene: this,
      gameId: this.gameId,
      mathId: this.mathId,
      speed: this.speed,
      roundController: this.roundController,
    });
    this.lifecycle.enter();

    // === Placeholder rendering ===
    // Story 4 skeleton: a centered "Coming soon" splash so the scene
    // mounts cleanly + the kid sees feedback. Stories 6-11 replace
    // this with the real hero + rungs + camera scroll.
    const { width, height } = this.scale;
    text(this, width / 2, height * 0.4, 'Number Climb', 'headline').setOrigin(0.5);
    text(this, width / 2, height * 0.55, 'Coming soon — climb mechanic in development', 'body')
      .setOrigin(0.5)
      .setAlpha(0.7);
    text(this, width / 2, height * 0.65, `${this.mathId} · ${this.speed} · ${String(this.totalFloors)} floors`, 'body')
      .setOrigin(0.5)
      .setAlpha(0.5);

    _th.logToAi('NumberClimb.skeletonRender', SeverityLevel.Verbose, {
      gameId: this.gameId,
      mathId: this.mathId,
      speed: this.speed,
    });

    this.events.once('shutdown', () => this.cleanup());
  }

  override update(_time: number, _dt: number): void {
    if (this.transitioning) return;
    if (this.paused) return;
    // Story 7 + 9 fill this in: floor-system update, cumulative
    // timer decrement, end-round triggers on timer-to-0 / second wrong.
  }

  // ----- endRound deferred to story 9 -------------------------------------
  //
  // Number Climb's endRound has to compute STARS and PASSED from the
  // height reached, not the correct count. That requires:
  //   - a `floorReached` field updated by the floor system (story 7)
  //   - `computeClimbStars` helper (story 9)
  //   - `GameSceneLifecycle.endRound` accepting passedOverride +
  //     starsOverride params (small story 9 API extension)
  // Story 4 skeleton has none of these wired yet, so endRound() is
  // omitted intentionally — adding it now would require deciding
  // the API shape before the consumers exist.

  private cleanup(): void {
    // Scene-specific subsystem teardown will live here (floor system,
    // input system, hero). Story 6+7+8 fill this in.
    this.lifecycle.exit();
  }

  // ----- Pause / resume / quit (GameSceneContract) -------------------------

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    // Subsystem pause (story 7+8 fill in floor system + input system pauses).
    this.lifecycle.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    // Subsystem resume (story 7+8 fill in).
    this.lifecycle.resume();
  }

  quitToMenu(): void {
    this.lifecycle.quitToMenu();
  }
}
