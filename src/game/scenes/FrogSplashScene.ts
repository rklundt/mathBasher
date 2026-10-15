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
import type { GameSceneContract } from '@/game/scenes/gameSceneContract';
import type { Question } from '@/math/types';
import { Frog } from '@/game/entities/Frog';
import { LilyPadRow } from '@/game/entities/LilyPadRow';
import { QuestionClock, resolveStrike } from '@/game/systems/roundRules';
import {
  cameraScrollY,
  pickTappedPad,
  riverLayout,
  rowAnswers,
  rowDirection,
  type RiverLayout,
} from '@/game/systems/frogSplashMath';
import {
  FLY_SHEET,
  ParticleSpriteKeys,
  PondSpriteKeys,
  SPLASH_SHEET,
  pickRandomFrogSpriteKey,
} from '@/core/spriteKeys';
import { text } from '@/game/ui/typography';
import { getAudioManager } from '@/services/audioManagerFactory';
import {
  pickRandomFrogHopSfx,
  pickRandomFrogRibbitSfx,
  pickRandomFrogSlurpSfx,
  pickRandomFrogSplashSfx,
} from '@/core/audioKeys';

const NUMBER_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'] as const;

/**
 * Frog Splash — sprint 2.5.6's fifth game mode.
 *
 * Round structure:
 *   1. The frog starts on the near bank; 12 rows of lily pads drift across
 *      the river, alternating direction. The camera follows the frog up.
 *   2. Each question labels the next row's pads (2 / 3 / 4 by difficulty,
 *      exactly one right). Tap a pad (or press 1–4, left to right) and the
 *      frog hops onto it; the row holds still once the frog commits.
 *   3. Right pad → the row stops, the frog sits there, next row.
 *      Wrong pad → it sinks, SPLASH, the frog loses a life and pops back up
 *      on the last row (or the bank); the SAME question comes back with
 *      fresh pads. Running out of time also costs a life, same retry.
 *      Last life → "Out of lives!" → round over.
 *   4. Row 12 sits against the far bank: landing it sends the frog ashore,
 *      where it catches a fly with its tongue → "You made it!" → GameOver.
 * Stars mirror Space Escape: by how many rows the frog crossed.
 */
export class FrogSplashScene extends Phaser.Scene implements GameSceneContract {
  static readonly key = SceneKeys.FrogSplash;
  private readonly gameId = 'frog-splash' as const;
  private readonly cfg = config.frogSplash;

  private mathId!: MathId;
  private speed!: SpeedKey;
  private roundController!: RoundController;
  private lifecycle!: GameSceneLifecycle;
  private layout!: RiverLayout;
  private water!: Phaser.GameObjects.TileSprite;
  private frog!: Frog;
  private fly: Phaser.GameObjects.Sprite | null = null;
  /** Splash sprites still playing — paused with the scene. */
  private readonly splashes = new Set<Phaser.GameObjects.Sprite>();
  private flyOrbit: Phaser.Tweens.Tween | null = null;
  private rows: LilyPadRow[] = [];

  private currentQuestion: Question | null = null;
  /** Row the next answer belongs to (0-based). */
  private activeRow = 0;
  /** Row the frog is sitting on, and which pad (-1 = the near bank). */
  private sitRow = -1;
  private sitPad = -1;
  private livesUsed = 0;
  private usedWrongThisQuestion = false;
  /** Input + countdown locked (hopping, splashing, between questions). */
  private busy = false;
  private paused = false;
  private roundOver = false;
  private readonly clock = new QuestionClock();
  private keyHandlers: Array<{ event: string; fn: () => void }> = [];
  private tapHint?: Phaser.GameObjects.Container;

