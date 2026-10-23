// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, questionSeconds, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { computeClimbStars } from '@/services/ScoreCalculator';
import { RoundController } from '@/game/services/RoundController';
import { GameSceneLifecycle } from '@/game/services/GameSceneLifecycle';
import type { GameSceneContract, QuitDestination } from '@/game/scenes/gameSceneContract';
import type { Question } from '@/math/types';
import { Penguin } from '@/game/entities/Penguin';
import { fishAnimKey, SlideFish } from '@/game/entities/SlideFish';
import {
  pickRowAnswers,
  QuestionClock,
  resolveRetryEvent,
  type OutcomeRecord,
  type RetryDecision,
  type RetryRoundState,
} from '@/game/systems/roundRules';
import {
  badgeScale,
  fishScale,
  inTapWindow,
  laneAt,
  laneCenters,
  laneForNumberKey,
  pickFishLooks,
  rowProgress,
  rowY,
  type LaneArea,
} from '@/game/systems/penguinSlideMath';
import {
  ParticleSpriteKeys,
  PenguinSlideSceneryKeys,
  SLIDE_FISH_SHEET,
  pickRandomPenguinSpriteKey,
} from '@/core/spriteKeys';
import { CALLOUT_INK_CSS } from '@/game/ui/uiPalette';
import { createTapHint, floatNote, screenBanner, type TapHint } from '@/game/ui/callouts';
import { NUMBER_KEYS } from '@/game/ui/numberKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import {
  pickRandomPenguinBonkSfx,
  pickRandomPenguinGulpSfx,
  pickRandomPenguinHopSfx,
  pickRandomPenguinSwishSfx,
  pickRandomPenguinYummySfx,
} from '@/core/audioKeys';
import { assertNever } from '@/shared/assertNever';

/**
 * Penguin Slide — sprint 2.7's seventh game mode.
 *
 * Round structure:
 *   1. The penguin sledges down a long snowy hill toward its igloo; the
 *      camera sits just behind it. Each question sends a row of fish (3 / 4 /
 *      5 by difficulty, exactly one right) from just below the horizon down
 *      toward it — the row's distance IS the countdown.
 *   2. Tap a fish, or anywhere in its lane (keys: ← / → choose a lane and
 *      Space grabs; 1–5 grab a lane directly). The penguin swoops over and
 *      the outcome plays when it arrives.
 *   3. Right fish → gulp, points, next question. Wrong fish → it's a
 *      snowball: BONK, a life lost, the same question with a fresh row. The
 *      row reaching the penguin → a tumble, "Out of time!", a life lost,
 *      same question. Last life → "Out of lives!" → round over.
 *   4. After 12 right answers the penguin slides off to the igloo:
 *      "You made it!" → GameOver.
 * Rules are the shared `resolveRetryEvent`; geometry is `penguinSlideMath`.
 * Stars mirror Frog Splash: by how many questions were answered.
 */
export class PenguinSlideScene extends Phaser.Scene implements GameSceneContract {
  static readonly key = SceneKeys.PenguinSlide;
  private readonly gameId = 'penguin-slide' as const;
  private readonly cfg = config.penguinSlide;

  private mathId!: MathId;
  private speed!: SpeedKey;
  private roundController!: RoundController;
  private lifecycle!: GameSceneLifecycle;
  private penguin!: Penguin;
  private area!: LaneArea;
  private lanes: number[] = [];
  private row: SlideFish[] = [];

  private currentQuestion: Question | null = null;
  /** The lane the penguin is in (or gliding to). */
  private lane = 0;
  private livesUsed = 0;
  private usedWrong = false;
  private answeredCount = 0;
  /** Input + countdown locked (swooping, a result playing, between questions). */
  private busy = false;
  private paused = false;
  private roundOver = false;
  /** Taps are ignored until this scene time (just after a row appears). */
  private inputOpenAt = 0;
  /** Sliding time left until the next ski-slide swoosh (counts only while the row is coming down). */
  private slideSoundInMs = 0;
  /** The game-loop frame the scene last resumed on: keys pressed to close Pause don't also grab. */
  private resumedFrame = -1;
  private readonly clock = new QuestionClock();
  private keyHandlers: Array<{ event: string; fn: () => void }> = [];
  private tapHint?: TapHint;

