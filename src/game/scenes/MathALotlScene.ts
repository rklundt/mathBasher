// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { RoundController } from '@/game/services/RoundController';
import { GameSceneLifecycle } from '@/game/services/GameSceneLifecycle';
import type { GameSceneContract } from '@/game/scenes/gameSceneContract';
import type { Question } from '@/math/types';
import { Axolotl } from '@/game/entities/Axolotl';
import { AnswerBubble } from '@/game/entities/AnswerBubble';
import { ReefDecor } from '@/game/systems/ReefDecor';
import {
  buildBubbleWave,
  clampToWater,
  hasEscaped,
  isWithinCatch,
  pickTappedBubble,
} from '@/game/systems/mathALotlMath';
import { resolveStrike } from '@/game/systems/numberClimbFloorMath';
import { getAudioManager } from '@/services/audioManagerFactory';
import { pickRandomBubblePopSfx, pickRandomHitWrongSfx, SfxKeys } from '@/core/audioKeys';
import { ParticleSpriteKeys, pickRandomAxolotlSpriteKey } from '@/core/spriteKeys';
import { text } from '@/game/ui/typography';

/** Taps this far outside a bubble's drawn edge (as a radius multiple) still count as hitting it. */
const TAP_SLOP = 1.25;
const NUMBER_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'] as const;

/**
 * Math-a-lotl — sprint 2.5.4's fourth game mode.
 *
 * Round structure:
 *   1. Kid picks Math-a-lotl → Difficulty (Easy / Medium / Hard) → here.
 *   2. Each problem spawns `config.mathALotl.speed[speed].bubbleCount`
 *      answer bubbles below the sea floor; they rise and sway.
 *   3. Tap a bubble (or press 1–4, left to right) → the axolotl swims
 *      to it and catches it with its mouth. Tap open water → it swims
 *      there.
 *   4. Right bubble → pop + happy face → next problem.
 *      Wrong bubble → wobble-pop, one of the round's 3 hearts is lost,
 *      the problem stays (half points once solved). Last heart → round over.
 *      Right bubble reaches the surface uncaught → no penalty; the wave
 *      pops and the same problem re-spawns.
 *      Countdown hits zero (per question, NOT reset by a re-spawn) →
 *      "Out of time!", the question is missed, next problem. No heart lost.
 *   5. 12 problems → GameOverScene (shared scoring / stars).
 */
export class MathALotlScene extends Phaser.Scene implements GameSceneContract {
  static readonly key = SceneKeys.MathALotl;
  private readonly gameId = 'math-a-lotl' as const;
  private readonly cfg = config.mathALotl;

  private mathId!: MathId;
  private speed!: SpeedKey;
  private roundController!: RoundController;
  private lifecycle!: GameSceneLifecycle;
  private axolotl!: Axolotl;
  private decor!: ReefDecor;

  private bubbles: AnswerBubble[] = [];
  /** The bubble the axolotl is chasing (null = swimming to a spot or resting). */
  private chasing: AnswerBubble | null = null;
  private currentQuestion: Question | null = null;
  private livesUsed = 0;
  private usedWrongCatch = false;
  /** Per-question countdown remaining (ms); ticks only while the question is in play. */
  private countdownMs = 0;
  private transitioning = false;
  private paused = false;
  private tapHint?: Phaser.GameObjects.Container;

  private waterlineY = 0;
  private water = { left: 0, right: 0, top: 0, bottom: 0 };

