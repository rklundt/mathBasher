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
import { Hero } from '@/game/entities/Hero';
import { Projectile } from '@/game/entities/Projectile';
import type { Alien } from '@/game/entities/Alien';
// `Alien` is used as a type-only import for handleHit's parameter.
import { WaveSystem } from '@/game/systems/WaveSystem';
import { HitSystem } from '@/game/systems/HitSystem';
import { InputSystem } from '@/game/systems/InputSystem';
import { getAudioManager } from '@/services/audioManagerFactory';
import { createAlienAnims } from '@/game/services/alienAnims';
import { GameSceneLifecycle } from '@/game/services/GameSceneLifecycle';
import {
  SfxKeys,
  GAME_MIDGROUND_MAP,
  pickRandomHitCorrectSfx,
  pickRandomHitWrongSfx,
} from '@/core/audioKeys';
import { ParticleSpriteKeys } from '@/core/spriteKeys';
import { TouchFireButton } from '@/game/ui/TouchFireButton';

/**
 * The actual game. One round = `config.round.questionsPerRound` questions.
 * Each question = one wave of 4 aliens descending; the hero auto-runs along
 * the bottom; the player times Space / click / tap to fire upward.
 *
 * Per-question outcomes (from gameplay events to ScoreCalculator):
 *   - Hit the alien with the correct answer  -> wasCorrect: true
 *   - Hit a wrong alien                       -> applyWrongShotPenalty(),
 *                                                wave continues; player keeps
 *                                                shooting until they hit the
 *                                                right one OR aliens land
 *   - Aliens reach the hero                   -> wasCorrect: false (timeout)
 *
 * The wrong-shot penalty halves points awarded for the EVENTUAL correct
 * answer that question (per ScoreCalculator's `usedWrongShot` flag).
 *
 * Telemetry events emitted (matched by HudScene):
 *   - 'questionStarted' { question, index, total }
 *   - 'questionEnded'   { wasCorrect, score, correctCount }
 *   - 'correctHit'      { x, y, scoreDelta }
 *     Fires from `handleHit` IMMEDIATELY when the correct alien is hit
 *     (before the explode anim plays). HudScene uses this to spawn the
 *     "+N" score popup at the alien's position rather than at the HUD
 *     bar's corner (sprint 0.7 Story 8). Separate event from
 *     `questionEnded` because `questionEnded` fires AFTER the wave's
 *     other aliens have faded out, by which point the hit alien is
 *     gone and its position is lost.
 */
export class GameScene extends Phaser.Scene implements GameSceneContract {
  static readonly key = SceneKeys.Game;
  /**
   * Game-mode identifier used in every telemetry props object emitted
   * by this scene + the defensive `Settings.setGameId` invariant. Same
   * pattern as `AsteroidFieldScene.gameId` — a typo in one literal
   * can't silently fork the App Insights stream.
   */
  private readonly gameId = 'alien-shoot' as const;

  // Configured at create()
  private mathId!: MathId;
  private speed!: SpeedKey;
  private hero!: Hero;
  private waveSystem!: WaveSystem;
  private inputSystem!: InputSystem;
  /**
   * Round controller: owns question-loop bookkeeping (current index,
   * anti-repeat sliding window, score). Reset each round in create()
   * (Phaser scene-instance reuse — same gotcha as HudScene.progressDots
   * in sprint 1.1 wrap-up). Extracted in sprint 2.1 so AsteroidFieldScene
   * can share the same bookkeeping without duplicating the anti-repeat code.
   */
  private roundController!: RoundController;
  /**
   * Sprint 2.1.9 — game-mode-agnostic scene lifecycle (audio loops,
   * HUD launch, pause/resume, endRound transition, telemetry).
   * Constructed in `create()` after `mathId`/`speed`/`roundController`
   * are populated.
   */
  private lifecycle!: GameSceneLifecycle;

  private projectile: Projectile | null = null;
  private currentQuestion: Question | null = null;
  private transitioning = false;
  private paused = false;