  constructor() {
    super(PenguinSlideScene.key);
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

  getCountdownSec(): number | undefined {
    if (!this.currentQuestion || this.roundOver) return undefined;
    return this.clock.remainingSec;
  }

  isPaused(): boolean {
    return this.paused;
  }

  // ----- Lifecycle ---------------------------------------------------------

  create(): void {
    // Phaser reuses scene instances — reset every stateful field.
    this.row = [];
    this.currentQuestion = null;
    this.livesUsed = 0;
    this.usedWrong = false;
    this.answeredCount = 0;
    this.busy = false;
    this.paused = false;
    this.roundOver = false;
    this.inputOpenAt = 0;
    this.resumedFrame = -1;
    this.clock.stop();
    this.time.paused = false;
    this.keyHandlers = [];
    this.tapHint = undefined;

    const { challengeId: mathId, speed } = Settings.round;
    this.mathId = mathId ?? 'add-to-10';
    this.speed = speed ?? 'medium';
    this.roundController = new RoundController(this.mathId, this.speed);

    this.buildWorld();

    this.lifecycle = new GameSceneLifecycle({
      scene: this,
      gameId: this.gameId,
      mathId: this.mathId,
      speed: this.speed,
      roundController: this.roundController,
    });
    this.lifecycle.enter();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    const key = (event: string, fn: () => void): void => {
      this.input.keyboard?.on(event, fn);
      this.keyHandlers.push({ event, fn });
    };
    key('keydown-LEFT', () => this.stepLane(-1));
    key('keydown-RIGHT', () => this.stepLane(1));
    // Space only: Enter would also press the HUD's focused Mute button.
    key('keydown-SPACE', () => this.grabFromKey(this.lane));
    NUMBER_KEYS.forEach((name, i) => key(`keydown-${name}`, () => this.numberKey(i)));

    this.buildTapHint();
    this.startNextQuestion();
    this.events.once('shutdown', () => this.cleanup());
  }

  private buildWorld(): void {
    const { width } = this.scale;
    this.add.image(0, 0, PenguinSlideSceneryKeys.Hill).setOrigin(0, 0).setDepth(0);

    const count = this.cfg.speed[this.speed].fishCount;
    this.area = { left: this.cfg.lanes.left, right: this.cfg.lanes.right, count };
    this.lanes = laneCenters(this.area);

    // Lane marks: soft dashed lines between lanes, from the row's start to the bottom.
    const marks = this.add.graphics().setDepth(1);
    const lm = this.cfg.laneMarks;
    marks.lineStyle(lm.widthPx, lm.color, lm.alpha);
    const laneW = (this.area.right - this.area.left) / count;
    const top = this.cfg.horizonY + this.cfg.rowStartBelowHorizonPx - lm.startAboveRowPx;
    for (let i = 1; i < count; i++) {
      const x = this.area.left + laneW * i;
      for (let y = top; y < this.scale.height; y += lm.dashPx + lm.gapPx) {
        marks.lineBetween(x, y, x, Math.min(y + lm.dashPx, this.scale.height));
      }
    }

    for (let c = 0; c < SLIDE_FISH_SHEET.colours; c++) {
      const key = fishAnimKey(c);
      if (this.anims.exists(key)) continue;
      const start = c * SLIDE_FISH_SHEET.wiggleFrames;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(SLIDE_FISH_SHEET.key, {
          start,
          end: start + SLIDE_FISH_SHEET.wiggleFrames - 1,
        }),
        frameRate: this.cfg.fish.wiggleFps,
        repeat: -1,
      });
    }

