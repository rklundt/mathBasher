// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { RoundController } from '@/game/services/RoundController';
import type { GameSceneContract } from '@/game/scenes/gameSceneContract';
import type { Question } from '@/math/types';
import { AsteroidHero } from '@/game/entities/AsteroidHero';
import { AsteroidProjectile } from '@/game/entities/AsteroidProjectile';
import type { Asteroid } from '@/game/entities/Asteroid';
import { AsteroidWaveSystem } from '@/game/systems/AsteroidWaveSystem';
import { AsteroidHitSystem } from '@/game/systems/AsteroidHitSystem';
import { AsteroidInputSystem } from '@/game/systems/AsteroidInputSystem';
import { getAudioManager } from '@/services/audioManagerFactory';
import { GameSceneLifecycle } from '@/game/services/GameSceneLifecycle';
import {
  SfxKeys,
  pickRandomHitCorrectSfx,
  pickRandomHitWrongSfx,
} from '@/core/audioKeys';
import { ParticleSpriteKeys } from '@/core/spriteKeys';
import { TouchFireButton } from '@/game/ui/TouchFireButton';
import { text } from '@/game/ui/typography';

/**
 * Asteroid Field game scene — sprint 2.1's second game mode.
 *
 * Differs from `GameScene` (Alien Shoot) on the physics + input layer
 * but reuses everything else via the shared `RoundController` (anti-
 * repeat sliding window + question loop + score) and the same `HudScene`
 * (HUD prompts + score + dots + pause + mute icon all game-mode-agnostic
 * since sprint 2.1 added `gameSceneKey` plumbing).
 *
 * Round structure:
 *   1. Player picks "Asteroid Field" at GameSelectScene → DifficultyScene
 *   2. Picks a math type + speed → this scene starts
 *   3. RoundController draws first question (4 candidate answers + the
 *      math prompt). Scene spawns 4 asteroids with those answers.
 *   4. Per-question physics mode picked randomly from
 *      `config.asteroidField.enabledPhysicsModes` (straight / bounce /
 *      orbit). Asteroids drift accordingly.
 *   5. Player aims (mouse / touch-drag-on-left / arrow keys) and fires
 *      (click / touch-right-half / Space). Hit the correct-answer
 *      asteroid → next question. Hit a wrong one → penalty flag for
 *      half-points-on-eventual-correct.
 *   6. Each question has a HARD countdown timer (config.asteroidField
 *      .speed.{slow,medium,fast}.countdownSec). Timeout = wrong answer
 *      + next question.
 *   7. 20 questions → endRound → GameOverScene (unchanged).
 *
 * Pause / quit semantics match GameScene exactly (PauseOverlay's
 * resumeFn/quitFn callbacks bind to this scene's pause/resume/quitToMenu
 * methods).
 */
export class AsteroidFieldScene extends Phaser.Scene implements GameSceneContract {
  static readonly key = SceneKeys.AsteroidField;
  /**
   * Game-mode identifier used in every telemetry props object emitted
   * by this scene. Extracted to a single readonly so a future mode-
   * rename is a 1-line change (and a typo in one telemetry props
   * literal can't silently fork the App Insights stream).
   */
  private readonly gameId = 'asteroid-field' as const;

  // Configured at create()
  private mathId!: MathId;
  private speed!: SpeedKey;
  private hero!: AsteroidHero;
  private waveSystem!: AsteroidWaveSystem;
  private inputSystem!: AsteroidInputSystem;
  private roundController!: RoundController;
  /** Sprint 2.1.9 — game-mode-agnostic scene lifecycle helper. */
  private lifecycle!: GameSceneLifecycle;

  private projectile: AsteroidProjectile | null = null;
  private currentQuestion: Question | null = null;
  private transitioning = false;
  private paused = false;

  // Cached playfield bounds (computed in create())
  private leftBound = 0;
  private rightBound = 0;
  private topBound = 0;
  private bottomBound = 0;

  constructor() {
    super(AsteroidFieldScene.key);
  }

  // ----- GameSceneContract -------------------------------------------------

  getCurrentQuestionPayload(): { question: Question; index: number; total: number } | null {
    if (!this.currentQuestion) return null;
    return {
      question: this.currentQuestion,
      index: this.roundController.questionIndex,
      total: this.roundController.questionsPerRound,
    };
  }

  getQuestionsPerRound(): number {
    return this.roundController.questionsPerRound;
  }