  constructor() {
    super(FrogSplashScene.key);
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
    this.rows = [];
    this.fly = null;
    this.flyOrbit = null;
    this.currentQuestion = null;
    this.activeRow = 0;
    this.sitRow = -1;
    this.sitPad = -1;
    this.livesUsed = 0;
    this.usedWrongThisQuestion = false;
    this.busy = false;
    this.paused = false;
    this.roundOver = false;
    this.clock.stop();
    this.time.paused = false;
    this.keyHandlers = [];
    this.tapHint = undefined;
    this.splashes.clear();

    const { mathId, speed } = Settings.round;
    this.mathId = mathId ?? 'add-to-10';
    this.speed = speed ?? 'medium';

    this.roundController = new RoundController(this.mathId, this.speed);
    const totalRows = this.roundController.questionsPerRound;
    this.buildWorld(totalRows);

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
      const handler = { event: `keydown-${name}`, fn: () => this.pickByIndex(i) };
      this.input.keyboard?.on(handler.event, handler.fn);
      this.keyHandlers.push(handler);
    });

    this.buildTapHint();
    this.startNextQuestion();
    this.events.once('shutdown', () => this.cleanup());
  }

  private buildWorld(totalRows: number): void {
    const { width, height } = this.scale;
    this.layout = riverLayout({
      rows: totalRows,
      rowSpacingPx: this.cfg.rowSpacingPx,
      shoreGapPx: this.cfg.shoreGapPx,
      bankHeightPx: this.cfg.bankHeightPx,
      shoreInsetPx: this.cfg.shoreInsetPx,
      startBankFrac: this.cfg.startBankFrac,
      finishBankFrac: this.cfg.finishBankFrac,
    });
    const L = this.layout;
    this.cameras.main.setBounds(0, 0, width, L.worldHeight);

    this.water = this.add.tileSprite(0, 0, width, L.worldHeight, PondSpriteKeys.Water).setOrigin(0, 0).setDepth(0);
    this.add.image(0, 0, PondSpriteKeys.BankFar).setOrigin(0, 0).setDepth(1);
    this.add.image(0, L.worldHeight - this.cfg.bankHeightPx, PondSpriteKeys.BankNear).setOrigin(0, 0).setDepth(1);

    const speedCfg = this.cfg.speed[this.speed];
    for (let i = 0; i < totalRows; i++) {
      this.rows.push(
        new LilyPadRow(this, L.rowY[i]!, rowDirection(i), speedCfg.padCount, speedCfg.driftPxPerSec, width, Math.random),
      );
    }

    if (!this.anims.exists(`${SPLASH_SHEET.key}/play`)) {
      this.anims.create({
        key: `${SPLASH_SHEET.key}/play`,
        frames: this.anims.generateFrameNumbers(SPLASH_SHEET.key, { start: 0, end: SPLASH_SHEET.frames - 1 }),
        frameRate: this.cfg.anim.splashFps,
      });
    }
    if (!this.anims.exists(`${FLY_SHEET.key}/buzz`)) {
      this.anims.create({
        key: `${FLY_SHEET.key}/buzz`,
        frames: this.anims.generateFrameNumbers(FLY_SHEET.key, { start: 0, end: FLY_SHEET.frames - 1 }),
        frameRate: this.cfg.anim.flyFps,
        repeat: -1,
      });
    }
    // The fly waits on the far bank, buzzing in a little loop.
    const fx = width / 2 + this.cfg.finish.flyOffsetX;
    const fy = L.finishY + this.cfg.finish.flyOffsetY;
    this.fly = this.add.sprite(fx, fy, FLY_SHEET.key, 0).setDepth(11).play(`${FLY_SHEET.key}/buzz`);
    const orbit = { a: 0 };
    this.flyOrbit = this.tweens.add({
      targets: orbit,
      a: Math.PI * 2,
      duration: this.cfg.finish.flyOrbitMs,
      repeat: -1,
      onUpdate: () => {
        this.fly?.setPosition(fx + Math.cos(orbit.a) * this.cfg.finish.flyOrbitPx, fy + Math.sin(orbit.a * 2) * this.cfg.finish.flyBobPx);
      },
    });

    this.frog = new Frog(this, width / 2, L.startY, pickRandomFrogSpriteKey());
    this.cameras.main.setScroll(0, cameraScrollY(L.startY, height, this.cfg.cameraFrogYFrac, L.worldHeight));
  }

  override update(_time: number, dt: number): void {
    if (this.paused || this.roundOver) return;
    this.water.tilePositionX += this.cfg.currentPxPerSec * (dt / 1000);
    for (const r of this.rows) r.update(dt);
    if (this.busy) return;
    if (this.clock.tick(dt)) this.handleTimeout();
  }

  // ----- Input -------------------------------------------------------------

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (this.paused || this.busy || this.roundOver) return;
    const row = this.rows[this.activeRow];
    if (!row) return;
    // Both halves of a pad split across the screen edge count as that pad.
    const targets = row.tapTargets();
    const hit = pickTappedPad(
      { x: pointer.worldX, y: pointer.worldY },
      targets,
      this.cfg.pad.displayPx / 2,
      this.cfg.pad.tapSlop,
      this.scale.width,
    );
    if (hit >= 0) this.hopTo(targets[hit]!.i);
  }

  /** Keyboard: 1–4 pick the active row's on-screen pads, left to right. */
  private pickByIndex(index: number): void {
    if (this.paused || this.busy || this.roundOver) return;
    const row = this.rows[this.activeRow];
    if (!row) return;
    // Every pad's main copy is on screen (rows wrap at the edge).
    const ordered = row
      .positions()
      .map((p, i) => ({ ...p, i }))
      .sort((a, b) => a.x - b.x);
    const pick = ordered[index];
    if (pick) this.hopTo(pick.i);
  }

  private hopTo(padIndex: number): void {
    const row = this.rows[this.activeRow];
    if (!row || padIndex < 0 || padIndex >= row.count) return;
    this.busy = true;
    this.hideTapHint();
    // The row holds still once the frog commits, so it lands exactly
    // where the kid aimed — sliding a pad split across the edge whole first.
    row.hold(padIndex);
    this.frog.hop(
      () => row.padPosition(padIndex),
      () => this.onLand(padIndex),
      () => this.playHop(),
    );
  }

  private onLand(padIndex: number): void {
    const answer = this.rows[this.activeRow]!.answerAt(padIndex);
    if (answer !== null && answer === this.currentQuestion?.correctAnswer) {
      this.handleCorrect(padIndex);
    } else {
      this.handleSplash(padIndex);
    }
  }

  // ----- Outcomes ----------------------------------------------------------

  private handleCorrect(padIndex: number): void {
    this.clock.stop();
    const row = this.rows[this.activeRow]!;
    row.stop();
    // The finished row's other pads shouldn't keep showing old answers.
    row.setAnswers(null);
    this.sitRow = this.activeRow;
    this.sitPad = padIndex;
    const { scoreDelta } = this.roundController.recordOutcome({
      wasCorrect: true,
      usedWrongShot: this.usedWrongThisQuestion,
    });
    // HUD draws in screen space; the river scrolls.
    this.events.emit('correctHit', { x: this.frog.x, y: this.frog.y - this.cameras.main.scrollY, scoreDelta });
    getAudioManager().play(pickRandomFrogRibbitSfx(), 'sfx');
    this.playSparkle(this.frog.x, this.frog.y);
    _th.logToAi('QuestionEnded', SeverityLevel.Information, {
      ...this.questionProps(),
      wasCorrect: 'true',
      usedWrongShot: String(this.usedWrongThisQuestion),
    });
    this.events.emit('questionEnded', {
      wasCorrect: true,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });
    this.roundController.advanceQuestionIndex();

    if (this.activeRow === this.rows.length - 1) {
      this.time.delayedCall(this.cfg.finish.ashoreDelayMs, () => this.hopAshore());
      return;
    }
    this.activeRow += 1;
    this.scrollToFrog();
    this.time.delayedCall(this.cfg.nextQuestionDelayMs, () => this.startNextQuestion());
  }

  /** Wrong pad: it sinks, SPLASH, a life is lost, then retry the same question. */
  private handleSplash(padIndex: number): void {
    this.clock.stop();
    this.usedWrongThisQuestion = true;
    const row = this.rows[this.activeRow]!;
    const at = row.padPosition(padIndex);
    row.sink(padIndex);
    this.frog.splashDown();
    getAudioManager().play(pickRandomFrogSplashSfx(), 'sfx');
    const splash = this.add.sprite(at.x, at.y + 10, SPLASH_SHEET.key, 0).setDepth(12).setScale(1.2);
    splash.play(`${SPLASH_SHEET.key}/play`);
    this.splashes.add(splash);
    splash.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.splashes.delete(splash);
      splash.destroy();
    });
    this.cameras.main.shake(140, 0.004);
    _th.logToAi('WrongPad', SeverityLevel.Information, this.questionProps());
    const outOfLives = this.loseLife();
    // No "Try again!" when that was the last life — "Out of lives!" follows.
    this.floatNote(at.x, at.y - 60, outOfLives ? 'Splash!' : 'Splash! Try again!');
    if (outOfLives) return;
    this.time.delayedCall(this.cfg.splashRecoverMs, () => this.retryQuestion(true));
  }

  /** Time ran out: a life is lost (no splash — the frog never jumped), same question again. */
  private handleTimeout(): void {
    this.busy = true;
    this.usedWrongThisQuestion = true;
    this.frog.wobble();
    _th.logToAi('FrogSplash.timeout', SeverityLevel.Information, this.questionProps());
    // "Out of time!" shows even on the last life, so the kid knows why
    // the round is ending.
    const banner = this.screenBanner('Out of time!');
    this.time.delayedCall(this.cfg.timeoutBannerMs, () => {
      banner.destroy();
      if (this.loseLife()) return;
      this.retryQuestion(false);
    });
  }

  /** Spend a life; on the last one, end the round and return true. */
  private loseLife(): boolean {
    const strike = resolveStrike(this.livesUsed, this.cfg.maxLives);
    this.livesUsed = strike.strikesAfter;
    this.events.emit('strikesChanged', {
      strikesUsed: this.livesUsed,
      maxStrikes: this.cfg.maxLives,
      remaining: strike.remaining,
    });
    if (!strike.exhausted) return false;
    this.handleOutOfLives();
    return true;
  }

  /** Time per hop: the shared base for the difficulty, stretched for harder math. */
  private countdownMs(): number {
    return questionSeconds(this.speed, this.mathId) * 1000;
  }

  /** Same question, fresh pads. After a splash the frog pops back up where it last sat. */
  private retryQuestion(afterSplash: boolean): void {
    const q = this.currentQuestion;
    if (!q || this.roundOver) return;
    if (afterSplash) {
      // Back to where the frog last sat: its pad on the last row, or the bank.
      const back =
        this.sitRow >= 0
          ? this.rows[this.sitRow]!.padPosition(this.sitPad)
          : { x: this.scale.width / 2, y: this.layout.startY };
      this.frog.reappear(back.x, back.y);
    }
    const row = this.rows[this.activeRow]!;
    row.restore();
    row.release();
    row.setAnswers(this.answersFor(q));
    this.clock.start(this.countdownMs());
    this.busy = false;
  }

  private handleOutOfLives(): void {
    this.busy = true;
    this.clock.stop();
    _th.logToAi('FrogSplash.outOfLives', SeverityLevel.Information, this.questionProps());
    this.roundController.recordOutcome({ wasCorrect: false, usedWrongShot: true });
    this.events.emit('questionEnded', {
      wasCorrect: false,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });
    this.screenBanner('Out of lives!');
    this.time.delayedCall(this.cfg.outOfLivesBannerMs, () => this.endRound(false));
  }

  /** Last row done: hop onto the far bank, catch the fly, celebrate. */
  private hopAshore(): void {
    const target = { x: this.scale.width / 2, y: this.layout.finishY };
    // Scroll to the top of the world (the far bank). A scrollY tween, like
    // scrollToFrog — camera.pan() only accepts its own ease names.
    this.tweens.add({ targets: this.cameras.main, scrollY: 0, duration: this.cfg.cameraScrollMs, ease: 'Sine.InOut' });
    this.frog.hop(
      () => target,
      () => this.catchFly(),
      () => this.playHop(),
    );
  }

  private catchFly(): void {
    const fly = this.fly;
    if (!fly) {
      this.celebrate();
      return;
    }
    // Freeze the fly where it is, then the tongue goes for it.
    this.flyOrbit?.stop();
    this.flyOrbit = null;
    this.frog.setPose('mouth');
    const mouth = this.frog.mouthPoint();
    const tongue = this.add.graphics().setDepth(11);
    const tip = { x: mouth.x, y: mouth.y };
    const draw = (): void => {
      tongue.clear();
      tongue.lineStyle(10, 0xff6f9a, 1);
      tongue.beginPath();
      tongue.moveTo(mouth.x, mouth.y);
      tongue.lineTo(tip.x, tip.y);
      tongue.strokePath();
      tongue.fillStyle(0xff6f9a, 1).fillCircle(tip.x, tip.y, 8);
    };
    const { tongueMs } = this.cfg.finish;
    this.tweens.add({
      targets: tip,
      x: fly.x,
      y: fly.y,
      duration: tongueMs,
      ease: 'Quad.Out',
      onUpdate: draw,
      onComplete: () => {
        fly.anims.stop();
        getAudioManager().play(pickRandomFrogSlurpSfx(), 'sfx');
        this.tweens.add({
          targets: tip,
          x: mouth.x,
          y: mouth.y,
          duration: tongueMs,
          ease: 'Quad.In',
          onUpdate: () => {
            draw();
            fly.setPosition(tip.x, tip.y);
          },
          onComplete: () => {
            tongue.destroy();
            fly.destroy();
            this.fly = null;
            this.frog.setPose('sit');
            this.celebrate();
          },
        });
      },
    });
  }

  private celebrate(): void {
    this.playSparkle(this.frog.x, this.frog.y - 30);
    this.frog.cheer();
    // Gold (not green) with a heavy outline — green reads poorly on blue water.
    const banner = this.screenBanner('You made it!', 'stars');
    banner.setStroke('#0b1020', 10);
    banner.setScale(0.6);
    this.tweens.add({ targets: banner, scale: 1, duration: 300, ease: 'Back.Out' });
    _th.logToAi('FrogSplash.crossed', SeverityLevel.Information, {
      gameId: this.gameId,
      mathId: this.mathId,
      speed: this.speed,
      strikesUsed: String(this.livesUsed),
    });
    this.time.delayedCall(this.cfg.finish.celebrateMs, () => this.endRound(true));
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
    this.usedWrongThisQuestion = false;
    this.rows[this.activeRow]!.setAnswers(this.answersFor(question));
    this.clock.start(this.countdownMs());
    this.busy = false;
    if (this.roundController.questionIndex === 0) this.tapHint?.setVisible(true);
    _th.logToAi('QuestionStarted', SeverityLevel.Information, this.questionProps());
    this.events.emit('questionStarted', {
      question,
      index: this.roundController.questionIndex,
      total: this.roundController.questionsPerRound,
    });
  }

  private answersFor(q: Question): Array<{ answer: number; display: string }> {
    return rowAnswers({
      choices: q.choices,
      correctAnswer: q.correctAnswer,
      choiceDisplays: q.choiceDisplays,
      count: this.rows[this.activeRow]!.count,
      rng: Math.random,
    });
  }

  private scrollToFrog(): void {
    const target = cameraScrollY(this.frog.y, this.scale.height, this.cfg.cameraFrogYFrac, this.layout.worldHeight);
    this.tweens.add({
      targets: this.cameras.main,
      scrollY: target,
      duration: this.cfg.cameraScrollMs,
      ease: 'Sine.InOut',
    });
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

  private playHop(): void {
    getAudioManager().play(pickRandomFrogHopSfx(), 'sfx');
  }

  private playSparkle(x: number, y: number): void {
    const burst = this.add.particles(x, y, ParticleSpriteKeys.Star05, {
      speed: { min: 60, max: 180 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 450,
      tint: [0xffffff, 0xfff3a0, 0xb8f7a8],
      blendMode: 'ADD',
      emitting: false,
    });
    burst.setDepth(30);
    burst.explode(14);
    this.time.delayedCall(550, () => burst.destroy());
  }

  /** Short message floating up from a world point. */
  private floatNote(x: number, y: number, msg: string): void {
    const { edgeMarginPx: margin, risePx, durationMs } = this.cfg.note;
    const cx = Math.max(margin, Math.min(this.scale.width - margin, x));
    const note = text(this, cx, y, msg, 'rowLabel').setOrigin(0.5).setDepth(100);
    note.setStroke('#0b1020', 6);
    this.tweens.add({
      targets: note,
      y: y - risePx,
      alpha: { from: 1, to: 0 },
      duration: durationMs,
      ease: 'Quad.In',
      onComplete: () => note.destroy(),
    });
  }

  /** Big centred banner that ignores the camera scroll. */
  private screenBanner(msg: string, kind: 'warning' | 'stars' = 'warning'): Phaser.GameObjects.Text {
    const banner = text(this, this.scale.width / 2, this.scale.height / 2, msg, kind)
      .setOrigin(0.5)
      .setDepth(100)
      .setScrollFactor(0);
    banner.setStroke('#0b1020', 8);
    banner.setShadow(0, 3, '#0b1020', 6, true, true);
    return banner;
  }

  /** "Tap the right lily pad!" pill on Q1 only; freed on the first hop. */
  private buildTapHint(): void {
    const H = 60;
    const container = this.add.container(this.scale.width / 2, 150).setScrollFactor(0);
    const label = text(this, 0, 0, '👆 Tap the right lily pad!', 'rowLabel').setOrigin(0.5);
    // Pill sized to the text, so it never spills past the box.
    const bg = this.add.rectangle(0, 0, label.width + 48, H, 0x0b1020, 0.55).setStrokeStyle(2, 0xffffff, 0.7);
    container.add([bg, label]);
    container.setDepth(50).setVisible(false);
    this.tweens.add({ targets: container, alpha: { from: 1, to: 0.6 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.tapHint = container;
  }

  private hideTapHint(): void {
    if (!this.tapHint) return;
    this.tweens.killTweensOf(this.tapHint);
    this.tapHint.destroy();
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
    const rowsCrossed = this.sitRow + 1;
    this.lifecycle.endRound({
      passedOverride: passed,
      starsOverride: computeClimbStars(rowsCrossed, this.rows.length),
    });
  }

  private cleanup(): void {
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    for (const h of this.keyHandlers) this.input.keyboard?.off(h.event, h.fn);
    this.keyHandlers = [];
    for (const r of this.rows) r.destroy();
    this.rows = [];
    this.frog?.destroy();
    this.fly?.destroy();
    this.fly = null;
    for (const s of this.splashes) s.destroy();
    this.splashes.clear();
    this.lifecycle.exit();
  }

  // ----- Pause / resume / quit ---------------------------------------------

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.time.paused = true;
    for (const s of this.animatedSprites()) s.anims.pause();
    this.lifecycle.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.time.paused = false;
    for (const s of this.animatedSprites()) s.anims.resume();
    this.lifecycle.resume();
  }

  /** Sprites playing an animation (the fly, any splashes) — frozen on pause. */
  private animatedSprites(): Phaser.GameObjects.Sprite[] {
    return [...(this.fly ? [this.fly] : []), ...this.splashes];
  }

  quitToMenu(): void {
    this.time.paused = false;
    this.lifecycle.quitToMenu();
  }
}
