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
import { Bunny } from '@/game/entities/Bunny';
import { GardenPlot } from '@/game/entities/GardenPlot';
import {
  pickRowAnswers,
  QuestionClock,
  resolveRetryEvent,
  type OutcomeRecord,
  type RetryDecision,
  type RetryRoundState,
} from '@/game/systems/roundRules';
import {
  inTapWindow,
  laneAt,
  laneCenters,
  laneForNumberKey,
  pickLaneLooks,
  type LaneArea,
} from '@/game/systems/laneMath';
import { basketSlot, carrotDepth, isHurry } from '@/game/systems/bunnyGardenMath';
import { BunnyGardenSceneryKeys, GARDEN_SHEETS, ParticleSpriteKeys, pickRandomBunnySpriteKey } from '@/core/spriteKeys';
import { CALLOUT_INK_CSS } from '@/game/ui/uiPalette';
import { createTapHint, floatNote, screenBanner, type TapHint } from '@/game/ui/callouts';
import { NUMBER_KEYS } from '@/game/ui/numberKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import {
  pickRandomBunnyHideSfx,
  pickRandomBunnyHopSfx,
  pickRandomBunnyMoleSfx,
  pickRandomBunnyPopSfx,
} from '@/core/audioKeys';
import { assertNever } from '@/shared/assertNever';

/**
 * Bunny Garden — sprint 2.8's eighth game mode.
 *
 * Round structure:
 *   1. A bunny on the front grass, a row of holes in the vegetable patch (3 /
 *      4 / 5 by difficulty). Each question, a carrot pops up out of every
 *      hole under a sign with its answer (exactly one right). The carrots
 *      sinking back into their holes IS the countdown.
 *   2. Tap a carrot, or anywhere in its lane (keys: ← / → choose a hole and
 *      Space pulls; 1–5 pull a hole directly). The bunny hops over and pulls.
 *   3. Right carrot → it pops out and lands in the basket; points; next
 *      question. Wrong hole → the carrot ducks and a friendly mole peeks up
 *      and waves: "Oops! Try again!", a life lost, the same question with a
 *      fresh row. Carrots hidden → "Out of time!", a life lost, same
 *      question. Last life → "Out of lives!" → round over.
 *   4. Twelve carrots fill the basket: the bunny cheers, "Basket full!" →
 *      GameOver.
 * Rules are the shared `resolveRetryEvent`; timing is `bunnyGardenMath`;
 * lanes are `laneMath`. Stars mirror Penguin Slide: by questions answered.
 */
export class BunnyGardenScene extends Phaser.Scene implements GameSceneContract {
  static readonly key = SceneKeys.BunnyGarden;
  private readonly gameId = 'bunny-garden' as const;
  private readonly cfg = config.bunnyGarden;

  private mathId!: MathId;
  private speed!: SpeedKey;
  private roundController!: RoundController;
  private lifecycle!: GameSceneLifecycle;
  private bunny!: Bunny;
  private area!: LaneArea;
  private lanes: number[] = [];
  private plots: GardenPlot[] = [];
  private basketIcons: Phaser.GameObjects.Image[] = [];
  private basketBack?: Phaser.GameObjects.Image;
  private basketFront?: Phaser.GameObjects.Image;

  private currentQuestion: Question | null = null;
  /** The hole the bunny is at (or hopping to). */
  private lane = 0;
  private livesUsed = 0;
  private usedWrong = false;
  private answeredCount = 0;
  /** Input + countdown locked (hopping, a result playing, between questions). */
  private busy = false;
  private paused = false;
  private roundOver = false;
  /** Taps are ignored until this scene time (just after a row pops up). */
  private inputOpenAt = 0;
  /** The game-loop frame the scene last resumed on: keys pressed to close Pause don't also pull. */
  private resumedFrame = -1;
  private readonly clock = new QuestionClock();
  private keyHandlers: Array<{ event: string; fn: () => void }> = [];
  private tapHint?: TapHint;

