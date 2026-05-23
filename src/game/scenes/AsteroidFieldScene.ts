// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, isTouchPrimary, type MathId, type SpeedKey } from '@/core/config';
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
  /**
   * Sprint 2.4.1 story 2 — cumulative wrong-shot counter across the
   * WHOLE round (not the wave). When this reaches
   * `config.asteroidField.maxWrongShotsPerRound`, the round ends as
   * a fail — the same fall-through as the per-question timeout, but
   * with an "Out of shots!" banner so the kid registers WHY the round
   * ended early. Per-question score-halving + per-shot time deduction
   * still work as before; this is a third deterrent on top.
   */
  private roundWrongShots = 0;
  /**
   * Sprint 2.4.1 story 2 — `this.time.now` value before which `handleFire`
   * silently bails (no projectile, no SFX). Set on every wrong shot to
   * `now + fireCooldownAfterWrongShotMs`. Resets every wave start so
   * the lockout doesn't leak across questions if a wrong shot landed
   * within the last 1500 ms of the previous question.
   */
  private fireCooldownUntilMs = 0;
  /**
   * Sprint 2.4.1 audit fix — TouchFireButton ref captured at create()
   * so AsteroidFieldScene can call `setLocked(true/false)` around the
   * wrong-shot cooldown window. Without this the cooldown was
   * SILENT — Support reviewer flagged that a kid would conclude
   * the FIRE button was broken when nothing happened on repeated
   * taps. The visual dim + cooldown-end click SFX teach the rule
   * within the first wrong-shot cycle.
   */
  private fireButton: TouchFireButton | null = null;

  // Cached playfield bounds (computed in create())
  private leftBound = 0;
  private rightBound = 0;
  private topBound = 0;
  private bottomBound = 0;
  /**
   * Sprint 2.2 story 15c — first-question aim hint. Visible only while
   * the kid is on question 1 of a round; hides on Q2+, OR earlier when
   * the kid touches the playfield (gesture learned). Container holds
   * the translucent label + hand emoji.
   */
  private aimHint?: Phaser.GameObjects.Container;

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

  /**
   * Sprint 2.4.1 audit fix — wrong-shot budget remaining for the
   * HUD's lives row. Mirrors `NumberClimbScene.getStrikesRemaining`
   * so HudScene.maybeBuildLivesDots renders the same top-left dots
   * pattern for Asteroid Field. The denominator is the round-wide
   * `maxWrongShotsPerRound` cap (default 2).
   *
   * Returns undefined when the cap is disabled (set to 0 in config)
   * so HudScene knows to suppress the lives row in that mode.
   */
  getStrikesRemaining(): number | undefined {
    const cap = config.asteroidField.maxWrongShotsPerRound;
    if (cap <= 0) return undefined;
    return Math.max(0, cap - this.roundWrongShots);
  }

  /** Sprint 2.4.1 audit fix — slot count for HudScene to size the row. */
  getMaxStrikes(): number | undefined {
    const cap = config.asteroidField.maxWrongShotsPerRound;
    return cap > 0 ? cap : undefined;
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
    this.roundWrongShots = 0;
    this.fireCooldownUntilMs = 0;
    this.fireButton = null;

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
    // Sprint 2.4.1 audit fix — store the ref so the wrong-shot cooldown
    // can lock/unlock the button visually.
    this.fireButton = new TouchFireButton({
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

    // Sprint 2.2 story 15c — translucent "Drag here to aim" hint on
    // the left half of the playfield. Shown on Q1 of every round
    // (visibility flips inside startNextQuestion), hidden on Q2+. Also
    // dismisses on the first playfield pointerdown of Q1 — kid touched,
    // gesture learned, no further hand-holding needed.
    this.buildAimHint();

    this.startNextQuestion();

    this.events.once('shutdown', () => this.cleanup());
  }

  /**
   * Sprint 2.2 story 15c — translucent aim-zone hint, centered in the
   * LEFT HALF of the playfield. The hand emoji + "Drag to aim" label
   * tell the kid both WHAT to do and WHERE the touch zone is. Built
   * ONCE per scene-create (the same Container is reused across rounds);
   * visibility flips per question via `showAimHint` / `hideAimHint`.
   *
   * Pulses subtly (1.0 → 0.65 alpha over 800ms, yoyo) to draw eye
   * without screaming for attention. Lives at depth 50 — above gameplay
   * sprites + asteroids but below the HUD overlay.
   *
   * Dismiss on first pointerdown of Q1: once the kid touches anywhere
   * in the playfield, the gesture is learned and the hint becomes
   * noise. Scene-level pointerdown listener for that question only;
   * cleared on hide.
   */
  private buildAimHint(): void {
    // Touch-primary devices only — mouse/trackpad users get instant
    // pointer-follow aim, no gesture to learn → no hint needed. Skip
    // the build entirely on desktop to save the GameObjects + tween.
    if (!isTouchPrimary()) return;

    // Lower-left corner, just above the footer / FIRE-button stack.
    // Hint is a smaller pill than the centered version so it sits in
    // the corner without crowding the aim zone — the kid's drags can
    // happen in the same left half WITHOUT touching the hint pill.
    const W = 200;
    const H = 84;
    const margin = 12;
    const cx = this.leftBound + W / 2 + margin;
    const cy = this.bottomBound - H / 2 - margin;

    const container = this.add.container(cx, cy);

    const bg = this.add.rectangle(0, 0, W, H, 0x000000, 0.55);
    bg.setStrokeStyle(2, 0x60a5fa, 0.75);
    bg.setOrigin(0.5);

    // Hand emoji + label laid out horizontally so the pill stays short.
    const handIcon = this.add.text(-W / 2 + 32, 0, '👆', { fontSize: '40px' }).setOrigin(0.5);
    const label = text(this, 16, 0, 'Drag to aim', 'rowLabel').setOrigin(0.5);

    container.add([bg, handIcon, label]);
    container.setDepth(50);
    container.setVisible(false); // initial state — startNextQuestion toggles on Q1

    this.tweens.add({
      targets: container,
      alpha: { from: 1.0, to: 0.65 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    this.aimHint = container;
  }

  private showAimHint(): void {
    if (!this.aimHint) return;
    this.aimHint.setVisible(true);
    // Dismiss-on-touch listener — fires ONCE per Q1 show. `pointerdown`
    // on the scene's input is global; the gesture is learned the
    // moment the kid touches anywhere, so we don't need a region check.
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.hideAimHint());
  }

  private hideAimHint(): void {
    if (!this.aimHint) return;
    this.aimHint.setVisible(false);
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
    // Sprint 2.4.1 story 2 — FIRE-input lockout after a wrong shot.
    // The kid's tap / click / Space is BLOCKED during the cooldown
    // window. Sprint 2.4.1 audit fix: instead of silent rejection,
    // play a soft "click" so the kid registers "I tried; it didn't
    // fire because of the penalty," not "the button is broken."
    // Combined with the TouchFireButton.setLocked() dim visual
    // applied in handleHit (wrong branch), the kid gets BOTH a
    // visible "not available" state AND an audible "you tried."
    if (this.time.now < this.fireCooldownUntilMs) {
      getAudioManager().play(SfxKeys.ButtonClick1, 'sfx');
      return;
    }
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
      // Sprint 2.4.1 story 2 — round-wide wrong-shot counter +
      // FIRE-input cooldown. Increment FIRST so the new value is in
      // play before any branching; then arm the cooldown so a queued
      // tap during the asteroid's explode anim can't slip a second
      // wrong shot through. Cache the cooldown ms once so the log,
      // the gate, AND the delayed unlock all read the same value
      // (Senior Dev audit — protects against a hypothetical mid-
      // round config hot-reload observing inconsistent state).
      const cooldownMs = config.asteroidField.fireCooldownAfterWrongShotMs;
      const cap = config.asteroidField.maxWrongShotsPerRound;
      this.roundWrongShots += 1;
      this.fireCooldownUntilMs = this.time.now + cooldownMs;
      // Sprint 2.4.1 audit fix — visible cooldown state. Lock now;
      // schedule the unlock for cooldownMs later. The unlock is
      // skipped (no-op) if the scene has transitioned away or the
      // round-wide cap fires below — `setLocked` is idempotent so
      // a stale unlock after teardown is harmless.
      this.fireButton?.setLocked(true);
      this.time.delayedCall(cooldownMs, () => {
        this.fireButton?.setLocked(false);
      });
      // Sprint 2.4.1 audit fix — surface the round-wide cap to the
      // HUD's lives row (same `strikesChanged` event Number Climb
      // emits; HudScene.maybeBuildLivesDots auto-renders for any
      // mode that implements getMaxStrikes on the contract).
      this.events.emit('strikesChanged', {
        strikesUsed: this.roundWrongShots,
        maxStrikes: cap,
        remaining: Math.max(0, cap - this.roundWrongShots),
      });
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
        // Sprint 2.4.1 story 2 — surface the round-wide counter so
        // analytics can see "kids who failed via wrong-shot exhaustion"
        // separately from per-question wrong shots.
        strikesUsed: String(this.roundWrongShots),
        maxStrikes: String(cap),
      });

      // Sprint 2.4.1 story 2 — round-wide cap. When `maxWrongShotsPerRound`
      // is hit, the round ends early as a fail. The current question's
      // wrong-shot flag is already set on the wave system, so the
      // round-fail flow records the question as wrong + transitions
      // to GameOver.
      if (cap > 0 && this.roundWrongShots >= cap) {
        this.handleRoundWrongShotBudgetExhausted();
      }
    }
  }

  /**
   * Sprint 2.4.1 story 2 — round-wide wrong-shot budget exhausted.
   * Behaves like a per-question timeout-fail (record the current
   * question wrong, fade survivors) but ALSO routes directly to
   * `endRound()` instead of `afterQuestion()` so the kid doesn't get
   * another question after blowing the budget.
   *
   * Centered "Out of shots!" banner mirrors Climb's "Out of time!"
   * pattern (sprint 2.2.1 story 2) so the kid registers the round-
   * ending cause rather than the asteroid fade reading as a generic
   * "everything stopped". Banner holds ~700ms before GameOver mounts.
   */
  private handleRoundWrongShotBudgetExhausted(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    _th.logToAi('AsteroidField.roundWrongShotBudgetExhausted', SeverityLevel.Information, {
      gameId: this.gameId,
      questionIndex: String(this.roundController.questionIndex),
      strikesUsed: String(this.roundWrongShots),
      maxStrikes: String(config.asteroidField.maxWrongShotsPerRound),
      mathId: this.mathId,
      speed: this.speed,
    });
    // Record the in-flight question as wrong (with usedWrongShot flag).
    this.roundController.recordOutcome({
      wasCorrect: false,
      usedWrongShot: this.waveSystem.hasUsedWrongShot(),
    });
    this.events.emit('questionEnded', {
      wasCorrect: false,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });
    // Visual + audible round-ending cue — mirrors the timeout treatment
    // so the two failure modes share visual vocabulary.
    getAudioManager().play(SfxKeys.TimeoutFail1, 'sfx');
    this.cameras.main.flash(180, 239, 68, 68, false);
    this.cameras.main.shake(180, 0.006);

    const banner = text(
      this,
      this.scale.width / 2,
      this.scale.height / 2,
      'Out of shots!',
      'warning',
    ).setOrigin(0.5);
    banner.setScrollFactor(0);
    banner.setDepth(100);
    banner.setStroke('#0b1020', 8);
    banner.setShadow(0, 3, '#0b1020', 6, true, true);

    // Fade the surviving asteroids in parallel so the playfield
    // visually settles before GameOver mounts. The fade tween is
    // 250 ms (see Asteroid.playFadeOut), comfortably under the
    // 700 ms banner hold below — so fades always complete before
    // endRound() destroys the scene + its tweens. If a future
    // refactor lengthens the fade past 700 ms, bump this delay
    // to match (or chain the endRound off the last-fade
    // completion callback).
    const survivors = this.waveSystem.liveAsteroids();
    for (const s of survivors) {
      s.playFadeOut(() => {
        // No-op — banner timer drives the actual endRound call.
      });
    }
    this.time.delayedCall(700, () => {
      banner.destroy();
      this.endRound();
    });
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
    // Sprint 2.4.1 story 2 — clear any wrong-shot cooldown that was
    // still ticking at end-of-previous-question. The deterrent's job
    // is to slow the kid WITHIN a question (no rapid-fire through the
    // answer set); a fresh question shouldn't punish them for a tap
    // they made before the wave switched.
    this.fireCooldownUntilMs = 0;

    // Sprint 2.2 story 15c — aim hint visible only on Q1.
    if (this.roundController.questionIndex === 0) {
      this.showAimHint();
    } else {
      this.hideAimHint();
    }

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