  constructor() {
    super(MathALotlScene.key);
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

  getStrikesRemaining(): number {
    return Math.max(0, this.cfg.maxLives - this.livesUsed);
  }

  getMaxStrikes(): number {
    return this.cfg.maxLives;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** GameSceneContract — seconds left on this question's countdown (HUD timer). */
  getCountdownSec(): number | undefined {
    if (!this.currentQuestion) return undefined;
    return Math.max(0, this.countdownMs / 1000);
  }

  // ----- Lifecycle ---------------------------------------------------------

  create(): void {
    // Phaser reuses scene instances — reset every stateful field.
    this.bubbles = [];
    this.chasing = null;
    this.currentQuestion = null;
    this.livesUsed = 0;
    this.usedWrongCatch = false;
    this.countdownMs = 0;
    this.transitioning = false;
    this.paused = false;
    this.tapHint = undefined;

    const { mathId, speed } = Settings.round;
    this.mathId = mathId ?? 'add-to-10';
    this.speed = speed ?? 'medium';

    const { width, height } = this.scale;
    this.waterlineY = height * this.cfg.waterlineFrac;
    const m = this.cfg.axolotl.edgeMarginPx;
    this.water = { left: m, right: width - m, top: this.waterlineY + m, bottom: height - m };

    this.decor = new ReefDecor(this, { width, waterlineY: this.waterlineY, floorY: height });
    this.axolotl = new Axolotl(this, width / 2, (this.water.top + this.water.bottom) / 2, pickRandomAxolotlSpriteKey());
    this.axolotl.sprite.setDepth(20);

    this.roundController = new RoundController(this.mathId, this.speed);
    this.lifecycle = new GameSceneLifecycle({
      scene: this,
      gameId: this.gameId,
      mathId: this.mathId,
      speed: this.speed,
      roundController: this.roundController,
    });
    this.lifecycle.enter();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    NUMBER_KEYS.forEach((name, i) => {
      this.input.keyboard?.on(`keydown-${name}`, () => this.pickByIndex(i));
    });

    this.buildTapHint();
    this.startNextQuestion();
    this.events.once('shutdown', () => this.cleanup());
  }

  override update(_time: number, dt: number): void {
    if (this.paused) return;
    this.decor.update(dt);
    for (const b of this.bubbles) b.update(dt);
    this.axolotl.update(dt);
    // Never leave the water — a chase toward a bubble still rising up
    // from below the floor waits at the bottom instead of following it
    // off screen.
    const p = clampToWater(this.axolotl.x, this.axolotl.y, this.water);
    this.axolotl.sprite.setPosition(p.x, p.y);
    if (this.transitioning) return;

    this.countdownMs -= dt;
    if (this.countdownMs <= 0) {
      this.handleTimeout();
      return;
    }

    // Catch: the axolotl only catches the bubble it was sent after, so
    // swimming past a wrong bubble on the way never costs a heart.
    const target = this.chasing;
    if (target?.alive && isWithinCatch(this.axolotl.headPoint(), target, target.radius, this.cfg.axolotl.catchRadiusPx)) {
      this.handleCatch(target);
      return;
    }

    // Escapes at the surface.
    const correct = this.currentQuestion?.correctAnswer;
    for (const b of this.bubbles) {
      if (!b.alive || !hasEscaped(b.y, b.radius, this.waterlineY)) continue;
      if (b.answer === correct) {
        this.handleCorrectEscaped();
        return;
      }
      if (this.chasing === b) this.stopChase();
      b.popQuiet();
    }
    this.bubbles = this.bubbles.filter((b) => b.alive);
  }

  // ----- Input -------------------------------------------------------------

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (this.paused || this.transitioning) return;
    this.hideTapHint();
    const live = this.bubbles.filter((b) => b.alive);
    const i = pickTappedBubble({ x: pointer.worldX, y: pointer.worldY }, live, this.cfg.bubble.diameterPx / 2, TAP_SLOP);
    if (i >= 0) {
      this.chaseBubble(live[i]!);
      return;
    }
    // Open water (taps in the sky band just swim to the top of the water).
    this.stopChase();
    const p = clampToWater(pointer.worldX, pointer.worldY, this.water);
    this.axolotl.swimTo(p.x, p.y);
  }

  /** Keyboard: 1–4 pick the VISIBLE live bubbles left to right. */
  private pickByIndex(index: number): void {
    if (this.paused || this.transitioning) return;
    const height = this.scale.height;
    const live = this.bubbles.filter((b) => b.alive && b.y < height).sort((a, b) => a.x - b.x);
    const b = live[index];
    if (b) {
      this.hideTapHint();
      this.chaseBubble(b);
    }
  }

  private chaseBubble(b: AnswerBubble): void {
    this.chasing = b;
    this.axolotl.chase(() => (b.alive ? { x: b.x, y: b.y } : null));
  }

  private stopChase(): void {
    this.chasing = null;
    this.axolotl.stop();
  }

  // ----- Outcomes ----------------------------------------------------------

  private handleCatch(b: AnswerBubble): void {
    this.stopChase();
    if (b.answer === this.currentQuestion?.correctAnswer) {
      this.handleCorrectCatch(b);
    } else {
      this.handleWrongCatch(b);
    }
  }

  private handleCorrectCatch(b: AnswerBubble): void {
    this.transitioning = true;
    const { scoreDelta } = this.roundController.recordOutcome({
      wasCorrect: true,
      usedWrongShot: this.usedWrongCatch,
    });
    this.events.emit('correctHit', { x: b.x, y: b.y, scoreDelta });
    getAudioManager().play(pickRandomBubblePopSfx(), 'sfx');
    this.playSparkle(b.x, b.y);
    this.axolotl.playHappy();
    b.popCorrect();
    for (const other of this.bubbles) other.popQuiet();
    this.time.delayedCall(this.cfg.nextQuestionDelayMs, () => this.afterQuestion(true));
  }

  private handleWrongCatch(b: AnswerBubble): void {
    this.usedWrongCatch = true;
    getAudioManager().play(pickRandomHitWrongSfx(), 'sfx');
    b.popWrong();
    this.cameras.main.shake(120, 0.004);
    const strike = resolveStrike(this.livesUsed, this.cfg.maxLives);
    this.livesUsed = strike.strikesAfter;
    this.events.emit('strikesChanged', {
      strikesUsed: this.livesUsed,
      maxStrikes: this.cfg.maxLives,
      remaining: strike.remaining,
    });
    _th.logToAi('WrongCatch', SeverityLevel.Information, {
      ...this.questionProps(),
      strikesUsed: String(this.livesUsed),
      maxStrikes: String(this.cfg.maxLives),
    });
    if (strike.exhausted) this.handleOutOfHearts();
  }

  /** The right answer floated to the surface: no penalty, same problem again. */
  private handleCorrectEscaped(): void {
    this.transitioning = true;
    this.stopChase();
    _th.logToAi('BubbleEscaped', SeverityLevel.Information, this.questionProps());
    for (const b of this.bubbles) b.popQuiet();
    const note = text(this, this.scale.width / 2, this.waterlineY + 70, 'It floated away! Here it comes again', 'rowLabel')
      .setOrigin(0.5)
      .setDepth(100);
    note.setStroke('#0b1020', 6);
    this.tweens.add({ targets: note, alpha: 0, delay: 900, duration: 400, onComplete: () => note.destroy() });
    this.time.delayedCall(this.cfg.respawnDelayMs, () => {
      this.spawnWave();
      this.transitioning = false;
    });
  }

  /** Countdown hit zero: the question is missed (no heart lost), next problem. */
  private handleTimeout(): void {
    this.transitioning = true;
    this.countdownMs = 0;
    this.stopChase();
    this.roundController.recordOutcome({ wasCorrect: false, usedWrongShot: this.usedWrongCatch });
    getAudioManager().play(SfxKeys.TimeoutFail1, 'sfx');
    for (const b of this.bubbles) b.popQuiet();
    const banner = text(this, this.scale.width / 2, this.scale.height / 2, 'Out of time!', 'warning')
      .setOrigin(0.5)
      .setDepth(100);
    banner.setStroke('#0b1020', 8);
    banner.setShadow(0, 3, '#0b1020', 6, true, true);
    this.time.delayedCall(this.cfg.timeoutBannerMs, () => {
      banner.destroy();
      this.afterQuestion(false);
    });
  }

  private handleOutOfHearts(): void {
    this.transitioning = true;
    this.stopChase();
    _th.logToAi('MathALotl.outOfHearts', SeverityLevel.Information, this.questionProps());
    this.roundController.recordOutcome({ wasCorrect: false, usedWrongShot: true });
    this.events.emit('questionEnded', {
      wasCorrect: false,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });
    // No extra end cue: the wrong-catch sound that spent the last heart
    // just played. (TimeoutFail1 is scoped to Asteroid Field's bundle.)
    for (const b of this.bubbles) b.popQuiet();
    const banner = text(this, this.scale.width / 2, this.scale.height / 2, 'Out of hearts!', 'warning')
      .setOrigin(0.5)
      .setDepth(100);
    banner.setStroke('#0b1020', 8);
    banner.setShadow(0, 3, '#0b1020', 6, true, true);
    this.time.delayedCall(1200, () => this.endRound());
  }

  private playSparkle(x: number, y: number): void {
    const burst = this.add.particles(x, y, ParticleSpriteKeys.Star05, {
      speed: { min: 60, max: 180 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 450,
      tint: [0xffffff, 0xffd1e8, 0xbfe3ff],
      blendMode: 'ADD',
      emitting: false,
    });
    burst.setDepth(30);
    burst.explode(14);
    this.time.delayedCall(550, () => burst.destroy());
  }

  // ----- Question flow -----------------------------------------------------

  private afterQuestion(wasCorrect: boolean): void {
    _th.logToAi('QuestionEnded', SeverityLevel.Information, {
      ...this.questionProps(),
      wasCorrect: String(wasCorrect),
      usedWrongShot: String(this.usedWrongCatch),
    });
    this.events.emit('questionEnded', {
      wasCorrect,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });
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
    this.usedWrongCatch = false;
    this.countdownMs = this.cfg.speed[this.speed].countdownSec * 1000;
    this.spawnWave();
    if (this.roundController.questionIndex === 0) this.showTapHint();
    _th.logToAi('QuestionStarted', SeverityLevel.Information, this.questionProps());
    this.events.emit('questionStarted', {
      question,
      index: this.roundController.questionIndex,
      total: this.roundController.questionsPerRound,
    });
  }

  private spawnWave(): void {
    const q = this.currentQuestion;
    if (!q) return;
    for (const b of this.bubbles) b.destroy();
    const { width, height } = this.scale;
    const speedCfg = this.cfg.speed[this.speed];
    const r = this.cfg.bubble.diameterPx / 2;
    const specs = buildBubbleWave({
      choices: q.choices,
      correctAnswer: q.correctAnswer,
      choiceDisplays: q.choiceDisplays,
      count: speedCfg.bubbleCount,
      leftX: r + this.cfg.bubble.swayPx,
      rightX: width - r - this.cfg.bubble.swayPx,
      startY: height + r,
      staggerPx: this.cfg.bubble.spawnStaggerPx,
      jitterPx: this.cfg.bubble.laneJitterPx,
      rng: Math.random,
    });
    this.bubbles = specs.map(
      (s) => new AnswerBubble(this, { ...s, risePxPerSec: speedCfg.risePxPerSec, floorY: height }),
    );
  }

  private questionProps(): TelemetryProps {
    return {
      gameId: this.gameId,
      questionIndex: String(this.roundController.questionIndex),
      mathId: this.mathId,
      speed: this.speed,
    };
  }

  // ----- First-question hint -----------------------------------------------

  /** "Tap a bubble!" pill on Q1 only; dismissed by the first tap. */
  private buildTapHint(): void {
    const W = 240;
    const H = 64;
    const container = this.add.container(this.scale.width / 2, this.waterlineY + 70);
    const bg = this.add.rectangle(0, 0, W, H, 0x0b1020, 0.5).setStrokeStyle(2, 0xffffff, 0.7);
    const label = text(this, 0, 0, '👆 Tap a bubble!', 'rowLabel').setOrigin(0.5);
    container.add([bg, label]);
    container.setDepth(50).setVisible(false);
    this.tweens.add({ targets: container, alpha: { from: 1, to: 0.6 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.tapHint = container;
  }

  private showTapHint(): void {
    this.tapHint?.setVisible(true);
  }

  private hideTapHint(): void {
    this.tapHint?.setVisible(false);
  }

  // ----- End / cleanup -----------------------------------------------------

  private endRound(): void {
    this.lifecycle.endRound();
  }

  private cleanup(): void {
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    for (const name of NUMBER_KEYS) this.input.keyboard?.off(`keydown-${name}`);
    for (const b of this.bubbles) b.destroy();
    this.bubbles = [];
    this.chasing = null;
    this.axolotl?.destroy();
    this.decor?.destroy();
    this.lifecycle.exit();
  }

  // ----- Pause / resume / quit ---------------------------------------------

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.time.paused = true;
    this.axolotl.pause();
    this.decor.pause();
    this.lifecycle.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.time.paused = false;
    this.axolotl.resume();
    this.decor.resume();
    this.lifecycle.resume();
  }

  quitToMenu(): void {
    this.time.paused = false;
    this.lifecycle.quitToMenu();
  }
}
