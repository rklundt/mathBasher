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
import { Axolotl } from '@/game/entities/Axolotl';
import { AnswerBubble } from '@/game/entities/AnswerBubble';
import { ReefDecor } from '@/game/systems/ReefDecor';
import {
  buildBubbleWave,
  chaseHoldY,
  clampToWater,
  hasEscaped,
  isWithinCatch,
  pickTappedBubble,
  resolveBubbleEvent,
  visibleBubbles,
  wrongNoteY,
  type BubbleRoundState,
  type CatchDecision,
  type OutcomeRecord,
} from '@/game/systems/mathALotlMath';
import { QuestionClock } from '@/game/systems/roundRules';
import { assertNever } from '@/shared/assertNever';
import { getAudioManager } from '@/services/audioManagerFactory';
import { pickRandomBubblePopSfx, pickRandomBubbleWrongSfx, SfxKeys } from '@/core/audioKeys';
import { ParticleSpriteKeys, pickRandomAxolotlSpriteKey } from '@/core/spriteKeys';
import { createTapHint, fadeNote, floatNote, screenBanner, type TapHint } from '@/game/ui/callouts';

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
 *      Wrong bubble → wobble-pop + "Oops! Try again!", one of the round's
 *      3 lives is lost, the problem stays (half points once solved).
 *      Last life → "Out of lives!" → round over.
 *      The bubble the axolotl is chasing waits just under the surface, so
 *      a right choice is never lost to a slow swim.
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
  /** Per-question countdown; ticks only while a question is in play, expires at most once. */
  private readonly clock = new QuestionClock();
  /** Sprint 2.11 — the clock's speed timing has started (a bubble is in view). */
  private speedTimed = false;
  /** Sprint 2.11 — the share of the time used when the bubble being chased was tapped. */
  private chaseTimeUsed = 1;
  /** Set once the round has ended — nothing ticks after this (GameOver mounts next frame). */
  private roundOver = false;
  /** Number-key handlers, kept so cleanup removes exactly these. */
  private keyHandlers: Array<{ event: string; fn: () => void }> = [];
  private transitioning = false;
  private paused = false;
  private tapHint?: TapHint;

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

  isRoundEnding(): boolean {
    return this.lifecycle.isRoundEnding;
  }

  /** GameSceneContract — seconds left on this question's countdown (HUD timer). */
  getCountdownSec(): number | undefined {
    if (!this.currentQuestion || this.roundOver) return undefined;
    return this.clock.remainingSec;
  }

  // ----- Lifecycle ---------------------------------------------------------

  create(): void {
    // Phaser reuses scene instances — reset every stateful field.
    this.bubbles = [];
    this.chasing = null;
    this.currentQuestion = null;
    this.livesUsed = 0;
    this.usedWrongCatch = false;
    this.clock.stop();
    this.roundOver = false;
    this.transitioning = false;
    this.paused = false;
    // Phaser's Clock keeps `paused` across scene restarts; every exit path
    // resumes first today, but don't depend on it.
    this.time.paused = false;
    this.tapHint = undefined;
    this.keyHandlers = [];

    const { challengeId: mathId, speed } = Settings.round;
    this.mathId = mathId ?? 'add-to-10';
    this.speed = speed ?? 'medium';

    const { width, height } = this.scale;
    this.waterlineY = height * this.cfg.waterlineFrac;
    const m = this.cfg.axolotl.edgeMarginPx;
    this.water = { left: m, right: width - m, top: this.waterlineY + m, bottom: height - m };

    this.decor = new ReefDecor(this, { width, waterlineY: this.waterlineY, floorY: height });
    this.axolotl = new Axolotl(
      this,
      width / 2,
      (this.water.top + this.water.bottom) / 2,
      pickRandomAxolotlSpriteKey(),
      this.water,
    );
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
    this.decor.update(dt);
    for (const b of this.bubbles) b.update(dt);
    this.axolotl.update(dt);
    // Never leave the water — a chase toward a bubble still rising up
    // from below the floor waits at the bottom instead of following it
    // off screen.
    const p = clampToWater(this.axolotl.x, this.axolotl.y, this.water);
    this.axolotl.sprite.setPosition(p.x, p.y);
    if (this.transitioning) return;

    // Sprint 2.11 — the bubbles rise into view after the clock starts; the
    // speed bonus times the answer from the first one a kid can tap.
    if (!this.speedTimed && visibleBubbles(this.bubbles, this.scale.height).length > 0) {
      this.clock.markOpen();
      this.speedTimed = true;
    }
    if (this.clock.tick(dt)) {
      this.handleTimeout();
      return;
    }

    // Catch: the axolotl only catches the bubble it was sent after, so
    // swimming past a wrong bubble on the way never costs a heart.
    const target = this.chasing;
    if (
      target?.alive &&
      isWithinCatch(this.axolotl.headPoint(), target, target.radius, this.cfg.axolotl.catchRadiusPx)
    ) {
      this.handleCatch(target);
      return;
    }

    // Escapes at the surface.
    for (const b of this.bubbles) {
      if (!b.alive || !hasEscaped(b.y, b.radius, this.waterlineY)) continue;
      const escape = resolveBubbleEvent(this.bubbleState(), { type: 'escaped', answer: b.answer });
      switch (escape.kind) {
        case 'escaped-correct':
          this.handleCorrectEscaped();
          return;
        case 'escaped-wrong':
          // (A chased bubble never gets here — it's held below the escape line.)
          b.popQuiet();
          break;
        default:
          assertNever(escape, 'escape outcome');
      }
    }
    this.bubbles = this.bubbles.filter((b) => b.alive);
  }

  // ----- Input -------------------------------------------------------------

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (this.paused || this.transitioning) return;
    this.hideTapHint();
    // Only bubbles the kid can see — waves spawn below the floor.
    const live = visibleBubbles(this.bubbles, this.scale.height);
    const i = pickTappedBubble(
      { x: pointer.worldX, y: pointer.worldY },
      live,
      this.cfg.bubble.diameterPx / 2,
      this.cfg.bubble.tapSlop,
    );
    if (i >= 0) {
      this.chaseBubble(live[i]);
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
    // Keys need the LABEL on screen (centre above the floor), not just a sliver of bubble.
    const r = this.cfg.bubble.diameterPx / 2;
    const live = visibleBubbles(this.bubbles, this.scale.height - r).sort((a, b) => a.x - b.x);
    const b = live[index];
    if (b) {
      this.hideTapHint();
      this.chaseBubble(b);
    }
  }

  private chaseBubble(b: AnswerBubble): void {
    this.chasing?.setHoldY(null);
    this.chasing = b;
    // Sprint 2.11 — the speed bonus times the answer at the tap; the swim
    // to the bubble isn't thinking time.
    this.chaseTimeUsed = this.clock.fractionUsed;
    // The chosen bubble waits just under the surface until it's caught,
    // whatever its answer — a right choice is never lost to a slow swim.
    b.setHoldY(chaseHoldY(this.waterlineY, b.radius, this.cfg.bubble.chaseHoldMarginPx));
    this.axolotl.chase(() => (b.alive ? { x: b.x, y: b.y } : null));
  }

  private stopChase(): void {
    this.chasing?.setHoldY(null);
    this.chasing = null;
    this.axolotl.stop();
  }

  // ----- Outcomes ----------------------------------------------------------

  /** The round's state as the pure outcome rules (`resolveBubbleEvent`) see it. */
  private bubbleState(): BubbleRoundState {
    return {
      correctAnswer: this.currentQuestion?.correctAnswer ?? null,
      livesUsed: this.livesUsed,
      maxLives: this.cfg.maxLives,
      usedWrongCatch: this.usedWrongCatch,
    };
  }

  private handleCatch(b: AnswerBubble): void {
    this.stopChase();
    const decision = resolveBubbleEvent(this.bubbleState(), { type: 'catch', answer: b.answer });
    switch (decision.kind) {
      case 'correct':
        this.handleCorrectCatch(b, decision.record);
        break;
      case 'wrong':
      case 'out-of-lives':
        this.handleWrongCatch(b, decision);
        break;
      default:
        assertNever(decision, 'catch outcome');
    }
  }

  private handleCorrectCatch(b: AnswerBubble, record: OutcomeRecord): void {
    this.transitioning = true;
    this.clock.stop();
    const { scoreDelta, speedTier } = this.roundController.recordOutcome({
      ...record,
      timeUsed: this.chaseTimeUsed,
    });
    this.events.emit('correctHit', { x: b.x, y: b.y, scoreDelta, speedTier });
    getAudioManager().play(pickRandomBubblePopSfx(), 'sfx');
    this.playSparkle(b.x, b.y);
    this.axolotl.playHappy();
    b.popCorrect();
    for (const other of this.bubbles) other.popQuiet();
    this.time.delayedCall(this.cfg.nextQuestionDelayMs, () => this.afterQuestion(true));
  }

  /** A wrong catch; on the last life it also ends the round (`out-of-lives`). */
  private handleWrongCatch(b: AnswerBubble, decision: Exclude<CatchDecision, { kind: 'correct' }>): void {
    this.usedWrongCatch = decision.usedWrongCatch;
    getAudioManager().play(pickRandomBubbleWrongSfx(), 'sfx');
    b.popWrong();
    this.cameras.main.shake(120, 0.004);
    this.livesUsed = decision.livesUsed;
    this.events.emit('strikesChanged', {
      strikesUsed: this.livesUsed,
      maxStrikes: this.cfg.maxLives,
      remaining: decision.livesRemaining,
    });
    _th.logToAi('WrongCatch', SeverityLevel.Information, {
      ...this.questionProps(),
      strikesUsed: String(this.livesUsed),
      maxStrikes: String(this.cfg.maxLives),
    });
    if (decision.kind === 'out-of-lives') {
      this.handleOutOfLives(decision.record);
      return;
    }
    // A wrong catch needs words too — a sound + a dot turning red in the
    // corner is easy for a 6-year-old to miss. Placement: `wrongNoteY`.
    const { durationMs, risePx, floorMarginPx } = this.cfg.wrongNote;
    const y0 = wrongNoteY(b.y, b.radius, risePx, this.scale.height, floorMarginPx);
    // No edge clamp: the bubble is always inside the water.
    floatNote(this, b.x, y0, 'Oops! Try again!', { risePx, durationMs });
  }

  /** The right answer floated to the surface: no penalty, same problem again. */
  private handleCorrectEscaped(): void {
    this.transitioning = true;
    this.stopChase();
    _th.logToAi('BubbleEscaped', SeverityLevel.Information, this.questionProps());
    // Keep the Q1 tap hint (if still up): a kid who let the right bubble
    // float away untouched is exactly the one who needs it. The note sits
    // below the hint, so they don't overlap.
    for (const b of this.bubbles) b.popQuiet();
    const { holdMs, fadeMs, belowWaterlinePx } = this.cfg.escapeNote;
    fadeNote(this, this.scale.width / 2, this.waterlineY + belowWaterlinePx, 'Floated away! Try again!', {
      holdMs,
      fadeMs,
    });
    this.time.delayedCall(this.cfg.respawnDelayMs, () => {
      this.spawnWave();
      this.transitioning = false;
    });
  }

  /** Countdown hit zero: the question is missed (no heart lost), next problem. */
  private handleTimeout(): void {
    this.transitioning = true;
    this.stopChase();
    this.roundController.recordOutcome(resolveBubbleEvent(this.bubbleState(), { type: 'timeout' }).record);
    getAudioManager().play(SfxKeys.TimeoutFail1, 'sfx');
    for (const b of this.bubbles) b.popQuiet();
    const banner = screenBanner(this, 'Out of time!');
    this.time.delayedCall(this.cfg.timeoutBannerMs, () => {
      banner.destroy();
      this.afterQuestion(false);
    });
  }

  private handleOutOfLives(record: OutcomeRecord): void {
    this.transitioning = true;
    this.clock.stop();
    this.stopChase();
    _th.logToAi('MathALotl.outOfLives', SeverityLevel.Information, this.questionProps());
    this.roundController.recordOutcome(record);
    this.events.emit('questionEnded', {
      wasCorrect: false,
      score: this.roundController.score,
      correctCount: this.roundController.correctCount,
    });
    // No extra end cue: the wrong-catch sound that spent the last life
    // just played; stacking the timeout sound on it would be noise.
    for (const b of this.bubbles) b.popQuiet();
    // "lives" (not "hearts") to match the HUD's "Lives:" row.
    screenBanner(this, 'Out of lives!');
    this.lifecycle.beginRoundEnd();
    this.time.delayedCall(this.cfg.outOfLivesBannerMs, () => this.endRound());
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
    // Sprint 2.5.7 — harder math gets more time per question.
    this.clock.start(questionSeconds(this.speed, this.mathId) * 1000);
    this.speedTimed = false;
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
    const { belowWaterlinePx, widthPx, heightPx, backdropAlpha } = this.cfg.tapHint;
    this.tapHint = createTapHint(this, {
      x: this.scale.width / 2,
      y: this.waterlineY + belowWaterlinePx,
      label: '👆 Tap a bubble!',
      widthPx,
      heightPx,
      backdropAlpha,
    });
  }

  private showTapHint(): void {
    this.tapHint?.show();
  }

  /** Q1-only, so hiding it is final: stop its pulse tween and free it. */
  private hideTapHint(): void {
    this.tapHint?.destroy();
    this.tapHint = undefined;
  }

  // ----- End / cleanup -----------------------------------------------------

  private endRound(): void {
    // Lock the scene: `scene.start(GameOver)` is queued, so this scene
    // still gets one more update — nothing may tick, time out or catch.
    this.roundOver = true;
    this.transitioning = true;
    this.clock.stop();
    this.lifecycle.endRound();
  }

  private cleanup(): void {
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    for (const h of this.keyHandlers) this.input.keyboard?.off(h.event, h.fn);
    this.keyHandlers = [];
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

  quitToMenu(destination?: QuitDestination): void {
    this.time.paused = false;
    this.lifecycle.quitToMenu(destination);
  }
}
