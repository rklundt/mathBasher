// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, questionSeconds, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { RoundController } from '@/game/services/RoundController';
import { GameSceneLifecycle } from '@/game/services/GameSceneLifecycle';
import type { GameSceneContract, QuitDestination } from '@/game/scenes/gameSceneContract';
import type { Question } from '@/math/types';
import { AlienShip } from '@/game/entities/AlienShip';
import { pickRowAnswers, QuestionClock, resolveStrike } from '@/game/systems/roundRules';
import {
  leanFor,
  pickShipFrames,
  pickTappedShip,
  spawnPoints,
  stepShips,
  windowXBounds,
  type FlightBounds,
  type FlightTuning,
} from '@/game/systems/spaceShooterMath';
import { ALIEN_SHIP_SHEET, SpaceShooterSpriteKeys } from '@/core/spriteKeys';
import { createTapHint, floatNote, screenBanner, type TapHint } from '@/game/ui/callouts';
import { getAudioManager } from '@/services/audioManagerFactory';
import { pickRandomHitCorrectSfx, pickRandomHitWrongSfx, SfxKeys } from '@/core/audioKeys';

const NUMBER_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'] as const;

/**
 * Space Shooter — sprint 2.6's sixth game mode.
 *
 * Round structure:
 *   1. The kid sits in a cockpit looking out the window at space. Each
 *      question warps in 3 / 4 / 5 alien ships (by difficulty), each with an
 *      answer in its porthole. They fly curvy paths, bouncing off the
 *      window frame and each other.
 *   2. Tap a ship (or press 1–5, left to right): lasers fire from the
 *      cockpit's cannons.
 *   3. Right ship → it explodes, the others warp away, next question.
 *      Wrong ship → its shield blocks the lasers, it warps away, one of the
 *      3 lives is lost; the question stays (half points once solved).
 *      Time runs out → the ships blast the cockpit, a life is lost and the
 *      same question comes back with fresh ships.
 *      Last life → "Out of lives!" → round over.
 *   4. 12 questions → GameOverScene (shared scoring / stars by correct answers).
 */
export class SpaceShooterScene extends Phaser.Scene implements GameSceneContract {
  static readonly key = SceneKeys.SpaceShooter;
  private readonly gameId = 'space-shooter' as const;
  private readonly cfg = config.spaceShooter;

  private mathId!: MathId;
  private speed!: SpeedKey;
  private roundController!: RoundController;
  private lifecycle!: GameSceneLifecycle;
  private flight!: FlightTuning;
  /** Where ship centres may fly: inside the window's measured, tapered edge. */
  private bounds!: FlightBounds;

  private ships: AlienShip[] = [];
  private currentQuestion: Question | null = null;
  private livesUsed = 0;
  private usedWrongThisQuestion = false;
  /** Input + countdown locked (lasers firing, a hit / blast playing out, between questions). */
  private busy = false;
  private paused = false;
  private roundOver = false;
  private readonly clock = new QuestionClock();
  private keyHandlers: Array<{ event: string; fn: () => void }> = [];
  private tapHint?: TapHint;