    this.lane = Math.floor(count / 2);
    this.penguin = new Penguin(
      this,
      this.lanes[this.lane] ?? width / 2,
      this.cfg.penguin.y,
      pickRandomPenguinSpriteKey(),
    );
  }

  override update(_time: number, dt: number): void {
    if (this.paused || this.roundOver || this.busy) return;
    if (this.clock.tick(dt)) {
      this.handleTimeout();
      return;
    }
    this.placeRow();
    this.tickSlideSound(dt);
  }

  /** Now and then while sliding, a ski-slide swoosh (pauses with the countdown). */
  private tickSlideSound(dt: number): void {
    this.slideSoundInMs -= dt;
    if (this.slideSoundInMs > 0) return;
    getAudioManager().play(pickRandomPenguinSwishSfx(), 'sfx');
    this.resetSlideSound();
  }

  private resetSlideSound(): void {
    const { minGapMs, maxGapMs } = this.cfg.slideSound;
    this.slideSoundInMs = Phaser.Math.Between(minGapMs, maxGapMs);
  }

  /** The row's position comes straight from the clock (so the picture can't disagree with the timer). */
  private placeRow(): void {
    const p = rowProgress(this.clock.remainingSec, this.totalSec());
    const y = rowY(p, this.rowStartY(), this.cfg.catchY);
    const { farScale, nearScale } = this.cfg.fish;
    const fs = fishScale(p, farScale, nearScale);
    const bs = badgeScale(p, farScale, nearScale, this.cfg.badge.floorScale);
    for (const f of this.row) if (f.isAlive) f.place(y, fs, bs);
  }

  // ----- Input -------------------------------------------------------------

  private inputOpen(): boolean {
    return !this.paused && !this.busy && !this.roundOver && this.time.now >= this.inputOpenAt;
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (!this.inputOpen()) return;
    if (!inTapWindow(pointer.x, pointer.y, this.cfg.tapWindow)) return;
    // A tap on a fish picks that fish; otherwise the tap's lane.
    const onFish = this.row.findIndex(
      (f) => f.isAlive && Phaser.Math.Distance.Between(pointer.x, pointer.y, f.x, f.y) <= f.hitRadius,
    );
    this.grab(onFish >= 0 ? onFish : laneAt(pointer.x, this.area));
  }

  /** Keys are ignored on the frame the game resumes (the key that pressed Resume mustn't also grab). */
  private keysOpen(): boolean {
    return this.inputOpen() && this.game.loop.frame !== this.resumedFrame;
  }

  private stepLane(dir: -1 | 1): void {
    if (!this.keysOpen()) return;
    const next = Math.max(0, Math.min(this.area.count - 1, this.lane + dir));
    if (next === this.lane) return;
    this.lane = next;
    getAudioManager().play(pickRandomPenguinSwishSfx(), 'sfx');
    this.resetSlideSound();
    this.penguin.glideTo(this.lanes[next], this.cfg.laneGlideMs);
  }

  private numberKey(index: number): void {
    const lane = laneForNumberKey(index, this.area.count);
    if (lane !== null) this.grabFromKey(lane);
  }

  private grabFromKey(lane: number): void {
    if (!this.keysOpen()) return;
    this.grab(lane);
  }

  /** Commit to a lane: the outcome is decided now, played when the penguin arrives. */
  private grab(lane: number): void {
    const fish = this.row[lane];
    if (!fish?.isAlive || !this.currentQuestion) return;
    this.busy = true;
    this.clock.stop();
    this.hideTapHint();
    const decision = resolveRetryEvent(this.retryState(), { type: 'pick', answer: fish.answer });
    fish.squish();
    getAudioManager().play(pickRandomPenguinHopSfx(), 'sfx');
    this.lane = lane;
    this.penguin.swoop(this.lanes[lane], fish.y, () => this.applyPick(decision, fish));
  }

  private retryState(): RetryRoundState {
    return {
      correctAnswer: this.currentQuestion?.correctAnswer ?? null,
      livesUsed: this.livesUsed,
      maxLives: this.cfg.maxLives,
      usedWrong: this.usedWrong,
    };
  }

  // ----- Outcomes ----------------------------------------------------------

  private applyPick(decision: RetryDecision, fish: SlideFish): void {
    switch (decision.kind) {
      case 'correct':
        this.handleCorrect(decision.record, fish);
        break;
      case 'wrong':
      case 'out-of-lives':
        this.handleSnowball(decision, fish);
        break;
      case 'timeout':
        // A pick is never a time-out (the clock path handles those). If it ever
        // were, unlock input rather than leave the round stuck.
        _th.logToAi('PenguinSlide.unexpectedPickOutcome', SeverityLevel.Error, this.questionProps());
        this.busy = false;
        break;
      default:
        assertNever(decision, 'pick outcome');
    }
  }

  private handleCorrect(record: OutcomeRecord, fish: SlideFish): void {
    fish.gulped(this.penguin.x, this.penguin.y - this.cfg.fx.gulpAbovePx);
    this.penguin.gulp();
    this.playSparkle(this.penguin.x, this.penguin.y - this.cfg.fx.sparkleAbovePx);
    for (const f of this.row) if (f !== fish && f.isAlive) f.swimAway();
    const { scoreDelta } = this.roundController.recordOutcome(record);
    this.events.emit('correctHit', { x: this.penguin.x, y: this.penguin.y, scoreDelta });
    _th.logToAi('QuestionEnded', SeverityLevel.Information, {
      ...this.questionProps(),
      wasCorrect: 'true',
      usedWrongShot: String(this.usedWrong),
    });
    this.events.emit('questionEnded', {
      wasCorrect: true,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });
    this.answeredCount += 1;
    this.roundController.advanceQuestionIndex();
    const last = this.answeredCount >= this.roundController.questionsPerRound;
    // The round's last fish gets a "Yummy!" in place of the gulp.
    getAudioManager().play(last ? pickRandomPenguinYummySfx() : pickRandomPenguinGulpSfx(), 'sfx');
    this.time.delayedCall(this.cfg.gulpMs, () =>
      this.penguin.returnHome(() => {
        if (last) this.finish();
        else this.time.delayedCall(this.cfg.nextQuestionDelayMs, () => this.startNextQuestion());
      }),
    );
  }

  /** Wrong fish: it's a snowball. BONK, a life lost; the same question again (or the round ends). */
  private handleSnowball(decision: Extract<RetryDecision, { kind: 'wrong' | 'out-of-lives' }>, fish: SlideFish): void {
    fish.revealSnowball();
    this.penguin.bonk();
    getAudioManager().play(pickRandomPenguinBonkSfx(), 'sfx');
    this.snowPuff(fish.x, fish.y);
    this.spendLife(decision);
    _th.logToAi('PenguinSlide.wrong', SeverityLevel.Information, this.questionProps());
    const outOfLives = decision.kind === 'out-of-lives';
    // No "Try again!" on the last life — "Out of lives!" follows.
    floatNote(
      this,
      fish.x,
      fish.y - this.cfg.fx.noteAboveFishPx,
      outOfLives ? 'Bonk!' : 'Bonk! Try again!',
      this.cfg.note,
    );
    for (const f of this.row) if (f !== fish && f.isAlive) f.swimAway();
    this.time.delayedCall(this.cfg.bonkSpinMs, () =>
      this.penguin.returnHome(() => {
        if (decision.kind === 'out-of-lives') this.handleOutOfLives(decision.record);
        else this.retryQuestion();
      }),
    );
  }

  /** The row reached the penguin: the snowballs bonk it, it tumbles; the right fish swims past (never auto-caught). */
  private handleTimeout(): void {
    this.busy = true;
    this.hideTapHint();
    const decision = resolveRetryEvent(this.retryState(), { type: 'timeout' });
    if (decision.kind === 'correct') return; // unreachable for a time-out; keeps the types narrow
    const correct = this.currentQuestion?.correctAnswer;
    for (const f of this.row) {
      if (!f.isAlive) continue;
      if (f.answer === correct) f.swimAway();
      else f.revealSnowball();
    }
    this.penguin.tumble();
    getAudioManager().play(pickRandomPenguinBonkSfx(), 'sfx');
    this.snowPuff(this.penguin.x, this.penguin.y - this.cfg.fx.puffAbovePx);
    _th.logToAi('PenguinSlide.timeout', SeverityLevel.Information, this.questionProps());
    // "Out of time!" shows even on the last life, so the kid knows why the round ends.
    const banner = screenBanner(this, 'Out of time!');
    this.spendLife(decision);
    this.time.delayedCall(this.cfg.timeoutBannerMs, () => {
      banner.destroy();
      this.penguin.returnHome(() => {
        if (decision.kind === 'out-of-lives') this.handleOutOfLives(decision.record);
        else this.retryQuestion();
      });
    });
  }

  private spendLife(decision: Exclude<RetryDecision, { kind: 'correct' }>): void {
    this.livesUsed = decision.livesUsed;
    this.usedWrong = decision.usedWrong;
    this.events.emit('strikesChanged', {
      strikesUsed: this.livesUsed,
      maxStrikes: this.cfg.maxLives,
      remaining: decision.livesRemaining,
    });
  }

  private handleOutOfLives(record: OutcomeRecord): void {
    this.busy = true;
    this.clock.stop();
    _th.logToAi('PenguinSlide.outOfLives', SeverityLevel.Information, this.questionProps());
    this.roundController.recordOutcome(record);
    this.events.emit('questionEnded', {
      wasCorrect: false,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });
    screenBanner(this, 'Out of lives!');
    this.time.delayedCall(this.cfg.outOfLivesBannerMs, () => this.endRound(false));
  }

  /** Same question, a fresh row, full time again. */
  private retryQuestion(): void {
    const q = this.currentQuestion;
    if (!q || this.roundOver) return;
    this.spawnRow(q);
  }

  /** All 12 answered: slide off to the igloo and celebrate. */
  private finish(): void {
    this.busy = true;
    this.penguin.slideHome(this.cfg.horizonY + this.cfg.iglooStopBelowHorizonPx, () => {
      this.playSparkle(this.penguin.x, this.penguin.y - this.cfg.fx.finishSparkleAbovePx);
      const banner = screenBanner(this, 'You made it!', { style: 'stars' });
      banner.setStroke(CALLOUT_INK_CSS, this.cfg.finishBannerStrokePx);
      const pop = this.cfg.finishBannerPop;
      banner.setScale(pop.fromScale);
      this.tweens.add({ targets: banner, scale: 1, duration: pop.ms, ease: 'Back.Out' });
      _th.logToAi('PenguinSlide.finished', SeverityLevel.Information, {
        gameId: this.gameId,
        mathId: this.mathId,
        speed: this.speed,
        strikesUsed: String(this.livesUsed),
      });
      this.time.delayedCall(this.cfg.celebrateMs, () => this.endRound(true));
    });
  }

  // ----- Question flow -----------------------------------------------------

  private startNextQuestion(): void {
    if (this.roundOver) return;
    const question = this.roundController.drawNextQuestion();
    if (question === null) {
      this.endRound(true);
      return;
    }
    this.currentQuestion = question;
    this.usedWrong = false;
    this.spawnRow(question);
    if (this.roundController.questionIndex === 0) this.tapHint?.show();
    _th.logToAi('QuestionStarted', SeverityLevel.Information, this.questionProps());
    this.events.emit('questionStarted', {
      question,
      index: this.roundController.questionIndex,
      total: this.roundController.questionsPerRound,
    });
  }

  /** A fresh row for `q`: answers in random lanes, fish colours chosen without looking at the answers. */
  private spawnRow(q: Question): void {
    for (const f of this.row) f.destroy();
    const answers = pickRowAnswers(q, this.area.count, Math.random);
    const looks = pickFishLooks(answers.length, SLIDE_FISH_SHEET.colours, Math.random);
    this.row = answers.map(
      (a, i) => new SlideFish(this, this.lanes[i], this.rowStartY(), looks[i], a.answer, a.display),
    );
    this.clock.start(this.totalSec() * 1000);
    this.resetSlideSound();
    this.placeRow();
    this.inputOpenAt = this.time.now + this.cfg.inputLockMs;
    this.busy = false;
  }

  private rowStartY(): number {
    return this.cfg.horizonY + this.cfg.rowStartBelowHorizonPx;
  }

  /** Time per question: the shared base for the difficulty, stretched for harder math. */
  private totalSec(): number {
    return questionSeconds(this.speed, this.mathId);
  }

  private questionProps(): TelemetryProps {
    return {
      gameId: this.gameId,
      questionIndex: String(this.roundController.questionIndex),
      mathId: this.mathId,
      speed: this.speed,
      strikesUsed: String(this.livesUsed),
      maxStrikes: String(this.cfg.maxLives),
    };
  }

  // ----- Feedback ----------------------------------------------------------

  private playSparkle(x: number, y: number): void {
    const burst = this.add.particles(x, y, ParticleSpriteKeys.Star05, {
      speed: { min: 60, max: 180 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 450,
      tint: [0xffffff, 0xfff3a0, 0xbfe3ff],
      blendMode: 'ADD',
      emitting: false,
    });
    burst.setDepth(30);
    burst.explode(14);
    this.time.delayedCall(550, () => burst.destroy());
  }

  /** A soft puff of snow (a snowball bursting, or the tumble). */
  private snowPuff(x: number, y: number): void {
    const puff = this.add.particles(x, y, ParticleSpriteKeys.Circle03, {
      speed: { min: 40, max: 140 },
      scale: { start: 0.25, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 500,
      tint: 0xffffff,
      emitting: false,
    });
    puff.setDepth(29);
    puff.explode(16);
    this.time.delayedCall(600, () => puff.destroy());
  }

  /** "👆 Tap the fish with the right answer!" on Q1 only; gone on the first tap. */
  private buildTapHint(): void {
    const { y, heightPx, backdropAlpha } = this.cfg.tapHint;
    this.tapHint = createTapHint(this, {
      x: this.scale.width / 2,
      y,
      label: '👆 Tap the fish with the right answer!',
      heightPx,
      backdropAlpha,
    });
  }

  private hideTapHint(): void {
    this.tapHint?.destroy();
    this.tapHint = undefined;
  }

  // ----- End / cleanup -----------------------------------------------------

  private endRound(passed: boolean): void {
    if (this.roundOver) return;
    // Lock first: scene.start(GameOver) is queued, so this scene gets one
    // more update — nothing may tick or time out after this.
    this.roundOver = true;
    this.busy = true;
    this.clock.stop();
    this.lifecycle.endRound({
      passedOverride: passed,
      starsOverride: computeClimbStars(this.answeredCount, this.roundController.questionsPerRound),
    });
  }

  private cleanup(): void {
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    for (const h of this.keyHandlers) this.input.keyboard?.off(h.event, h.fn);
    this.keyHandlers = [];
    for (const f of this.row) f.destroy();
    this.row = [];
    this.penguin?.destroy();
    this.lifecycle.exit();
  }

  // ----- Pause / resume / quit ---------------------------------------------

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.time.paused = true;
    for (const f of this.row) f.pauseAnim();
    this.lifecycle.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.time.paused = false;
    this.resumedFrame = this.game.loop.frame;
    for (const f of this.row) f.resumeAnim();
    this.lifecycle.resume();
  }

  quitToMenu(destination?: QuitDestination): void {
    this.time.paused = false;
    this.lifecycle.quitToMenu(destination);
  }
}