  isPaused(): boolean {
    return this.paused;
  }

  // ----- Lifecycle ---------------------------------------------------------

  // Sprint 2.1.9 — preload() removed; LoadingScene now warms the
  // per-game asset cache before this scene mounts. See GameScene for
  // the equivalent rationale.

  create(): void {
    // Phaser reuses scene instances across mounts (class-field initializers
    // run once at construction). Reset all stateful fields explicitly so a
    // second-time-into-this-scene round starts cleanly — same pattern
    // SettingsScene.init() uses for the tab state. The class-field default
    // for `projectile` correctly sets the FIRST mount; the explicit nulls
    // here cover every subsequent mount.
    this.projectile = null;
    this.currentQuestion = null;
    this.transitioning = false;
    this.paused = false;

    const { mathId, speed } = Settings.round;
    this.mathId = mathId ?? 'add-to-10';
    this.speed = speed ?? 'medium';

    // Live-update LIVE asteroids when the user toggles the Settings →
    // Game → Asteroid Images switch. Without this, a toggle would
    // only affect the NEXT wave's spawn, which makes the setting feel
    // unresponsive ("did it work? did I click the wrong thing?").
    // The listener fans the new value to the wave system, which
    // walks live asteroids and swaps each one's visual in place
    // (position / velocity / answer text all preserved).
    const unsubscribeImageToggle = Settings.onImageAsteroidsChange((enabled) => {
      this.waveSystem?.applyVisualMode(enabled);
    });
    this.events.once('shutdown', unsubscribeImageToggle);

    // Playfield bounds — every dimension is derived from config so a
    // future HUD/footer/FIRE-button resize automatically propagates.
    //   - topBound: just below the HUD ribbon (hudBarHeightPx) with
    //     a safe-area-pad gap.
    //   - bottomBound: just above the TouchFireButton's hit-circle TOP
    //     edge. TouchFireButton sits with its CENTER at
    //     `h - footerHeight - footerClearance - radius`; the top of
    //     its hit area is one diameter + hit-pad higher than its
    //     center. Subtracting that whole stack leaves the playfield
    //     stopping cleanly above the FIRE button.
    const { width, height } = this.scale;
    const padding = config.layout.safeAreaPaddingPx;
    const hudBarHeight = config.layout.hudBarHeightPx;
    const footerHeight = config.layout.attributionFooterHeightPx;
    const fire = config.layout.touchFire;
    const fireStackHeight = footerHeight + fire.footerClearancePx + fire.radiusPx * 2 + fire.hitPadPx;
    this.leftBound = padding + 8;
    this.rightBound = width - padding - 8;
    this.topBound = hudBarHeight + padding;
    this.bottomBound = height - fireStackHeight;

    // Hero: centered in the playfield.
    const heroX = (this.leftBound + this.rightBound) / 2;
    const heroY = (this.topBound + this.bottomBound) / 2;
    this.hero = new AsteroidHero(this, heroX, heroY);

    // Wave system: feeds per-Speed drift + countdown values.
    const speedCfg = config.asteroidField.speed[this.speed];
    this.waveSystem = new AsteroidWaveSystem({
      scene: this,
      leftBound: this.leftBound,
      rightBound: this.rightBound,
      topBound: this.topBound,
      bottomBound: this.bottomBound,
      driftPxPerSec: speedCfg.driftPxPerSec,
      countdownSec: speedCfg.countdownSec,
    });

    // Round controller: anti-repeat + question loop + score (same as GameScene).
    // (`transitioning` and `paused` already reset at the top of create() so
    // this scene's second-mount path starts cleanly even before constructing
    // the round controller.)
    this.roundController = new RoundController(this.mathId, this.speed);

    // Input: aim (mouse / left-half touch drag / arrow keys) + fire
    // (click / right-half touch / Space / TouchFireButton).
    this.inputSystem = new AsteroidInputSystem(this, heroX, heroY);
    this.inputSystem.onFire(() => this.handleFire());

    // On-screen FIRE button for touch — routes through inputSystem.fire().
    new TouchFireButton({
      scene: this,
      onFire: () => this.inputSystem.fire(),
    });

    // Sprint 2.1.9 — game-mode-agnostic lifecycle (defensive
    // Settings.setGameId, telemetry, HUD launch, audio loops)
    // consolidated into the helper.
    this.lifecycle = new GameSceneLifecycle({
      scene: this,
      gameId: this.gameId,
      mathId: this.mathId,
      speed: this.speed,
      roundController: this.roundController,
    });
    this.lifecycle.enter();

    // First-time Asteroid Field hint banner. Touch controls aren't
    // obvious (drag on the left, tap on the right, FIRE button — a
    // beginner would guess tap-anywhere-to-fire). Shows ONCE per
    // session, fades after ~4s. Session-scoped flag (not localStorage)
    // because the hint is meant to onboard new sessions, not "you've
    // seen this once ever."
    this.maybeShowFirstRoundHint();

    this.startNextQuestion();

    this.events.once('shutdown', () => this.cleanup());
  }