  constructor() {
    super(SpaceShooterScene.key);
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
    this.ships = [];
    this.currentQuestion = null;
    this.livesUsed = 0;
    this.usedWrongThisQuestion = false;
    this.busy = false;
    this.paused = false;
    this.roundOver = false;
    this.clock.stop();
    this.time.paused = false;
    this.keyHandlers = [];
    this.tapHint = undefined;

    const { challengeId: mathId, speed } = Settings.round;
    this.mathId = mathId ?? 'add-to-10';
    this.speed = speed ?? 'medium';
    this.flight = {
      speed: this.cfg.speed[this.speed].flyPxPerSec,
      maxTurn: this.cfg.ship.maxTurnRadPerSec,
      turnJitter: this.cfg.ship.turnJitterPerSec,
    };
    const { window: win, windowEdge, edgeHalfWidthPx, edgeReachPx } = this.cfg;
    this.bounds = {
      top: win.top,
      bottom: win.bottom,
      xAt: (y) => windowXBounds(y, windowEdge, edgeHalfWidthPx, edgeReachPx),
    };

    const { width, height } = this.scale;
    // Space out the window (behind), then the ships, then the cockpit frame.
    this.add.image(0, 0, SpaceShooterSpriteKeys.Cosmos).setOrigin(0, 0).setDisplaySize(width, height).setDepth(0);
    this.add.image(0, 0, SpaceShooterSpriteKeys.Cockpit).setOrigin(0, 0).setDisplaySize(width, height).setDepth(10);

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
      const handler = { event: `keydown-${name}`, fn: () => this.pickByIndex(i) };
      this.input.keyboard?.on(handler.event, handler.fn);
      this.keyHandlers.push(handler);
    });

    this.buildTapHint();
    this.startNextQuestion();
    this.events.once('shutdown', () => this.cleanup());
  }

  override update(_time: number, dt: number): void {
    if (this.paused || this.roundOver) return;
    // Arriving ships fly too (they just can't be shot until they've warped in).
    const moving = this.movingShips();
    stepShips(
      moving.map((s) => s.body),
      Math.min(dt, 50) / 1000,
      this.bounds,
      this.flight,
      Math.random,
    );
    for (const s of moving) s.sync(leanFor(s.body.turn, this.cfg.ship.maxTurnRadPerSec, this.cfg.ship.leanDeg));
    if (this.busy) return;
    if (this.clock.tick(dt)) this.handleTimeout();
  }

  // ----- Input -------------------------------------------------------------

  /** Ships that can be shot: fully warped in, not hit. */
  private flyingShips(): AlienShip[] {
    return this.ships.filter((s) => s.state === 'flying');
  }

  /** Ships still in the window (arriving or flying). */
  private movingShips(): AlienShip[] {
    return this.ships.filter((s) => s.state !== 'leaving');
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (this.paused || this.busy || this.roundOver) return;
    const flying = this.flyingShips();
    const i = pickTappedShip(
      { x: pointer.x, y: pointer.y },
      flying.map((s) => s.body),
      this.cfg.ship.displayPx / 2,
      this.cfg.ship.tapSlop,
      this.cfg.tapWindow,
    );
    if (i >= 0) this.fireAt(flying[i]);
  }

  /** Keyboard: 1–5 pick the flying ships, left to right. */
  private pickByIndex(index: number): void {
    if (this.paused || this.busy || this.roundOver) return;
    const pick = this.flyingShips().sort((a, b) => a.body.x - b.body.x)[index];
    if (pick) this.fireAt(pick);
  }

  /** Both cannons fire at the ship; the outcome plays when the beams arrive. */
  private fireAt(ship: AlienShip): void {
    this.busy = true;
    this.hideTapHint();
    getAudioManager().play(Math.random() < 0.5 ? SfxKeys.Fire1 : SfxKeys.Fire2, 'sfx');
    const { leftMuzzle, rightMuzzle, shotMs, fadeMs } = this.cfg.laser;
    const beams = this.add.graphics().setDepth(8);
    const p = { t: 0 };
    const draw = (alpha: number): void => {
      beams.clear();
      for (const m of [leftMuzzle, rightMuzzle]) {
        const ex = m.x + (ship.body.x - m.x) * p.t;
        const ey = m.y + (ship.body.y - m.y) * p.t;
        beams.lineStyle(12, 0x5ad1ff, 0.35 * alpha).lineBetween(m.x, m.y, ex, ey);
        beams.lineStyle(5, 0xffffff, alpha).lineBetween(m.x, m.y, ex, ey);
      }
    };
    this.tweens.add({
      targets: p,
      t: 1,
      duration: shotMs,
      ease: 'Quad.In',
      onUpdate: () => draw(1),
      onComplete: () => {
        if (ship.answer === this.currentQuestion?.correctAnswer) this.handleCorrect(ship);
        else this.handleWrong(ship);
        const fade = { a: 1 };
        this.tweens.add({
          targets: fade,
          a: 0,
          duration: fadeMs,
          onUpdate: () => draw(fade.a),
          onComplete: () => beams.destroy(),
        });
      },
    });
  }

  // ----- Outcomes ----------------------------------------------------------

  private handleCorrect(ship: AlienShip): void {
    this.clock.stop();
    const { scoreDelta } = this.roundController.recordOutcome({
      wasCorrect: true,
      usedWrongShot: this.usedWrongThisQuestion,
    });
    this.events.emit('correctHit', { x: ship.body.x, y: ship.body.y, scoreDelta });
    getAudioManager().play(pickRandomHitCorrectSfx(), 'sfx');
    ship.explode();
    this.cameras.main.shake(120, 0.003);
    this.ships = this.ships.filter((s) => s !== ship);
    this.clearShips();
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
    this.time.delayedCall(this.cfg.nextQuestionDelayMs, () => this.startNextQuestion());
  }

  /** Wrong ship: its shield blocks the lasers, it warps away, a life is lost; the question stays. */
  private handleWrong(ship: AlienShip): void {
    this.usedWrongThisQuestion = true;
    getAudioManager().play(pickRandomHitWrongSfx(), 'sfx');
    ship.shieldBlock();
    this.cameras.main.shake(140, 0.004);
    _th.logToAi('WrongShip', SeverityLevel.Information, this.questionProps());
    const outOfLives = this.loseLife();
    // No "Try again!" when that was the last life — "Out of lives!" follows.
    floatNote(
      this,
      ship.body.x,
      ship.body.y - 70,
      outOfLives ? 'Shields up!' : 'Shields up! Try again!',
      this.cfg.note,
    );
    // Out of play at once (no second shot at it). Taps stay locked until the
    // shield flash ends, so a frantic double-tap can't cost a second life.
    ship.state = 'leaving';
    this.time.delayedCall(this.cfg.ship.shieldMs, () => {
      ship.warpOut(() => (this.ships = this.ships.filter((s) => s !== ship)));
      if (!outOfLives && !this.roundOver) this.busy = false;
    });
  }

  /** Time's up: the ships blast the cockpit, a life is lost, same question with fresh ships. */
  private handleTimeout(): void {
    this.busy = true;
    this.usedWrongThisQuestion = true;
    _th.logToAi('SpaceShooter.timeout', SeverityLevel.Information, this.questionProps());
    const banner = screenBanner(this, 'Out of time! You got blasted!');
    this.blastCockpit();
    this.time.delayedCall(this.cfg.blastMs, () => {
      banner.destroy();
      if (this.loseLife()) return;
      this.retryQuestion();
    });
  }

  /** Every ship fires a red bolt at the window; flash, shake, cracks on the glass. */
  private blastCockpit(): void {
    const { width, height } = this.scale;
    const shooters = this.movingShips();
    getAudioManager().play(SfxKeys.TimeoutFail1, 'sfx');
    shooters.forEach((ship, i) => {
      this.time.delayedCall(i * 110, () => {
        const hit = {
          x:
            this.cfg.tapWindow.left +
            (0.2 + Math.random() * 0.6) * (this.cfg.tapWindow.right - this.cfg.tapWindow.left),
          y:
            this.cfg.tapWindow.top +
            (0.35 + Math.random() * 0.5) * (this.cfg.tapWindow.bottom - this.cfg.tapWindow.top),
        };
        const bolt = this.add.graphics().setDepth(9);
        const p = { t: 0 };
        this.tweens.add({
          targets: p,
          t: 1,
          duration: 180,
          onUpdate: () => {
            bolt.clear();
            const ex = ship.body.x + (hit.x - ship.body.x) * p.t;
            const ey = ship.body.y + (hit.y - ship.body.y) * p.t;
            bolt.lineStyle(14 * (0.4 + p.t), 0xff4b4b, 0.4).lineBetween(ship.body.x, ship.body.y, ex, ey);
            bolt.lineStyle(5 * (0.4 + p.t), 0xffd0d0, 1).lineBetween(ship.body.x, ship.body.y, ex, ey);
          },
          onComplete: () => {
            bolt.destroy();
            this.crackGlass(hit.x, hit.y);
          },
        });
      });
    });
    // One big red flash + shake as the bolts land.
    this.time.delayedCall(180, () => {
      const flash = this.add.rectangle(0, 0, width, height, 0xff2a2a, 0.45).setOrigin(0, 0).setDepth(20);
      this.tweens.add({ targets: flash, alpha: 0, duration: 450, onComplete: () => flash.destroy() });
      this.cameras.main.shake(350, 0.007);
    });
  }

  /** A star of cracks on the window glass where a bolt hit; fades out. */
  private crackGlass(x: number, y: number): void {
    const g = this.add.graphics().setDepth(9);
    g.lineStyle(3, 0xffffff, 0.85);
    const spokes = 7;
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2 + Math.random() * 0.5;
      const len = 30 + Math.random() * 40;
      const mid = len * (0.4 + Math.random() * 0.3);
      const bend = (Math.random() - 0.5) * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * mid, y + Math.sin(a) * mid);
      g.lineTo(x + Math.cos(a + bend) * len, y + Math.sin(a + bend) * len);
      g.strokePath();
    }
    g.strokeCircle(x, y, 9);
    this.tweens.add({ targets: g, alpha: 0, delay: 500, duration: 500, onComplete: () => g.destroy() });
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

  private handleOutOfLives(): void {
    this.busy = true;
    this.clock.stop();
    _th.logToAi('SpaceShooter.outOfLives', SeverityLevel.Information, this.questionProps());
    this.roundController.recordOutcome({ wasCorrect: false, usedWrongShot: true });
    this.events.emit('questionEnded', {
      wasCorrect: false,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });
    screenBanner(this, 'Out of lives!');
    this.time.delayedCall(this.cfg.outOfLivesBannerMs, () => this.endRound());
  }

  // ----- Question flow -----------------------------------------------------

  /** Time per question: the shared base for the difficulty, stretched for harder math. */
  private countdownMs(): number {
    return questionSeconds(this.speed, this.mathId) * 1000;
  }

  private startNextQuestion(): void {
    if (this.roundOver) return;
    const question = this.roundController.drawNextQuestion();
    if (question === null) {
      this.endRound();
      return;
    }
    this.currentQuestion = question;
    this.usedWrongThisQuestion = false;
    this.spawnWave(question);
    this.clock.start(this.countdownMs());
    this.busy = false;
    if (this.roundController.questionIndex === 0) this.tapHint?.show();
    _th.logToAi('QuestionStarted', SeverityLevel.Information, this.questionProps());
    this.events.emit('questionStarted', {
      question,
      index: this.roundController.questionIndex,
      total: this.roundController.questionsPerRound,
    });
  }

  /** Same question, fresh ships (after a blast). */
  private retryQuestion(): void {
    const q = this.currentQuestion;
    if (!q || this.roundOver) return;
    this.clearShips();
    this.spawnWave(q);
    this.clock.start(this.countdownMs());
    this.busy = false;
  }

  private spawnWave(q: Question): void {
    const count = this.cfg.speed[this.speed].shipCount;
    // Questions carry 4 choices; Hard's 5th ship gets one more plausible wrong answer.
    const answers = pickRowAnswers(q, count, Math.random);
    const r = this.cfg.ship.displayPx * this.cfg.ship.radiusFrac;
    const points = spawnPoints(answers.length, this.bounds, r * this.cfg.ship.spawnGapFrac, Math.random);
    const frames = pickShipFrames(answers.length, ALIEN_SHIP_SHEET.count, Math.random);
    answers.forEach((a, i) => {
      const p = points[i];
      const ship = new AlienShip(this, p.x, p.y, frames[i], Math.random() * Math.PI * 2, a.answer, a.display);
      ship.warpIn();
      this.ships.push(ship);
    });
  }

  /** Every ship still in the window warps away. */
  private clearShips(): void {
    for (const s of this.movingShips()) {
      s.warpOut(() => (this.ships = this.ships.filter((x) => x !== s)));
    }
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

  /** "Tap the ship with the right answer!" pill over the dashboard, Q1 only. */
  private buildTapHint(): void {
    const { aboveBottomPx, heightPx, backdropAlpha } = this.cfg.tapHint;
    this.tapHint = createTapHint(this, {
      x: this.scale.width / 2,
      y: this.scale.height - aboveBottomPx,
      label: '👆 Tap the ship with the right answer!',
      heightPx,
      backdropAlpha,
    });
  }

  private hideTapHint(): void {
    this.tapHint?.destroy();
    this.tapHint = undefined;
  }

  // ----- End / cleanup -----------------------------------------------------

  private endRound(): void {
    if (this.roundOver) return;
    // Lock first: scene.start(GameOver) is queued, so this scene gets one
    // more update — nothing may tick or time out after this.
    this.roundOver = true;
    this.busy = true;
    this.clock.stop();
    this.lifecycle.endRound();
  }

  private cleanup(): void {
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    for (const h of this.keyHandlers) this.input.keyboard?.off(h.event, h.fn);
    this.keyHandlers = [];
    for (const s of this.ships) s.destroy();
    this.ships = [];
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
    this.lifecycle.resume();
  }

  quitToMenu(destination?: QuitDestination): void {
    this.time.paused = false;
    this.lifecycle.quitToMenu(destination);
  }
}