  constructor() {
    super(BunnyGardenScene.key);
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

  isRoundEnding(): boolean {
    return this.lifecycle.isRoundEnding;
  }

  // ----- Lifecycle ---------------------------------------------------------

  create(): void {
    // Phaser reuses scene instances — reset every stateful field.
    this.plots = [];
    this.basketIcons = [];
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
    key('keydown-SPACE', () => this.pickFromKey(this.lane));
    NUMBER_KEYS.forEach((name, i) => key(`keydown-${name}`, () => this.numberKey(i)));

    this.buildTapHint();
    this.startNextQuestion();
    this.events.once('shutdown', () => this.cleanup());
  }

  private buildWorld(): void {
    this.add.image(0, 0, BunnyGardenSceneryKeys.Patch).setOrigin(0, 0).setDepth(0);

    const count = this.cfg.speed[this.speed].holeCount;
    this.area = { left: this.cfg.lanes.left, right: this.cfg.lanes.right, count };
    this.lanes = laneCenters(this.area);
    const laneW = (this.area.right - this.area.left) / count;
    this.plots = this.lanes.map((x) => new GardenPlot(this, x, laneW));

    const b = this.cfg.basket;
    this.basketBack = this.add.image(b.x, b.y, GARDEN_SHEETS.basket.key, 0).setScale(b.scale).setDepth(9);
    this.basketFront = this.add.image(b.x, b.y, GARDEN_SHEETS.basket.key, 1).setScale(b.scale).setDepth(11);

    this.lane = Math.floor(count / 2);
    this.bunny = new Bunny(this, this.lanes[this.lane], this.cfg.bunny.y, pickRandomBunnySpriteKey());
  }

  override update(_time: number, dt: number): void {
    if (this.paused || this.roundOver || this.busy) return;
    if (this.clock.tick(dt)) {
      this.handleTimeout();
      return;
    }
    this.placeRow();
  }

  /** The carrots' depth comes straight from the clock (so the picture can't disagree with the timer). */
  private placeRow(): void {
    const c = this.cfg.carrot;
    const total = this.totalSec();
    const remaining = this.clock.remainingSec;
    const depth = carrotDepth(remaining, total, c);
    const shiver = isHurry(remaining, total, c.hurryFrac)
      ? Math.sin((this.time.now / 1000) * Math.PI * 2 * c.shiverHz) * c.shiverPx
      : 0;
    for (const p of this.plots) {
      p.setDepth(depth);
      p.setShiver(shiver);
    }
  }

  // ----- Input -------------------------------------------------------------

  private inputOpen(): boolean {
    return !this.paused && !this.busy && !this.roundOver && this.time.now >= this.inputOpenAt;
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (!this.inputOpen()) return;
    if (!inTapWindow(pointer.x, pointer.y, this.cfg.tapWindow)) return;
    this.pick(laneAt(pointer.x, this.area));
  }

  /** Keys are ignored on the frame the game resumes (the key that pressed Resume mustn't also pull). */
  private keysOpen(): boolean {
    return this.inputOpen() && this.game.loop.frame !== this.resumedFrame;
  }

  private stepLane(dir: -1 | 1): void {
    if (!this.keysOpen()) return;
    const next = Math.max(0, Math.min(this.area.count - 1, this.lane + dir));
    if (next === this.lane) return;
    this.lane = next;
    getAudioManager().play(pickRandomBunnyHopSfx(), 'sfx');
    this.bunny.hopTo(this.lanes[next]);
  }

  private numberKey(index: number): void {
    const lane = laneForNumberKey(index, this.area.count);
    if (lane !== null) this.pickFromKey(lane);
  }

  private pickFromKey(lane: number): void {
    if (!this.keysOpen()) return;
    this.pick(lane);
  }

  /** Commit to a hole: the outcome is decided now, played when the bunny has hopped over and pulled. */
  private pick(lane: number): void {
    const plot = this.plots[lane];
    if (!plot || !this.currentQuestion) return;
    this.busy = true;
    this.clock.stop();
    this.hideTapHint();
    for (const p of this.plots) p.setShiver(0);
    const decision = resolveRetryEvent(this.retryState(), { type: 'pick', answer: plot.answer });
    // Sprint 2.12 review — the tap decides it when it's the round's last
    // right answer or its last life: pause closes now, not after the
    // animation (quitting in that gap would lose the round's end).
    if (
      decision.kind === 'out-of-lives' ||
      (decision.kind === 'correct' && this.answeredCount + 1 >= this.roundController.questionsPerRound)
    ) {
      this.lifecycle.beginRoundEnd();
    }
    if (lane !== this.lane) getAudioManager().play(pickRandomBunnyHopSfx(), 'sfx');
    this.lane = lane;
    this.bunny.hopTo(this.lanes[lane], () => this.bunny.pull(() => this.applyPick(decision, plot)));
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

  private applyPick(decision: RetryDecision, plot: GardenPlot): void {
    switch (decision.kind) {
      case 'correct':
        this.handleCorrect(decision.record, plot);
        break;
      case 'wrong':
      case 'out-of-lives':
        this.handleMole(decision, plot);
        break;
      case 'timeout':
        // A pick is never a time-out (the clock path handles those). If it ever
        // were, unlock input rather than leave the round stuck.
        this.recoverFromUnexpectedOutcome('pick');
        break;
      default:
        assertNever(decision, 'pick outcome');
    }
  }

  private handleCorrect(record: OutcomeRecord, plot: GardenPlot): void {
    getAudioManager().play(pickRandomBunnyPopSfx(), 'sfx');
    this.bunny.happy();
    this.playSparkle(plot.x, this.cfg.cropLineY - this.cfg.fx.sparkleAbovePx);
    for (const p of this.plots) if (p !== plot) p.duck();
    const slot = basketSlot(this.answeredCount, this.cfg.basket);
    const b = this.cfg.basket;
    // The clock started as taps opened and stopped at the tap.
    const { scoreDelta, speedTier } = this.roundController.recordOutcome({
      ...record,
      timeUsed: this.clock.fractionUsed,
    });
    this.events.emit('correctHit', { x: plot.x, y: this.cfg.cropLineY, scoreDelta, speedTier });
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
    plot.pullOut(b.x + slot.dx, b.y + slot.dy, () => {
      this.addBasketCarrot(plot, slot);
      this.time.delayedCall(this.cfg.happyMs, () => {
        if (last) this.finish();
        else this.time.delayedCall(this.cfg.nextQuestionDelayMs, () => this.startNextQuestion());
      });
    });
  }

  /** A little carrot lands in the basket (between its back and front). */
  private addBasketCarrot(plot: GardenPlot, slot: { dx: number; dy: number }): void {
    const b = this.cfg.basket;
    const frame = this.carrotFrameOf(plot);
    const icon = this.add
      .image(b.x + slot.dx, b.y + slot.dy, GARDEN_SHEETS.carrots.key, frame)
      .setScale(b.iconScale)
      .setAngle(-20 + Math.random() * 40)
      .setDepth(10);
    this.basketIcons.push(icon);
    this.tweens.add({
      targets: icon,
      scale: { from: b.iconScale * 1.4, to: b.iconScale },
      duration: 160,
      ease: 'Back.Out',
    });
    // The basket bounces as the carrot lands (the right answer is the best moment).
    const r = this.cfg.reward;
    this.tweens.add({
      targets: [this.basketBack, this.basketFront],
      scaleX: b.scale * r.basketBounce,
      scaleY: b.scale * (2 - r.basketBounce),
      duration: r.basketBounceMs,
      yoyo: true,
      ease: 'Quad.Out',
    });
    this.playSparkle(b.x, b.y - this.cfg.fx.sparkleAbovePx);
  }

  private carrotFrameOf(plot: GardenPlot): number {
    return plot.kindIndex * GARDEN_SHEETS.carrots.frames;
  }

  /** Wrong hole: the carrot ducks and the mole peeks up and waves. A life lost; the same question again (or the round ends). */
  private handleMole(decision: Extract<RetryDecision, { kind: 'wrong' | 'out-of-lives' }>, plot: GardenPlot): void {
    getAudioManager().play(pickRandomBunnyMoleSfx(), 'sfx');
    this.bunny.oops();
    for (const p of this.plots) if (p !== plot) p.duck();
    this.spendLife(decision);
    _th.logToAi('BunnyGarden.wrong', SeverityLevel.Information, this.questionProps());
    const outOfLives = decision.kind === 'out-of-lives';
    // No "Try again!" on the last life — "Out of lives!" follows.
    floatNote(
      this,
      plot.x,
      plot.signY - this.cfg.fx.noteAboveSignPx,
      outOfLives ? 'Oops!' : 'Oops! Try again!',
      this.cfg.note,
    );
    plot.showMole(() => {
      if (decision.kind === 'out-of-lives') this.handleOutOfLives(decision.record);
      else this.retryQuestion();
    });
  }

  /** The carrots have hidden: "Out of time!", a life lost; the same question with full time. */
  private handleTimeout(): void {
    this.busy = true;
    this.hideTapHint();
    const decision = resolveRetryEvent(this.retryState(), { type: 'timeout' });
    if (decision.kind === 'correct') {
      // Unreachable for a time-out (keeps the types narrow); never leave the round stuck.
      this.recoverFromUnexpectedOutcome('timeout');
      return;
    }
    // Sprint 2.12 review — the last life: pause closes now, not when the banner ends.
    if (decision.kind === 'out-of-lives') this.lifecycle.beginRoundEnd();
    for (const p of this.plots) {
      p.setShiver(0);
      p.setDepth(1);
    }
    getAudioManager().play(pickRandomBunnyHideSfx(), 'sfx');
    this.bunny.oops();
    _th.logToAi('BunnyGarden.timeout', SeverityLevel.Information, this.questionProps());
    // "Out of time!" shows even on the last life, so the kid knows why the round ends.
    const banner = screenBanner(this, 'Out of time!');
    this.spendLife(decision);
    this.time.delayedCall(this.cfg.timeoutBannerMs, () => {
      banner.destroy();
      this.bunny.setPose('idle');
      if (decision.kind === 'out-of-lives') this.handleOutOfLives(decision.record);
      else this.retryQuestion();
    });
  }

  /** An outcome the rules never produce: log it, and give the same question a fresh row rather than lock the round. */
  private recoverFromUnexpectedOutcome(path: 'pick' | 'timeout'): void {
    _th.logToAi(`BunnyGarden.unexpectedOutcome.${path}`, SeverityLevel.Error, this.questionProps());
    this.retryQuestion();
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
    _th.logToAi('BunnyGarden.outOfLives', SeverityLevel.Information, this.questionProps());
    this.roundController.recordOutcome(record);
    this.events.emit('questionEnded', {
      wasCorrect: false,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });
    screenBanner(this, 'Out of lives!');
    this.lifecycle.beginRoundEnd();
    this.time.delayedCall(this.cfg.outOfLivesBannerMs, () => this.endRound(false));
  }

  /** Same question, a fresh row, full time again. */
  private retryQuestion(): void {
    const q = this.currentQuestion;
    if (!q || this.roundOver) return;
    this.bunny.setPose('idle');
    this.spawnRow(q);
  }

  /** Twelve carrots: the bunny hops to the basket and cheers. */
  private finish(): void {
    this.busy = true;
    for (const p of this.plots) p.clearRow();
    const b = this.cfg.basket;
    this.bunny.cheerAt(this.cfg.finishX, () => {
      this.playSparkle(b.x, b.y - this.cfg.fx.sparkleAbovePx);
      const banner = screenBanner(this, 'Basket full!', { style: 'stars' });
      banner.setStroke(CALLOUT_INK_CSS, this.cfg.finishBannerStrokePx);
      const pop = this.cfg.finishBannerPop;
      banner.setScale(pop.fromScale);
      this.tweens.add({ targets: banner, scale: 1, duration: pop.ms, ease: 'Back.Out' });
      _th.logToAi('BunnyGarden.finished', SeverityLevel.Information, {
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

  /** A fresh row for `q`: answers in random holes, carrot kinds chosen without looking at the answers. */
  private spawnRow(q: Question): void {
    const answers = pickRowAnswers(q, this.area.count, Math.random);
    const kinds = pickLaneLooks(answers.length, GARDEN_SHEETS.carrots.kinds, Math.random);
    answers.forEach((a, i) => {
      this.plots[i].setAnswer(a.answer, a.display, kinds[i]);
      this.plots[i].popUp();
    });
    // Stay busy while the carrots pop up (update() would otherwise pin their
    // depth to the clock's and cut the pop short); then the clock and taps
    // start together, so no time is lost to the lock.
    this.busy = true;
    this.clock.stop();
    this.inputOpenAt = this.time.now + this.cfg.inputLockMs;
    this.time.delayedCall(this.cfg.inputLockMs, () => {
      if (this.roundOver) return;
      this.clock.start(this.totalSec() * 1000);
      this.busy = false;
    });
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
    // Normal blend and saturated colours: an additive white sparkle vanishes on the bright garden.
    const r = this.cfg.reward;
    const burst = this.add.particles(x, y, ParticleSpriteKeys.Star05, {
      speed: { min: 80, max: 220 },
      scale: { start: r.sparkleScale, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 550,
      tint: [0xffc21a, 0xff6fa8, 0x9b6bff, 0x37c3ff],
      emitting: false,
    });
    burst.setDepth(30);
    burst.explode(r.sparkleCount);
    this.time.delayedCall(600, () => burst.destroy());
  }

  /** "👆 Tap the carrot with the right answer!" on Q1 only; gone on the first tap. */
  private buildTapHint(): void {
    const { y, heightPx, backdropAlpha } = this.cfg.tapHint;
    this.tapHint = createTapHint(this, {
      x: this.scale.width / 2,
      y,
      label: '👆 Tap the carrot with the right answer!',
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
    for (const p of this.plots) p.destroy();
    this.plots = [];
    this.basketIcons = [];
    this.bunny?.destroy();
    this.lifecycle.exit();
  }

  // ----- Pause / resume / quit ---------------------------------------------

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.time.paused = true;
    this.lifecycle.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.time.paused = false;
    this.resumedFrame = this.game.loop.frame;
    this.lifecycle.resume();
  }

  quitToMenu(destination?: QuitDestination): void {
    this.time.paused = false;
    this.lifecycle.quitToMenu(destination);
  }
}