  /**
   * Snapshot of the in-flight question, exposed so HudScene can sync up after
   * its own `create()` runs (Phaser launches parallel scenes asynchronously,
   * so HudScene's listener bind can race with the first `questionStarted`
   * emit). Null between rounds and after the last question.
   */
  getCurrentQuestionPayload(): { question: Question; index: number; total: number } | null {
    if (!this.currentQuestion) return null;
    return {
      question: this.currentQuestion,
      index: this.roundController.questionIndex,
      total: config.round.questionsPerRound,
    };
  }

  constructor() {
    super(GameScene.key);
  }

  // Sprint 2.1.9 — preload() removed. The per-game asset bundle is
  // loaded by `LoadingScene` (sprint 2.1.8) before this scene mounts,
  // so by the time GameScene's create() runs every key is already
  // cached. The previous `loadGameBundle + attachLoadingOverlay` here
  // was a no-op (totalToLoad === 0 → overlay short-circuited) and
  // existed only as a "direct-entry safety net" — but no direct-entry
  // path exists in production (DifficultyScene always routes through
  // LoadingScene; GameOver Play Again routes back through it; Phaser
  // hot-reload re-runs BootScene). Removing the redundant calls
  // makes "what assets does this scene depend on?" answerable in
  // one place (the manifest scope tags).


  create(): void {
    // Sprint 2.1.6 — register alien animations after preload completes.
    // The helper is idempotent (skips already-registered + skips
    // textures not yet loaded) so multiple call sites are safe. While
    // alien sprites are still eager-loaded (pre-story-7), the
    // BootScene.create call already registered them and this is a
    // no-op; once story 7 ships, GameScene's preload loads the
    // spritesheets and this call does the registration.
    createAlienAnims(this);

    const { mathId, speed } = Settings.round;
    // Defensive defaults — DifficultyScene gates progress on isReady() so
    // these should always be set, but if a future flow lands here without
    // selections (e.g. dev hotload), pick reasonable fallbacks.
    this.mathId = mathId ?? 'add-to-10';
    this.speed = speed ?? 'medium';

    const { width, height } = this.scale;
    const padding = config.layout.safeAreaPaddingPx;
    const leftBound = padding + 24;
    const rightBound = width - padding - 24;
    const heroY = height - 80;
    const spawnY = 40;

    this.hero = new Hero(this, width / 2, heroY, leftBound, rightBound);

    const speedConfig = config.scoring.speed[this.speed];
    this.waveSystem = new WaveSystem({
      scene: this,
      lanes: config.layout.targetLanes,
      descentSpeedPxPerSec: speedConfig.descentPxPerSec,
      penaltyPxPerSec: speedConfig.penaltyPxPerSec,
      leftBound,
      rightBound,
      spawnY,
      heroY: heroY - 40, // contact line slightly above the hero's center
    });

    // Fresh RoundController per round. Phaser reuses the same scene
    // instance, so we explicitly construct here rather than relying on
    // class-field initializers (which only run once per Phaser scene
    // instance — same gotcha as HudScene.progressDots in sprint 1.1
    // wrap-up). The constructor also resets anti-repeat history and
    // questionIndex.
    this.roundController = new RoundController(this.mathId, this.speed);
    this.transitioning = false;
    this.paused = false;

    this.inputSystem = new InputSystem(this);
    this.inputSystem.onFire(() => this.handleFire());

    // On-screen FIRE button for touch devices. Hidden on desktop unless
    // a touch event fires (Surface / Chromebook with both keyboard + touch
    // can use either). The button calls InputSystem.fire() — same code
    // path as Space / canvas-tap; cooldown applies. The button itself
    // stops pointerdown propagation so the canvas-wide tap-to-fire
    // listener doesn't double-count. See sprint 0.6 Story 3 + Story 4
    // for the full design rationale.
    new TouchFireButton({
      scene: this,
      onFire: () => this.inputSystem.fire(),
    });

    // Sprint 2.1.9 — game-mode-agnostic lifecycle (defensive
    // Settings.setGameId, telemetry, HUD launch, audio loop start)
    // consolidated into the helper. Must be called AFTER subsystem
    // construction so the audio loops attach to the live scene + the
    // HUD's events binding sees the scene as ready.
    this.lifecycle = new GameSceneLifecycle({
      scene: this,
      gameId: this.gameId,
      mathId: this.mathId,
      speed: this.speed,
      roundController: this.roundController,
    });
    this.lifecycle.enter();

    this.startNextQuestion();

    // setupScene already registered a shutdown listener for the standard
    // GameScene Completed log; this additional listener handles round
    // cleanup (stopping loops, tearing down systems). Multiple shutdown
    // listeners run independently — both fire on stop / scene transition.
    this.events.once('shutdown', () => {
      this.cleanup();
    });
  }

