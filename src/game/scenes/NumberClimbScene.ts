// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, pickFloorSpacingPx, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { SfxKeys } from '@/core/audioKeys';
import { Settings } from '@/services/Settings';
import { getAudioManager } from '@/services/audioManagerFactory';
import { RoundController } from '@/game/services/RoundController';
import { computeClimbStars } from '@/services/ScoreCalculator';
import type { GameSceneContract } from '@/game/scenes/gameSceneContract';
import type { Question } from '@/math/types';
import { GameSceneLifecycle } from '@/game/services/GameSceneLifecycle';
import { text } from '@/game/ui/typography';
import { NumberClimbHero } from '@/game/entities/NumberClimbHero';
import { NumberClimbFloorSystem } from '@/game/systems/NumberClimbFloorSystem';
import { SHIP_BLAST_TWEEN_MS } from '@/game/entities/NumberClimbFloorFrame';
import { NumberClimbInputSystem } from '@/game/systems/NumberClimbInputSystem';
import type { NumberClimbRung } from '@/game/entities/NumberClimbRung';

/**
 * Number Climb — sprint 2.2 third game mode. Vertical climb across 10
 * floors; the kid picks the rung carrying the correct answer at each
 * floor.
 *
 * ## Gameplay loop (per floor)
 *
 * 1. `startNextQuestion()` draws the question + calls
 *    `floorSystem.spawnFloor(question, nextFloorY)`. FloorSystem
 *    produces N rungs (2/3/4 by Difficulty) at the floor's y,
 *    distributed horizontally across the playfield.
 * 2. InputSystem listens for tap / click / 1-N keys. On pick →
 *    `floorSystem.pickRung(rung)` returns the outcome.
 * 3. Scene dispatches on the outcome:
 *      - 'correct': award score, hero `jumpTo(rung.x, rung.y)`, camera
 *        scrolls down so the hero settles back near canvas center, then
 *        `afterFloor()` → next floor OR endRound if floor 10.
 *      - 'wrong-mulligan': deduct `wrongRungTimePenaltySec` from the
 *        cumulative timer, hero `fallBackToFloor(currentFloorY)`,
 *        InputSystem `acceptInput()` to allow the second-and-final try.
 *      - 'wrong-terminal': end the round. Hero `fallOffScreen()`,
 *        GameOver transition (with passed=false, stars by height).
 *
 * ## Failure modes
 *
 * - Timer hits 0 mid-floor → `endRound()` (hero falls off screen).
 * - Second wrong rung on the same floor → `endRound()`.
 * - Floor 10 reached → `endRound()` with `passed=true, stars=3`.
 *
 * ## Camera (option 2: hero moves up, camera follows)
 *
 * Hero starts near the bottom of the playfield; camera centered.
 * Each correct jump moves the hero UP to the picked rung's world y.
 * Camera tweens to follow at a slight lag, so the hero visibly rises
 * within the frame before the camera catches up. By floor 10 the
 * hero is at the top of the playable area + a celebration animation
 * fires. Floor world y-coordinates decrease as the kid climbs (lower
 * y = higher on screen in Phaser's coordinate system).
 *
 * Floor 0 (start) y = `bottomBound - heroHalfHeight`. Floor 1's
 * rungs are above at `floor0Y - FLOOR_SPACING`. Floor 10 is at
 * `floor0Y - 10 * FLOOR_SPACING` = near the top of the climb space.
 */

// Vertical spacing between floor centers now comes from
// `pickFloorSpacingPx()` (config.numberClimb.floorSpacingPx + viewport
// pick). Read once at create() time into `floorSpacingPx` below.

/**
 * Sprint 2.2 — staged delays on the correct-pick beat. The scene fires
 * ButtonClick1 at t=0 as immediate tap feedback; the hatch SFX joins
 * `HATCH_SFX_DELAY_MS` later; the hero starts moving `HERO_JUMP_DELAY_MS`
 * later so the kid sees the door open BEFORE the hero moves through it.
 */
const HATCH_SFX_DELAY_MS = 150;
const HERO_JUMP_DELAY_MS = 300;

/**
 * Sprint 2.2.1 story 1 — how long the one-time "One more try!" mulligan
 * banner holds at full opacity before its 300ms fade-out.
 */
const MULLIGAN_HINT_HOLD_MS = 1500;