  /**
   * Show the first-round controls hint (once per session). Plain text
   * at the top of the playfield with a translucent backdrop so it
   * reads against any background; auto-fades after 4 seconds. The
   * sessionStorage flag is wrapped in try/catch because some browsers
   * (private mode on iOS pre-15) throw on storage access — the hint
   * just shows every round instead of breaking the scene.
   */
  private maybeShowFirstRoundHint(): void {
    const FLAG_KEY = 'asteroidField.hintSeen';
    try {
      if (sessionStorage.getItem(FLAG_KEY) === '1') return;
      sessionStorage.setItem(FLAG_KEY, '1');
    } catch {
      // Storage unavailable — fall through and show the hint anyway.
    }
    const { width } = this.scale;
    const hintY = this.topBound + 32;
    const hintText = text(
      this,
      width / 2,
      hintY,
      'Drag to aim • Tap or press FIRE to shoot',
      'rowLabel',
    ).setOrigin(0.5);
    // Translucent dark pill behind the text for readability against
    // any backdrop. Sized from the text bounds with breathing room.
    const padX = 18;
    const padY = 8;
    const bg = this.add.rectangle(
      width / 2,
      hintY,
      hintText.width + padX * 2,
      hintText.height + padY * 2,
      0x000000,
      0.65,
    );
    bg.setOrigin(0.5);
    bg.setStrokeStyle(2, 0x60a5fa, 0.9);
    // Re-add the text above the rectangle (Phaser scene-level Z is
    // insertion order; bg was added second so it covers the text).
    hintText.setDepth(1);
    bg.setDepth(0);
    // Fade out after 3 seconds visible + 1 second fade.
    this.time.delayedCall(3000, () => {
      this.tweens.add({
        targets: [hintText, bg],
        alpha: 0,
        duration: 1000,
        ease: 'Quad.Out',
        onComplete: () => {
          hintText.destroy();
          bg.destroy();
        },
      });
    });
  }

  override update(_time: number, dt: number): void {
    if (this.transitioning) return;
    if (this.paused) return;

    // Advance input (keyboard arrow-key continuous rotation), then sync
    // the hero's facing.
    this.inputSystem.update(dt);
    this.hero.setAimAngle(this.inputSystem.getAimAngle());
    this.hero.update(dt);

    // Wave physics + countdown.
    const outcome = this.waveSystem.update(dt);
    if (outcome === 'timeout') {
      this.handleTimeout();
      return;
    }

    // Projectile motion + collision.
    if (this.projectile) {
      const stillAlive = this.projectile.advance(
        dt,
        this.leftBound,
        this.rightBound,
        this.topBound,
        this.bottomBound,
      );
      if (!stillAlive) {
        this.projectile.kill();
        this.projectile = null;
      } else {
        const hit = AsteroidHitSystem.findHit(this.projectile, this.waveSystem.liveAsteroids());
        if (hit) {
          this.projectile.kill();
          this.projectile = null;
          this.handleHit(hit);
        }
      }
    }
  }

  // ----- Per-question event handlers ---------------------------------------

  private handleFire(): void {
    if (this.transitioning) return;
    if (this.projectile) return; // one in flight at a time
    getAudioManager().play(SfxKeys.Fire1, 'sfx');
    const aimAngle = this.hero.getAimAngle();
    this.projectile = new AsteroidProjectile(this, this.hero.x, this.hero.y, aimAngle);
    this.playMuzzleFlash(this.hero.x, this.hero.y, aimAngle);
  }