  override update(_time: number, dt: number): void {
    if (this.transitioning) return;
    if (this.paused) return;
    this.hero.update(dt);

    // Wave step
    const outcome = this.waveSystem.update(dt);
    if (outcome === 'reached-hero') {
      this.handleTimeout();
      return;
    }

    // Projectile step + collision
    if (this.projectile) {
      const stillAlive = this.projectile.advance(dt);
      if (!stillAlive || this.projectile.topY() < 0) {
        this.projectile.kill();
        this.projectile = null;
      } else {
        const hit = HitSystem.findHit(this.projectile, this.waveSystem.liveAliens());
        if (hit) {
          this.projectile.kill();
          this.projectile = null;
          this.handleHit(hit);
        }
      }
    }
  }

  private handleFire(): void {
    if (this.transitioning) return;
    if (this.projectile) return; // one in flight at a time
    // Play SFX BEFORE spawning the projectile so the sound is sample-aligned
    // with the visual fire. Phaser caches the decoded buffer at preload, so
    // play() is effectively zero-latency. AudioManager respects the mute
    // toggle + per-kind volume slider; if init() hasn't fired yet (e.g. dev
    // hot reload skips MenuScene) play() is a silent no-op rather than a
    // crash. Kind is explicit ('sfx') for clarity even though it's the
    // default — makes the playback category obvious at the call site.
    getAudioManager().play(SfxKeys.Fire1, 'sfx');
    this.projectile = new Projectile(this, this.hero.x, this.hero.y - 40);
    this.playMuzzleFlash(this.hero.x, this.hero.y - 30);
  }