export class NumberClimbScene extends Phaser.Scene implements GameSceneContract {
  static readonly key = SceneKeys.NumberClimb;
  private readonly gameId = 'number-climb' as const;

  // Configured at create()
  private mathId!: MathId;
  private speed!: SpeedKey;
  private roundController!: RoundController;
  private lifecycle!: GameSceneLifecycle;
  private hero!: NumberClimbHero;
  private floorSystem!: NumberClimbFloorSystem;
  private inputSystem!: NumberClimbInputSystem;

  private currentQuestion: Question | null = null;
  private transitioning = false;
  private paused = false;

  /** Cumulative timer remaining (ms). Story 9 — drains in update(dt). */
  private remainingTimeMs = 0;
  /** Total timer budget for this round (ms) — for the HUD's fraction calc. */
  private totalTimeMs = 0;
  /** Current floor index (0 = ground; N reached = stars by height). */
  private floorReached = 0;
  private readonly totalFloors = config.numberClimb.questionsPerRound;
  /**
   * Per-round floor spacing (px). Picked at `create()` from
   * `pickFloorSpacingPx()` so desktop and mobile can carry independent
   * values. Used for the frame band height, next-floor y math, and the
   * fall-back-to-floor target y on a mulligan.
   */
  private floorSpacingPx = 0;

  // Cached playfield bounds + per-floor y-coord derivation
  private leftBound = 0;
  private rightBound = 0;
  private floor0Y = 0; // world y of the ground floor (where the hero starts)

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