  /**
   * Brief muzzle flash at the hero's nose. Reuses the same `muzzle_03`
   * particle texture as Alien Shoot; difference is the emission angle is
   * along the aim direction (vs Alien Shoot's straight-up).
   */
  private playMuzzleFlash(x: number, y: number, aimAngleRad: number): void {
    const aimDeg = (aimAngleRad * 180) / Math.PI;
    const flash = this.add.particles(x, y, ParticleSpriteKeys.Muzzle03, {
      speed: { min: 10, max: 40 },
      angle: { min: aimDeg - 10, max: aimDeg + 10 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 150,
      tint: 0xfacc15,
      blendMode: 'ADD',
      emitting: false,
    });
    flash.explode(4);
    this.time.delayedCall(200, () => flash.destroy());
  }

  private handleHit(asteroid: Asteroid): void {
    const correct = asteroid.answer === this.waveSystem.getCorrectAnswer();
    if (correct) {
      this.transitioning = true;
      const usedWrongShot = this.waveSystem.hasUsedWrongShot();
      const { scoreDelta } = this.roundController.recordOutcome({
        wasCorrect: true,
        usedWrongShot,
      });
      this.events.emit('correctHit', {
        x: asteroid.x,
        y: asteroid.y,
        scoreDelta,
      });
      this.hero.playHitAnim();
      getAudioManager().play(pickRandomHitCorrectSfx(), 'sfx');
      this.playCorrectHitFeedback(asteroid.x, asteroid.y);
      asteroid.playExplodeAnim(true, () => {
        // Fade the rest of the wave smoothly.
        const survivors = this.waveSystem.liveAsteroids();
        let pendingFades = survivors.length;
        if (pendingFades === 0) {
          this.afterQuestion(true);
          return;
        }
        for (const s of survivors) {
          s.playFadeOut(() => {
            pendingFades -= 1;
            if (pendingFades === 0) this.afterQuestion(true);
          });
        }
      });
    } else {
      this.waveSystem.applyWrongShotPenalty();
      getAudioManager().play(pickRandomHitWrongSfx(), 'sfx');
      this.playWrongHitFeedback(asteroid.x, asteroid.y);
      this.spawnTimePenaltyFloater(asteroid.x, asteroid.y);
      asteroid.playExplodeAnim(false, () => {
        // No further state change beyond the wrong-shot flag.
      });
      _th.logToAi('WrongShot', SeverityLevel.Information, {
        gameId: this.gameId,
        questionIndex: String(this.roundController.questionIndex),
        mathId: this.mathId,
        speed: this.speed,
      });
    }
  }

  private playCorrectHitFeedback(x: number, y: number): void {
    const burst = this.add.particles(x, y, ParticleSpriteKeys.Light01, {
      speed: { min: 60, max: 200 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 400,
      tint: 0x22c55e,
      blendMode: 'ADD',
      emitting: false,
    });
    burst.explode(12);
    this.time.delayedCall(500, () => burst.destroy());
    this.cameras.main.flash(120, 34, 197, 94, false);
  }

  /**
   * Spawn a "-Ns" floater above the hit wrong-asteroid so the kid sees
   * the time penalty as a discrete event rather than a silent
   * countdown jump. Reads the penalty value from config so a future
   * playtest re-tuning is reflected automatically. Floats upward
   * ~40px over 600ms then fades out. Without this, three wrong shots
   * at Fast (zeroes the countdown) looked like a random timeout-fail
   * with no causation visible.
   */
  private spawnTimePenaltyFloater(x: number, y: number): void {
    const penalty = config.asteroidField.wrongShotCountdownPenaltySec;
    if (penalty <= 0) return;
    const floater = text(this, x, y - 40, `-${String(penalty)}s`, 'accent').setOrigin(0.5);
    floater.setColor('#ef4444'); // matches the wrong-hit red flash
    this.tweens.add({
      targets: floater,
      y: y - 80,
      alpha: { from: 1, to: 0 },
      duration: 600,
      ease: 'Quad.Out',
      onComplete: () => floater.destroy(),
    });
  }

  private playWrongHitFeedback(x: number, y: number): void {
    const burst = this.add.particles(x, y, ParticleSpriteKeys.Spark05, {
      speed: { min: 80, max: 250 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 350,
      tint: 0xef4444,
      blendMode: 'ADD',
      emitting: false,
    });
    burst.explode(15);
    this.time.delayedCall(450, () => burst.destroy());
    this.cameras.main.shake(150, 0.005);
  }

  private handleTimeout(): void {
    this.transitioning = true;
    this.roundController.recordOutcome({
      wasCorrect: false,
      usedWrongShot: this.waveSystem.hasUsedWrongShot(),
    });
    // Sprint 2.1 playtest — audible failure cue. Without this, the
    // countdown-zero moment was silent except for the asteroid fade-
    // outs, which read as "everything just went quiet" rather than
    // "you failed." Plays BEFORE the asteroid fades + a red screen
    // flash and gentle shake so the timeout reads as a clear event.
    // Alien Shoot doesn't need this (the alien-reaches-hero +
    // hero-death-anim is already a strong failure cue).
    getAudioManager().play(SfxKeys.TimeoutFail1, 'sfx');
    this.cameras.main.flash(180, 239, 68, 68, false); // red flash
    this.cameras.main.shake(180, 0.006);

    // No hero-death anim in Asteroid Field — the hero is static so a
    // "drop down" doesn't read right. Just fade the surviving asteroids
    // and advance.
    const survivors = this.waveSystem.liveAsteroids();
    let pendingFades = survivors.length;
    if (pendingFades === 0) {
      this.afterQuestion(false);
      return;
    }
    for (const s of survivors) {
      s.playFadeOut(() => {
        pendingFades -= 1;
        if (pendingFades === 0) this.afterQuestion(false);
      });
    }
  }

  private afterQuestion(wasCorrect: boolean): void {
    const props: TelemetryProps = {
      gameId: this.gameId,
      questionIndex: String(this.roundController.questionIndex),
      wasCorrect: String(wasCorrect),
      usedWrongShot: String(this.waveSystem.hasUsedWrongShot()),
      mathId: this.mathId,
      speed: this.speed,
    };
    _th.logToAi('QuestionEnded', SeverityLevel.Information, props);
    this.events.emit('questionEnded', {
      wasCorrect,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });

    this.waveSystem.clearWave(true);
    this.roundController.advanceQuestionIndex();
    this.transitioning = false;
    this.startNextQuestion();
  }

  private startNextQuestion(): void {
    const question = this.roundController.drawNextQuestion();
    if (question === null) {
      this.endRound();
      return;
    }
    this.currentQuestion = question;
    this.waveSystem.spawnWave(this.currentQuestion);

    _th.logToAi('QuestionStarted', SeverityLevel.Information, {
      gameId: this.gameId,
      questionIndex: String(this.roundController.questionIndex),
      mathId: this.mathId,
      speed: this.speed,
    });
    this.events.emit('questionStarted', {
      question: this.currentQuestion,
      index: this.roundController.questionIndex,
      total: this.roundController.questionsPerRound,
    });
  }

  private endRound(): void {
    // Sprint 2.1.9 — round-end transition consolidated in lifecycle helper.
    this.lifecycle.endRound();
  }

  private cleanup(): void {
    // Scene-specific subsystem teardown.
    this.projectile?.kill();
    this.projectile = null;
    this.waveSystem?.clearWave(true);
    this.inputSystem?.destroy();
    // Sprint 2.1.9 — audio-loop stops + parallel-scene shutdown
    // consolidated in lifecycle helper.
    this.lifecycle.exit();
  }

  // ----- Pause / resume / quit (GameSceneContract) -------------------------

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    // Subsystem-specific pause.
    this.waveSystem?.pause();
    this.inputSystem?.setPaused(true);
    // Sprint 2.1.9 — agnostic pause consolidated in lifecycle helper.
    this.lifecycle.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    // Subsystem-specific resume.
    this.waveSystem?.resume();
    this.inputSystem?.setPaused(false);
    // Sprint 2.1.9 — agnostic resume consolidated in lifecycle helper.
    this.lifecycle.resume();
  }

  quitToMenu(): void {
    // Sprint 2.1.9 — RoundAbandoned telemetry + tweens.resumeAll +
    // scene.start(Menu) consolidated in lifecycle helper.
    this.lifecycle.quitToMenu();
  }

  /** Convenience getter for the HUD's countdown ring. */
  getCountdownFraction(): number {
    return this.waveSystem?.getCountdownFraction() ?? 1;
  }

  /**
   * GameSceneContract — seconds remaining on the per-question countdown.
   * HudScene polls this each frame to render the countdown text. Returns
   * undefined when no wave is active (between rounds, during transitions).
   */
  getCountdownSec(): number | undefined {
    if (!this.waveSystem || this.transitioning) return undefined;
    return this.waveSystem.getCountdownSec();
  }
}