  /**
   * Sprint 0.7 Story 5 — brief muzzle flash at the hero's top edge on fire.
   *
   * A short-lived (~150ms) particle burst using `muzzle_03` tinted amber
   * to match the projectile + hero engine palette. Emits 4 small particles
   * with low spread so it reads as a single flash rather than a spray. The
   * emitter self-destructs after 200ms. Called per fire event from
   * `handleFire` — fire rate is bounded by the cooldown, so we never have
   * more than ~5 flashes per second.
   */
  private playMuzzleFlash(x: number, y: number): void {
    const flash = this.add.particles(x, y, ParticleSpriteKeys.Muzzle03, {
      speed: { min: 10, max: 40 },
      angle: { min: 260, max: 280 }, // mostly upward (270° = straight up)
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

  private handleHit(alien: Alien): void {
    const correct = this.waveSystem.isCorrectLane(alien.lane);
    if (correct) {
      this.transitioning = true;
      const usedWrongShot = this.waveSystem.hasUsedWrongShot();
      const { scoreDelta } = this.roundController.recordOutcome({
        wasCorrect: true,
        usedWrongShot,
      });
      // Emit `correctHit` so HudScene can spawn the "+N" score popup at
      // the alien's position (sprint 0.7 Story 8). Done HERE, before the
      // explode/fade chain — `questionEnded` (which fires later from
      // afterQuestion()) doesn't carry alien coords because by that
      // point the wave is fully gone.
      this.events.emit('correctHit', {
        x: alien.x,
        y: alien.y,
        scoreDelta,
      });
      this.hero.playHitAnim();
      // SFX BEFORE particle/visual feedback so the audio is sample-aligned
      // with the burst — Phaser caches decoded SFX at preload so play()
      // is effectively zero-latency. Random pick across 3 variants per
      // hit so the same chime doesn't loop 20× through a round.
      getAudioManager().play(pickRandomHitCorrectSfx(), 'sfx');
      this.playCorrectHitFeedback(alien.x, alien.y);
      alien.playExplodeAnim(true, () => {
        // Fade the rest of the wave smoothly so it doesn't snap-disappear.
        const survivors = this.waveSystem.liveAliens();
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
      // Wrong shot: explode the wrong alien, accelerate the rest, wave continues.
      this.waveSystem.applyWrongShotPenalty();
      // SFX BEFORE the visual burst (see comment in the correct-hit branch).
      // Random pick across 3 wrong-hit variants.
      getAudioManager().play(pickRandomHitWrongSfx(), 'sfx');
      this.playWrongHitFeedback(alien.x, alien.y);
      alien.playExplodeAnim(false, () => {
        // No state change beyond the alien being gone + speed boost applied.
      });
      _th.logToAi('WrongShot', SeverityLevel.Information, {
        questionIndex: String(this.roundController.questionIndex),
        mathId: this.mathId,
        speed: this.speed,
      });
    }
  }

  /**
   * Sprint 0.7 Story 4 — visual feedback for a correct hit.
   *
   * Two layers of effect:
   *   1. A green particle burst at the alien's position — `light_01` and
   *      `flare_01` mixed (additive blend) gives a "burst of light" look.
   *      ~12 particles, 400ms lifespan, fans outward.
   *   2. A brief screen flash (camera.flash) — green tint, 120ms — sells
   *      the "you got it right!" moment at a body-level (peripheral vision
   *      catches the flash even if eyes were on a different alien).
   *
   * The emitter is created on the fly and self-destructs after its
   * lifespan + buffer. No long-lived emitter pool — the rate of correct
   * hits is low (one per question max) and the JS GC handles the
   * short-lived particles fine.
   */
  private playCorrectHitFeedback(x: number, y: number): void {
    const burst = this.add.particles(x, y, ParticleSpriteKeys.Light01, {
      speed: { min: 60, max: 200 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 400,
      tint: 0x22c55e, // green
      blendMode: 'ADD',
      emitting: false,
    });
    burst.explode(12);
    this.time.delayedCall(500, () => burst.destroy());
    this.cameras.main.flash(120, 34, 197, 94, false); // green RGB
  }

  /**
   * Sprint 0.7 Story 4 — visual feedback for a wrong hit.
   *
   * Two layers of effect:
   *   1. A red particle burst at the alien's position — `spark_05` (faster,
   *      sharper than the correct-hit `light_01`) tinted red. ~15 particles
   *      with a slightly shorter lifespan than the correct burst (350ms vs
   *      400ms) so wrong-hits feel snappier / less rewarding.
   *   2. A camera shake — intensity 0.005, duration 150ms. Subtle but
   *      kinaesthetically noticeable; pairs with the red flash to sell
   *      "you got it wrong" without being punishing.
   *
   * No screen flash on wrong (the green flash on correct should remain
   * the more visually rewarding signal — red flash would compete and
   * confuse).
   */
  private playWrongHitFeedback(x: number, y: number): void {
    const burst = this.add.particles(x, y, ParticleSpriteKeys.Spark05, {
      speed: { min: 80, max: 250 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 350,
      tint: 0xef4444, // red
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
    // Stop the midground loop while the hero dies — the movement sound
    // shouldn't continue when the box is incapacitated. afterQuestion
    // restarts it before the next wave begins. Music keeps playing
    // through the death anim (the round isn't over). Sprint 2.1.9 —
    // read via GAME_MIDGROUND_MAP so a future game mode's per-mode
    // midground also stops correctly during its own death-equivalent
    // anim (though the hero-death pattern is currently Alien-Shoot-only).
    getAudioManager().stopLoop(GAME_MIDGROUND_MAP[this.gameId]);
    this.hero.playDeathAnim(() => {
      this.afterQuestion(false);
    });
  }

  private afterQuestion(wasCorrect: boolean): void {
    const props: TelemetryProps = {
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
    // Restart the per-game midground loop in case it was stopped during
    // the death anim. playLoop is a no-op if the loop is already
    // active (correct hits never stop it), so this is safe to call
    // unconditionally on every wave transition.
    getAudioManager().playLoop(GAME_MIDGROUND_MAP[this.gameId], 'midground');
    this.startNextQuestion();
  }

  private startNextQuestion(): void {
    // RoundController owns the anti-repeat sliding window + the question
    // index. drawNextQuestion returns null when the round is over.
    const question = this.roundController.drawNextQuestion();
    if (question === null) {
      this.endRound();
      return;
    }
    this.currentQuestion = question;
    this.waveSystem.spawnWave(this.currentQuestion);

    _th.logToAi('QuestionStarted', SeverityLevel.Information, {
      questionIndex: String(this.roundController.questionIndex),
      mathId: this.mathId,
      speed: this.speed,
    });
    this.events.emit('questionStarted', {
      question: this.currentQuestion,
      index: this.roundController.questionIndex,
      total: config.round.questionsPerRound,
    });
  }

  private endRound(): void {
    // Sprint 2.1.9 — round-end transition (SessionTotalScore, RoundEnded
    // telemetry, GameOver start) consolidated in the lifecycle helper.
    this.lifecycle.endRound();
  }

  private cleanup(): void {
    // Scene-specific subsystem teardown.
    this.projectile?.kill();
    this.projectile = null;
    this.waveSystem?.clearWave(true);
    this.inputSystem?.destroy();
    // Sprint 2.1.9 — audio-loop stops + parallel-scene shutdown
    // (HUD/Pause/Settings) consolidated in the lifecycle helper.
    this.lifecycle.exit();
  }

  // ----- Pause / resume / quit (sprint 0.5.1) ------------------------------

  isPaused(): boolean {
    return this.paused;
  }

  /** Questions COMPLETED so far (i.e. answered or timed out). Used by RoundAbandoned. */
  getQuestionsCompleted(): number {
    return this.roundController.questionIndex;
  }

  /**
   * Freeze the round. Stops alien descent (WaveSystem.pause), suppresses fire
   * input (InputSystem.setPaused), pauses HudScene's timers/animations
   * (scene.pause), and pauses every active tween scoped to this scene
   * (tweens.pauseAll). Pause is silent — score and round state are preserved
   * exactly. No auto-fail timeout: this is not a stealth difficulty mechanic.
   *
   * Idempotent: a second pause() call is a no-op.
   */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    // Subsystem-specific pause (game-mode-specific).
    this.waveSystem?.pause();
    this.inputSystem?.setPaused(true);
    // Sprint 2.1.9 — game-mode-agnostic pause (tweens, audio,
    // Hud, telemetry) consolidated in the lifecycle helper.
    this.lifecycle.pause();
  }

  /** Reverse `pause()`. Idempotent. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    // Subsystem-specific resume.
    this.waveSystem?.resume();
    this.inputSystem?.setPaused(false);
    // Sprint 2.1.9 — game-mode-agnostic resume.
    this.lifecycle.resume();
  }

  /**
   * Abandon the round and return to the title screen. NO score is saved
   * (per the sprint spec — abandonment is distinct from a completed round
   * and `RoundAbandoned` telemetry surfaces this for analysis).
   *
   * Cleanup is the same as scene shutdown — `cleanup()` runs via the
   * shutdown event when MenuScene takes over.
   */
  quitToMenu(): void {
    // Sprint 2.1.9 — RoundAbandoned telemetry + tweens.resumeAll +
    // scene.start(Menu) consolidated in the lifecycle helper.
    this.lifecycle.quitToMenu();
  }
}