  getQuestionsPerRound(): number {
    return this.totalFloors;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Cumulative timer remaining in seconds. HUD polls per-frame for the countdown text. */
  getCountdownSec(): number | undefined {
    if (this.transitioning) return undefined;
    return Math.max(0, this.remainingTimeMs / 1000);
  }

  /** Cumulative timer fraction (0..1). HUD uses for the color ramp. */
  getCountdownFraction(): number {
    if (this.totalTimeMs <= 0) return 0;
    return Math.max(0, Math.min(1, this.remainingTimeMs / this.totalTimeMs));
  }

  // ----- Lifecycle ---------------------------------------------------------

  create(): void {
    // Phaser scene-instance reuse — explicit state reset.
    this.currentQuestion = null;
    this.transitioning = false;
    this.paused = false;
    this.floorReached = 0;
    this.floorSpacingPx = pickFloorSpacingPx();

    const { mathId, speed } = Settings.round;
    this.mathId = mathId ?? 'add-to-10';
    this.speed = speed ?? 'medium';

    // RoundController with 10-floor override (sprint 2.2 story 10).
    this.roundController = new RoundController(this.mathId, this.speed, this.totalFloors);

    // Playfield bounds. Same general approach as AsteroidFieldScene:
    // top margin for the HUD, bottom margin for the AGPL footer.
    const { width, height } = this.scale;
    const padding = config.layout.safeAreaPaddingPx;
    const hudBarHeight = config.layout.hudBarHeightPx;
    const footerHeight = config.layout.attributionFooterHeightPx;
    this.leftBound = padding + 8;
    this.rightBound = width - padding - 8;
    const topPlayfield = hudBarHeight + padding + 16;
    const bottomPlayfield = height - footerHeight - 16;
    // Sprint 2.2 story 13d — anchor floor 0 so its FRAME bottom aligns
    // with the playfield bottom (not the hero's feet). With the taller
    // floor band (173 px after stories 13b + 13c bumps), centering on
    // the hero's feet left the frame's ground bar clipped into the AGPL
    // footer + dark dead space at the bottom of the canvas. Center y
    // is half a floor-band above the playfield bottom so the frame
    // ends exactly at the playfield bottom.
    this.floor0Y = bottomPlayfield - this.floorSpacingPx / 2;

    // Hero — placed at floor 0, centered horizontally.
    const heroStartX = (this.leftBound + this.rightBound) / 2;
    this.hero = new NumberClimbHero({
      scene: this,
      x: heroStartX,
      y: this.floor0Y,
    });

    // Camera follow — option 2 from the sprint design. `startFollow`
    // with a low lerpY makes the camera trail the hero as the kid
    // climbs (hero visibly rises before the camera catches up). lerpX=0
    // so the camera doesn't drift horizontally when the hero jumps to
    // an off-center rung. Replaces a per-correct-pick `cameras.main.pan`
    // call that broke with `this.ease is not a function` because
    // PanEffect's ease parameter isn't resolved the same way scene
    // tween eases are.
    this.cameras.main.startFollow(this.hero, true, 0, 0.08);

    // FloorSystem — spawns rungs per floor; tracks the wrong-this-floor counter.
    // Also owns the per-floor framing visuals (story 13a) — bg image + black
    // side-bars + top separator. `frameDepth: -10` so frames render BEHIND
    // rungs (depth 0) and hero (depth 0); negative depth keeps the gameplay
    // surface untouched.
    this.floorSystem = new NumberClimbFloorSystem({
      scene: this,
      leftBound: this.leftBound,
      rightBound: this.rightBound,
      difficulty: this.speed,
      floorHeight: this.floorSpacingPx,
      frameDepth: -10,
      totalFloors: this.totalFloors,
    });

    // Floor 0 — the fixed "fire" ground floor. Hero starts on this; it's
    // never randomized and always uses the `ClimbFloorBgKeys.Fire` image
    // (the "on fire, climb to escape" visual). Must be spawned BEFORE
    // `startNextQuestion()` because `spawnFloor` no longer draws the
    // ground bar — floor 0 owns it.
    this.floorSystem.spawnGroundFloorFrame(this.floor0Y);

    // InputSystem — tap/click + number keys → onPick(rung).
    this.inputSystem = new NumberClimbInputSystem({
      scene: this,
      floorSystem: this.floorSystem,
    });
    this.inputSystem.onPick((rung) => this.handlePick(rung));

    // Cumulative timer setup — totalTimeMs from config.
    const speedCfg = config.numberClimb.speed[this.speed];
    this.totalTimeMs = speedCfg.totalTimeSec * 1000;
    this.remainingTimeMs = this.totalTimeMs;
    void topPlayfield; // (kept for future camera-bound math)

    // GameSceneLifecycle — telemetry, HUD launch, audio loops,
    // defensive Settings.setGameId.
    this.lifecycle = new GameSceneLifecycle({
      scene: this,
      gameId: this.gameId,
      mathId: this.mathId,
      speed: this.speed,
      roundController: this.roundController,
    });
    this.lifecycle.enter();

    this.startNextQuestion();

    this.events.once('shutdown', () => this.cleanup());
  }

  override update(_time: number, dt: number): void {
    if (this.transitioning) return;
    if (this.paused) return;

    // Cumulative timer drain. When it hits 0 → end the round.
    this.remainingTimeMs -= dt;
    if (this.remainingTimeMs <= 0) {
      this.remainingTimeMs = 0;
      this.handleTimerOut();
    }
  }

  // ----- Floor lifecycle ---------------------------------------------------

  private startNextQuestion(): void {
    const question = this.roundController.drawNextQuestion();
    if (question === null) {
      // Round complete — shouldn't reach here for Number Climb because
      // floor 10 success short-circuits to endRound, but defensive.
      this.endRound();
      return;
    }
    this.currentQuestion = question;

    // Compute the y for the NEXT floor (the one the kid is about to
    // climb to). floorReached starts at 0; the first call spawns
    // floor 1's rungs above the hero's floor-0 starting position.
    const nextFloorIndex = this.floorReached + 1;
    const nextFloorY = this.floor0Y - nextFloorIndex * this.floorSpacingPx;
    const rungs = this.floorSystem.spawnFloor(question, nextFloorY);
    this.inputSystem.bindRungs(rungs);
    this.inputSystem.acceptInput();

    _th.logToAi('QuestionStarted', SeverityLevel.Information, {
      gameId: this.gameId,
      questionIndex: String(this.roundController.questionIndex),
      mathId: this.mathId,
      speed: this.speed,
    });
    this.events.emit('questionStarted', {
      question: this.currentQuestion,
      index: this.roundController.questionIndex,
      total: this.totalFloors,
    });
  }

  // ----- Pick dispatch -----------------------------------------------------

  private handlePick(rung: NumberClimbRung): void {
    const outcome = this.floorSystem.pickRung(rung);
    switch (outcome.kind) {
      case 'correct':
        this.handleCorrectPick(outcome.rung);
        break;
      case 'wrong-mulligan':
        this.handleWrongMulligan();
        break;
      case 'wrong-terminal':
        this.handleWrongTerminal();
        break;
      case 'rung-consumed':
        // Defensive — double-tap of an already-consumed rung. Ignore.
        break;
    }
  }

  private handleCorrectPick(rung: NumberClimbRung): void {
    this.transitioning = true;
    const usedMulligan = this.floorSystem.hasUsedMulligan();
    const { scoreDelta } = this.roundController.recordOutcome({
      wasCorrect: true,
      usedWrongShot: usedMulligan,
    });
    this.events.emit('correctHit', {
      x: rung.x,
      y: rung.y,
      scoreDelta,
    });

    // Sprint 2.2 — staged audio + motion sequence on a correct pick:
    //   t=0:   ButtonClick1 plays as IMMEDIATE positive feedback for
    //          the kid's tap (loud, alone, no other sounds in flight).
    //   t=150: HatchOpen1 starts — door opens.
    //   t=300: hero.jumpTo runs (with its internal click SFX suppressed
    //          since we already played it at t=0) — kid moves THROUGH
    //          the still-playing hatch sound into the new floor.
    //   t=580: hero lands.
    //   t=870: hatch finishes.
    // Hatch is skipped on the final escape floor — that floor's audio
    // sequence (ship blast + smoke + banner) already covers the beat
    // and a hatch underneath would compete.
    void getAudioManager().play(SfxKeys.ButtonClick1, 'sfx');

    const enteringEscape = this.floorReached + 1 >= this.totalFloors;
    if (!enteringEscape) {
      this.time.delayedCall(HATCH_SFX_DELAY_MS, () => {
        void getAudioManager().play(SfxKeys.HatchOpen1, 'sfx');
      });
    }

    // Camera follow (set in create()) trails the hero naturally — no
    // per-pick pan needed.
    this.time.delayedCall(HERO_JUMP_DELAY_MS, () => {
      this.hero.jumpTo(
        rung.x,
        rung.y,
        () => {
          this.floorReached += 1;
          this.afterFloor(true);
        },
        { skipClickSfx: true },
      );
    });
  }

  private handleWrongMulligan(): void {
    this.remainingTimeMs = Math.max(
      0,
      this.remainingTimeMs - config.numberClimb.wrongRungTimePenaltySec * 1000,
    );
    // Sprint 2.2.1 story 1 — surface the time cost: the HUD listens for
    // `timePenalty` and floats a red "−Ns" popup at the countdown timer
    // so the kid registers that the wrong rung cost them time.
    this.events.emit('timePenalty', {
      penaltySec: config.numberClimb.wrongRungTimePenaltySec,
    });
    // First mulligan of the session: a one-time "One more try!" banner
    // teaches the one-retry-per-floor rule before the kid discovers it
    // the hard way (a second wrong ends the round).
    this.maybeShowFirstMulliganHint();

    // Hero falls back to the CURRENT floor's base (i.e. the floor
    // the kid is still on — they haven't climbed yet). After the
    // animation, re-enable input for the second-and-final try.
    const currentFloorY = this.floor0Y - this.floorReached * this.floorSpacingPx;
    this.hero.fallBackToFloor(currentFloorY, () => {
      this.inputSystem.acceptInput();
    });
  }

  /**
   * Sprint 2.2.1 story 1 — one-time "One more try!" banner above the
   * hero on the kid's FIRST mulligan of the session. sessionStorage-
   * gated so it shows once per session; the try/catch covers browsers
   * that throw on storage access (iOS private mode pre-15) — there the
   * hint just shows every mulligan rather than breaking the scene.
   */
  private maybeShowFirstMulliganHint(): void {
    const FLAG_KEY = 'numberClimb.mulliganHintSeen';
    try {
      if (sessionStorage.getItem(FLAG_KEY) === '1') return;
      sessionStorage.setItem(FLAG_KEY, '1');
    } catch {
      // Storage unavailable — fall through and show the hint anyway.
    }
    const banner = text(
      this,
      this.hero.x,
      this.hero.y - NumberClimbHero.HEIGHT - 24,
      'One more try!',
      'warning',
    ).setOrigin(0.5);
    banner.setDepth(100);
    this.time.delayedCall(MULLIGAN_HINT_HOLD_MS, () => {
      this.tweens.add({
        targets: banner,
        alpha: 0,
        duration: 300,
        ease: 'Quad.Out',
        onComplete: () => banner.destroy(),
      });
    });
  }

  private handleWrongTerminal(): void {
    this.transitioning = true;
    // Record the question as wrong (with usedWrongShot flag).
    this.roundController.recordOutcome({ wasCorrect: false, usedWrongShot: true });
    this.events.emit('questionEnded', {
      wasCorrect: false,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });
    // Hero falls off the bottom.
    this.hero.fallOffScreen(this.scale.height, () => {
      this.endRound();
    });
  }

  private handleTimerOut(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.flash(180, 239, 68, 68, false);
    this.cameras.main.shake(180, 0.006);
    this.hero.fallOffScreen(this.scale.height, () => {
      this.endRound();
    });
  }

  private afterFloor(wasCorrect: boolean): void {
    const props: TelemetryProps = {
      gameId: this.gameId,
      questionIndex: String(this.roundController.questionIndex),
      wasCorrect: String(wasCorrect),
      usedWrongShot: String(this.floorSystem.hasUsedMulligan()),
      mathId: this.mathId,
      speed: this.speed,
    };
    _th.logToAi('QuestionEnded', SeverityLevel.Information, props);
    this.events.emit('questionEnded', {
      wasCorrect,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });

    this.floorSystem.clearFloor();
    this.roundController.advanceQuestionIndex();
    this.transitioning = false;

    // Sprint 2.2 story 13e — reached the top floor (the escape room).
    // Hide the hero (kid boarded the ship), play the escape-ship
    // fly-away with smoke trail. The "Escaped Safe!" banner kicks in at
    // 75% of the ship-blast tween (1125 ms in for the 1500 ms tween) so
    // the banner lands WHILE the ship is still visibly rising — the
    // win beat reads as continuous instead of a pause-then-banner.
    // Banner displays for 1 s then GameOver mounts. The ship + smoke
    // continue to render through the banner display; Phaser scene
    // teardown on endRound cleans them up.
    if (this.floorReached >= this.totalFloors) {
      this.transitioning = true;
      this.hero.setVisible(false);
      this.floorSystem.playEscapeWinAnimation();
      this.time.delayedCall(SHIP_BLAST_TWEEN_MS * 0.75, () => this.showWinBannerThenEndRound());
      return;
    }

    this.startNextQuestion();
  }

  // ----- End-round + cleanup ----------------------------------------------

  private endRound(): void {
    const passed = this.floorReached >= this.totalFloors;
    const stars = computeClimbStars(this.floorReached, this.totalFloors);
    this.lifecycle.endRound({ passedOverride: passed, starsOverride: stars });
  }

  /**
   * Sprint 2.2 story 13e polish — after the escape ship blasts off,
   * display "Escaped Safe!" in the center of the escape floor for one
   * beat (1000 ms) before transitioning to GameOver. Position is the
   * escape frame's world-coord center; the camera-follow leaves this
   * near the visible center of the canvas by the time floor 10 lands,
   * so the message reads natively without any camera nudging.
   */
  private showWinBannerThenEndRound(): void {
    const bannerX = (this.leftBound + this.rightBound) / 2;
    // Escape frame center y — the 2× frame's center is half a (normal)
    // floor-band above the rungs' floorY. Floor 10 rungs were at
    // `floor0Y - totalFloors * floorSpacingPx`.
    const bannerY = this.floor0Y - this.totalFloors * this.floorSpacingPx - this.floorSpacingPx / 2;
    const banner = text(this, bannerX, bannerY, 'Escaped Safe!', 'headline');
    banner.setOrigin(0.5);
    banner.setDepth(100); // above the frame + hero z-order

    this.time.delayedCall(1000, () => {
      banner.destroy();
      this.endRound();
    });
  }

  private cleanup(): void {
    this.floorSystem?.clearFloor();
    this.floorSystem?.clearAllFrames();
    this.inputSystem?.destroy();
    this.lifecycle.exit();
  }

  // ----- Pause / resume / quit (GameSceneContract) -------------------------

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.floorSystem?.pause();
    this.inputSystem?.setPaused(true);
    this.lifecycle.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.floorSystem?.resume();
    this.inputSystem?.setPaused(false);
    this.lifecycle.resume();
  }

  quitToMenu(): void {
    this.lifecycle.quitToMenu();
  }
}
