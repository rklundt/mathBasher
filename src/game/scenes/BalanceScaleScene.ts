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
import type { Question, Term } from '@/math/types';
import { termDisplay } from '@/math/equationParts';
import { toMissingNumber, weightError, type MissingNumberQuestion } from '@/math/missingNumber';
import { BalanceWeight } from '@/game/entities/BalanceWeight';
import {
  QuestionClock,
  resolveRetryEvent,
  type OutcomeRecord,
  type RetryDecision,
  type RetryRoundState,
} from '@/game/systems/roundRules';
import { BALANCE_PROP_KEYS, BALANCE_SHEETS, BalanceSceneryKeys, ParticleSpriteKeys } from '@/core/spriteKeys';
import { CALLOUT_INK_CSS } from '@/game/ui/uiPalette';
import { createTapHint, floatNote, screenBanner, type TapHint } from '@/game/ui/callouts';
import { text } from '@/game/ui/typography';
import { NUMBER_KEYS } from '@/game/ui/numberKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { SfxKeys, pickBalanceClankSfx, pickBalanceSuccessSfx, pickRandomPenguinHopSfx } from '@/core/audioKeys';
import { assertNever } from '@/shared/assertNever';

const INK = 0x3a2420;
const DEG = Math.PI / 180;
/** Depths, back to front. */
const Z = {
  props: 1,
  path: 2,
  duck: 3,
  crowd: 4,
  pillar: 5,
  strings: 6,
  pans: 7,
  items: 8,
  beam: 9,
  badge: 10,
  tray: 11,
  focus: 12,
};

type Pose = 'idle' | 'happy' | 'oops';

/**
 * Balance Scale — sprint 2.12's ninth game mode.
 *
 *   1. A balance scale at a sunny fair. One pan holds a sentence with a
 *      missing number ("12 + ?"), the other its total ("17"); reversed on
 *      Medium / Hard ("17 = 12 + ?"). The "?" side starts up: it can't be
 *      weighed yet. Every challenge works (`toMissingNumber`).
 *   2. Tap a weight in the tray (or 1–5, or ← → and Space): it flies onto
 *      the "?" and the beam swings.
 *   3. Right → level, "Balanced!", the crowd cheers, a stone on the path
 *      fills and the duckling hops up; next sentence (new scenery and new
 *      animals). Wrong → it tips the honest way, "Too big! Try a smaller
 *      one" (or smaller), a life lost, the weight hops back and the same
 *      sentence stays. Time up → "Out of time!", a life lost, same
 *      sentence. Last life → "Out of lives!" → round over.
 *   4. Twelve balanced → the duckling cheers at the flag → GameOver.
 * Rules are the shared `resolveRetryEvent` (like Bunny Garden); the HUD's
 * dots and counter give way to the path (`drawsOwnProgress`).
 */
export class BalanceScaleScene extends Phaser.Scene implements GameSceneContract {
  static readonly key = SceneKeys.BalanceScale;
  private readonly gameId = 'balance-scale' as const;
  private readonly cfg = config.balanceScale;

  private mathId!: MathId;
  private speed!: SpeedKey;
  private roundController!: RoundController;
  private lifecycle!: GameSceneLifecycle;

  private pillar!: Phaser.GameObjects.Image;
  private beam!: Phaser.GameObjects.Image;
  private pans: [Phaser.GameObjects.Image, Phaser.GameObjects.Image] | null = null;
  private strings!: Phaser.GameObjects.Graphics;
  /** What sits on each pan, with its x offset from the pan's centre. */
  private panItems: [
    Array<{ obj: Phaser.GameObjects.Container | Phaser.GameObjects.Text; dx: number }>,
    Array<{ obj: Phaser.GameObjects.Container | Phaser.GameObjects.Text; dx: number }>,
  ] = [[], []];
  /** The "?" slot on the blank pan (a weight once one is dropped on it). */
  private slot: BalanceWeight | null = null;
  private tray: BalanceWeight[] = [];
  private trayX: number[] = [];
  private focus = 0;
  private focusRing!: Phaser.GameObjects.Graphics;
  /** The beam's angle in degrees; positive = the left pan down. */
  private tilt = 0;
  private tiltTween?: Phaser.Tweens.Tween;

  private crowd: Phaser.GameObjects.Image[] = [];
  private crowdSet: number[] = [];
  private props: Phaser.GameObjects.Image[] = [];
  private propsBag: number[] = [];
  private propsShown = -1;
  private pathGfx!: Phaser.GameObjects.Graphics;
  private stoneResults: Array<'right' | 'miss'> = [];
  private duck!: Phaser.GameObjects.Sprite;

  private currentQuestion: MissingNumberQuestion | null = null;
  private livesUsed = 0;
  private usedWrong = false;
  private answeredCount = 0;
  /** Input + countdown locked (a weight flying, a result playing, between questions). */
  private busy = false;
  private paused = false;
  private roundOver = false;
  private inputOpenAt = 0;
  private resumedFrame = -1;
  private readonly clock = new QuestionClock();
  private keyHandlers: Array<{ event: string; fn: () => void }> = [];
  private tapHint?: TapHint;

  constructor() {
    super(BalanceScaleScene.key);
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

  drawsOwnProgress(): boolean {
    return true;
  }

  // ----- Lifecycle ---------------------------------------------------------

  create(): void {
    // Phaser reuses scene instances — reset every stateful field.
    this.pans = null;
    this.panItems = [[], []];
    this.slot = null;
    this.tray = [];
    this.trayX = [];
    this.focus = 0;
    this.tilt = 0;
    this.tiltTween = undefined;
    this.crowd = [];
    this.crowdSet = [];
    this.props = [];
    this.propsBag = [];
    this.propsShown = -1;
    this.stoneResults = [];
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
    key('keydown-LEFT', () => this.stepFocus(-1));
    key('keydown-RIGHT', () => this.stepFocus(1));
    // Space only: Enter would also press the HUD's focused Mute button.
    key('keydown-SPACE', () => this.pickFromKey(this.focus));
    NUMBER_KEYS.forEach((name, i) => key(`keydown-${name}`, () => this.pickFromKey(i)));

    this.buildTapHint();
    this.startNextQuestion();
    this.events.once('shutdown', () => this.cleanup());
  }

  private buildWorld(): void {
    this.add.image(0, 0, BalanceSceneryKeys.Fair).setOrigin(0, 0).setDepth(0);
    // Two scenery layers, cross-faded between questions.
    this.props = [0, 1].map(() =>
      this.add.image(0, 0, BALANCE_PROP_KEYS[0]).setOrigin(0, 0).setDepth(Z.props).setAlpha(0),
    );

    const S = this.cfg.scale;
    const P = S.pivot;
    this.pillar = this.add.image(P.x, P.y, BALANCE_SHEETS.pillar.key, 0).setOrigin(0.5, 0).setDepth(Z.pillar);
    this.strings = this.add.graphics().setDepth(Z.strings);
    const pan = (): Phaser.GameObjects.Image =>
      this.add
        .image(0, 0, BALANCE_SHEETS.pan.key)
        .setOrigin(0.5, BALANCE_SHEETS.pan.rimY / BALANCE_SHEETS.pan.frameHeight)
        .setDepth(Z.pans);
    this.pans = [pan(), pan()];
    this.beam = this.add.image(P.x, P.y, BALANCE_SHEETS.beam.key).setDepth(Z.beam);
    this.add.image(P.x, P.y, BALANCE_SHEETS.badge.key).setDepth(Z.badge);

    this.pathGfx = this.add.graphics().setDepth(Z.path);
    const [x0, y0] = this.stone(0);
    this.duck = this.add
      .sprite(x0, y0 - this.cfg.path.duckAbovePx, BALANCE_SHEETS.duck.key, 0)
      .setOrigin(0.5, 1)
      .setScale(this.cfg.path.duckScale)
      .setDepth(Z.duck);
    this.drawPath();

    this.focusRing = this.add.graphics().setDepth(Z.focus);
    this.layoutScale();
  }

  override update(_time: number, dt: number): void {
    if (this.paused || this.roundOver) return;
    this.layoutScale();
    if (this.busy) return;
    if (this.clock.tick(dt)) this.handleTimeout();
  }

  // ----- The scale ---------------------------------------------------------

  /** Hook positions for the current tilt, then the pans, their contents and the strings. */
  private layoutScale(): void {
    if (!this.pans) return;
    const S = this.cfg.scale;
    const P = S.pivot;
    const reach = BALANCE_SHEETS.beam.frameWidth / 2 - BALANCE_SHEETS.beam.hookInsetPx;
    const t = this.tilt * DEG;
    this.beam.setRotation(-t);
    const hooks: Array<[number, number]> = [
      [P.x - reach * Math.cos(t), P.y + reach * Math.sin(t)],
      [P.x + reach * Math.cos(t), P.y - reach * Math.sin(t)],
    ];
    const halfRim = BALANCE_SHEETS.pan.frameWidth / 2 - 20;
    this.strings.clear();
    this.strings.lineStyle(4, 0x8a6d3b, 1);
    hooks.forEach(([hx, hy], i) => {
      const rimY = hy + S.hangPx;
      this.pans?.[i].setPosition(hx, rimY);
      this.strings.lineBetween(hx, hy, hx - halfRim, rimY);
      this.strings.lineBetween(hx, hy, hx + halfRim, rimY);
      for (const it of this.panItems[i]) {
        if (it.obj instanceof BalanceWeight) it.obj.setPosition(hx + it.dx, rimY);
        else it.obj.setPosition(hx + it.dx, rimY - 46);
      }
    });
  }

  /** Swing the beam to `deg` (a small overshoot reads as a wobble). */
  private swingTo(deg: number, ms: number, onDone?: () => void): void {
    this.tiltTween?.remove();
    this.tiltTween = this.tweens.addCounter({
      from: this.tilt,
      to: deg,
      duration: ms,
      ease: 'Back.Out',
      onUpdate: (tw) => {
        this.tilt = tw.getValue() ?? deg;
      },
      onComplete: () => {
        this.tilt = deg;
        onDone?.();
      },
    });
  }

  /** The "?" side up: it can't be weighed yet. */
  private startTilt(q: MissingNumberQuestion): number {
    const blankPanLeft = !q.sentence.reversed;
    return blankPanLeft ? -this.cfg.scale.startTiltDeg : this.cfg.scale.startTiltDeg;
  }

  /** How the beam settles with `chosen` on the "?": level when right, tipped by how far off when not. */
  private tiltFor(q: MissingNumberQuestion, chosen: number): number {
    const S = this.cfg.scale;
    const err = weightError(q.sentence, chosen);
    if (err === 0) return 0;
    const m = S.minTiltDeg + (S.maxTiltDeg - S.minTiltDeg) * Math.min(1, Math.abs(err) / S.fullTiltAt);
    const blankPanLeft = !q.sentence.reversed;
    const blankDown = err > 0;
    return blankPanLeft === blankDown ? m : -m;
  }

  /** Lay the sentence out on the pans: the blank side ("12", "+", "?"), the total on the other. */
  private placeSentence(q: MissingNumberQuestion): void {
    for (const side of this.panItems) for (const it of side) it.obj.destroy();
    this.panItems = [[], []];
    const gap = this.cfg.scale.panItemGapPx;
    const colours = Phaser.Utils.Array.Shuffle([0, 1, 2, 3, 4]);
    const scale = this.cfg.scale.itemScale;
    const weight = (t: Term, colour: number): BalanceWeight =>
      new BalanceWeight(this, 0, 0).setWeight(colour, t.value, termDisplay(t)).setScale(scale).setDepth(Z.items);

    const s = q.sentence;
    const blankSide = s.reversed ? 1 : 0;
    const items: Array<{ obj: Phaser.GameObjects.Container | Phaser.GameObjects.Text; dx: number }> = [];
    s.operands.forEach((t, i) => {
      const dx = i === 0 ? -gap : gap;
      if (t === null) {
        this.slot = new BalanceWeight(this, 0, 0).setSlot().setScale(scale).setDepth(Z.items);
        items.push({ obj: this.slot, dx });
      } else {
        items.push({ obj: weight(t, colours[i]), dx });
      }
    });
    items.push({ obj: text(this, 0, 0, s.op, 'panOp').setOrigin(0.5).setDepth(Z.items), dx: 0 });
    this.panItems[blankSide] = items;
    this.panItems[1 - blankSide] = [{ obj: weight(s.total, colours[2]), dx: 0 }];
    this.layoutScale();
  }

  // ----- The tray ----------------------------------------------------------

  private placeTray(q: MissingNumberQuestion): void {
    for (const w of this.tray) w.destroy();
    const T = this.cfg.tray;
    const n = q.choices.length;
    const step = n > 1 ? (T.right - T.left) / (n - 1) : 0;
    const startX = n > 1 ? T.left : (T.left + T.right) / 2;
    const colours = Phaser.Utils.Array.Shuffle([0, 1, 2, 3, 4]);
    this.trayX = q.choices.map((_, i) => startX + i * step);
    this.tray = q.choices.map((v, i) =>
      new BalanceWeight(this, this.trayX[i], T.bottomY)
        .setWeight(colours[i % colours.length], v, q.choiceDisplays?.[i] ?? String(v))
        .setScale(T.scale)
        .setDepth(Z.tray),
    );
    this.focus = Math.min(this.focus, n - 1);
    this.drawFocus();
  }

  private drawFocus(): void {
    this.focusRing.clear();
    const x = this.trayX[this.focus];
    if (x === undefined || !this.tray[this.focus]?.visible) return;
    const T = this.cfg.tray;
    this.focusRing.lineStyle(5, 0x2563eb, 0.95);
    this.focusRing.strokeRoundedRect(x - 62, T.bottomY - 128, 124, 136, 20);
  }

  // ----- Crowd, scenery, path ----------------------------------------------

  /** Three animals from the pool, never the same set as last time. */
  private newCrowd(): void {
    const C = this.cfg.crowd;
    const pool = BALANCE_SHEETS.crowd.animals.length;
    let pick: number[];
    do {
      pick = Phaser.Utils.Array.Shuffle([...Array(pool).keys()]).slice(0, C.slots.length);
    } while (pick.every((a, i) => this.crowdSet[i] === a));
    this.crowdSet = pick;
    for (const old of this.crowd) {
      this.tweens.add({ targets: old, alpha: 0, duration: C.swapMs, onComplete: () => old.destroy() });
    }
    const S = BALANCE_SHEETS.crowd;
    this.crowd = C.slots.map((slot, i) => {
      const img = this.add
        .image(slot.x, C.bottomY + 30, S.key, pick[i] * 3 + S.poses.idle)
        .setOrigin(0.5, S.bottomY / S.frameHeight)
        .setScale(slot.scale)
        .setDepth(Z.crowd)
        .setAlpha(0);
      // They peek up over the fence.
      this.tweens.add({ targets: img, y: C.bottomY, alpha: 1, duration: C.swapMs, delay: 80 * i, ease: 'Back.Out' });
      return img;
    });
  }

  private crowdPose(pose: Pose): void {
    const S = BALANCE_SHEETS.crowd;
    this.crowd.forEach((img, i) => {
      img.setFrame(this.crowdSet[i] * 3 + S.poses[pose]);
      if (pose === 'happy')
        this.tweens.add({ targets: img, y: img.y - 14, duration: 140, yoyo: true, repeat: 1, ease: 'Quad.Out' });
    });
  }

  /** The next side-scenery version, cross-faded in (all six before a repeat). */
  private nextProps(): void {
    if (this.propsBag.length === 0) {
      this.propsBag = Phaser.Utils.Array.Shuffle([...BALANCE_PROP_KEYS.keys()]);
      if (this.propsBag[0] === this.propsShown) this.propsBag.push(this.propsBag.shift() ?? 0);
    }
    const next = this.propsBag.shift() ?? 0;
    this.propsShown = next;
    const [front, back] = this.props;
    back.setTexture(BALANCE_PROP_KEYS[next]).setAlpha(0);
    this.tweens.add({ targets: back, alpha: 1, duration: this.cfg.propsFadeMs });
    this.tweens.add({ targets: front, alpha: 0, duration: this.cfg.propsFadeMs });
    this.props = [back, front];
  }

  /** Stone centre `i` (0 = the first question, at the bottom). */
  private stone(i: number): [number, number] {
    const p = this.cfg.path;
    const t = i / (p.stones - 1);
    return [p.x + Math.sin(t * Math.PI * p.turns) * p.amplitude, p.bottomY - t * (p.bottomY - p.topY)];
  }

  /** Green ✓ = right first try; amber ★ = right after a miss; the current stone ringed. */
  private drawPath(): void {
    const g = this.pathGfx;
    const r = this.cfg.path.stoneRadius;
    g.clear();
    for (let i = 0; i < this.cfg.path.stones; i++) {
      const [x, y] = this.stone(i);
      const res = this.stoneResults[i];
      g.fillStyle(res === 'right' ? 0x4ade80 : res === 'miss' ? 0xfbbf24 : 0xffffff, 1);
      g.fillCircle(x, y, r);
      g.lineStyle(3, INK, 1);
      g.strokeCircle(x, y, r);
      if (res === 'right') {
        g.lineStyle(5, INK, 1);
        g.beginPath();
        g.moveTo(x - 10, y);
        g.lineTo(x - 3, y + 8);
        g.lineTo(x + 11, y - 9);
        g.strokePath();
      } else if (res === 'miss') {
        g.fillStyle(INK, 1);
        g.fillCircle(x, y, 6);
      }
      if (i === this.stoneResults.length && !this.roundOver) {
        g.lineStyle(4, 0x2563eb, 0.9);
        g.strokeCircle(x, y, r + 6);
      }
    }
  }

  private duckHop(toIndex: number, cheer: boolean): void {
    const i = Math.min(toIndex, this.cfg.path.stones - 1);
    const [x, y] = this.stone(i);
    const above = this.cfg.path.duckAbovePx;
    const S = BALANCE_SHEETS.duck.poses;
    this.duck.setFrame(S.hop);
    getAudioManager().play(pickRandomPenguinHopSfx(), 'sfx');
    this.tweens.add({
      targets: this.duck,
      x,
      y: y - above,
      duration: this.cfg.path.hopMs,
      ease: 'Quad.InOut',
      onComplete: () => this.duck.setFrame(cheer ? S.cheer : S.idle),
    });
  }

  // ----- Input -------------------------------------------------------------

  private inputOpen(): boolean {
    return !this.paused && !this.busy && !this.roundOver && this.time.now >= this.inputOpenAt;
  }

  /** A tap anywhere in a weight's column of the tray picks it. */
  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (!this.inputOpen()) return;
    const T = this.cfg.tray;
    if (pointer.y < T.tapTop) return;
    const half = this.trayX.length > 1 ? (this.trayX[1] - this.trayX[0]) / 2 : 80;
    const i = this.trayX.findIndex((x) => Math.abs(pointer.x - x) <= half);
    if (i >= 0 && this.tray[i]?.visible) this.pick(i);
  }

  /** Keys are ignored on the frame the game resumes (the key that pressed Resume mustn't also drop). */
  private keysOpen(): boolean {
    return this.inputOpen() && this.game.loop.frame !== this.resumedFrame;
  }

  private stepFocus(dir: -1 | 1): void {
    if (!this.keysOpen()) return;
    this.focus = Math.max(0, Math.min(this.tray.length - 1, this.focus + dir));
    this.drawFocus();
  }

  private pickFromKey(i: number): void {
    if (!this.keysOpen() || i >= this.tray.length) return;
    this.focus = i;
    this.drawFocus();
    this.pick(i);
  }

  /** Drop weight `i` onto the "?": it flies over, the beam swings, then the result plays. */
  private pick(i: number): void {
    const q = this.currentQuestion;
    const w = this.tray[i];
    const slot = this.slot;
    if (!q || !w || !slot) return;
    this.busy = true;
    this.clock.stop();
    this.hideTapHint();
    this.focusRing.clear();
    const decision = resolveRetryEvent(this.retryState(), { type: 'pick', answer: w.value });
    // Sprint 2.12 review — the tap decides it when it's the round's last
    // right answer or its last life: pause closes now, not after the
    // animation (quitting in that gap would lose the round's end).
    if (
      decision.kind === 'out-of-lives' ||
      (decision.kind === 'correct' && this.answeredCount + 1 >= this.roundController.questionsPerRound)
    ) {
      this.lifecycle.beginRoundEnd();
    }
    getAudioManager().play(pickRandomPenguinHopSfx(), 'sfx');
    w.setDepth(Z.focus + 1);
    this.tweens.add({
      targets: w,
      x: slot.x,
      y: slot.y,
      scale: this.cfg.scale.itemScale,
      duration: this.cfg.flyMs,
      ease: 'Quad.InOut',
      onComplete: () => {
        w.setVisible(false);
        slot.setWeight(w.colour, w.value, w.display);
        this.swingTo(this.tiltFor(q, w.value), this.cfg.scale.swingMs, () => this.applyPick(decision, i));
      },
    });
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

  private applyPick(decision: RetryDecision, i: number): void {
    switch (decision.kind) {
      case 'correct':
        this.handleBalanced(decision.record);
        break;
      case 'wrong':
      case 'out-of-lives':
        this.handleOff(decision, i);
        break;
      case 'timeout':
        // A pick is never a time-out; if it ever were, give the sentence back rather than lock the round.
        _th.logToAi('BalanceScale.unexpectedOutcome.pick', SeverityLevel.Error, this.questionProps());
        this.retry(i);
        break;
      default:
        assertNever(decision, 'pick outcome');
    }
  }

  private handleBalanced(record: OutcomeRecord): void {
    // The owner's "Balanced!" fanfare (it borrowed Alien Shoot's hit, an explosion, before).
    getAudioManager().play(pickBalanceSuccessSfx(), 'sfx');
    this.pillar.setFrame(BALANCE_SHEETS.pillar.frames.happy);
    this.crowdPose('happy');
    const P = this.cfg.scale.pivot;
    this.playSparkle(P.x, P.y);
    floatNote(this, P.x, P.y - 80, 'Balanced!', this.cfg.note);
    // The clock stopped at the tap: the flight and the swing aren't counted.
    const { scoreDelta, speedTier } = this.roundController.recordOutcome({
      ...record,
      timeUsed: this.clock.fractionUsed,
    });
    const slot = this.slot;
    this.events.emit('correctHit', { x: slot?.x ?? P.x, y: (slot?.y ?? P.y) - 120, scoreDelta, speedTier });
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
    this.stoneResults.push(this.usedWrong ? 'miss' : 'right');
    this.answeredCount += 1;
    this.roundController.advanceQuestionIndex();
    const last = this.answeredCount >= this.roundController.questionsPerRound;
    this.drawPath();
    this.duckHop(this.answeredCount, last);
    this.time.delayedCall(this.cfg.correctHoldMs, () => {
      if (this.roundOver) return;
      if (last) this.finish();
      else this.startNextQuestion();
    });
  }

  /** Off balance: "Too big!" / "Too small!", a life lost; the weight hops back and the sentence stays (or the round ends). */
  private handleOff(decision: Extract<RetryDecision, { kind: 'wrong' | 'out-of-lives' }>, i: number): void {
    const q = this.currentQuestion;
    // The owner's hollow clank, a little under the other sounds (AUDIO_GAIN).
    getAudioManager().play(pickBalanceClankSfx(), 'sfx');
    this.pillar.setFrame(BALANCE_SHEETS.pillar.frames.dizzy);
    this.crowdPose('oops');
    this.spendLife(decision);
    _th.logToAi('BalanceScale.wrong', SeverityLevel.Information, this.questionProps());
    const outOfLives = decision.kind === 'out-of-lives';
    const tooBig = q !== null && (this.tray[i]?.value ?? 0) > q.correctAnswer;
    // About the NUMBER, not the pan: on "17 − ?" a bigger weight makes its pan lighter.
    const msg = outOfLives
      ? tooBig
        ? 'Too big!'
        : 'Too small!'
      : tooBig
        ? 'Too big! Try a smaller one'
        : 'Too small! Try a bigger one';
    const P = this.cfg.scale.pivot;
    floatNote(this, P.x, P.y - 80, msg, this.cfg.note);
    this.time.delayedCall(this.cfg.wrongHoldMs, () => {
      if (outOfLives) this.handleOutOfLives(decision.record);
      else this.retry(i);
    });
  }

  /** Time's up: "Out of time!", a life lost; the same sentence with full time. */
  private handleTimeout(): void {
    this.busy = true;
    this.hideTapHint();
    this.focusRing.clear();
    const decision = resolveRetryEvent(this.retryState(), { type: 'timeout' });
    if (decision.kind === 'correct') {
      _th.logToAi('BalanceScale.unexpectedOutcome.timeout', SeverityLevel.Error, this.questionProps());
      this.reopen();
      return;
    }
    // Sprint 2.12 review — the last life: pause closes now, not when the banner ends.
    if (decision.kind === 'out-of-lives') this.lifecycle.beginRoundEnd();
    getAudioManager().play(SfxKeys.TimeoutFail1, 'sfx');
    this.pillar.setFrame(BALANCE_SHEETS.pillar.frames.dizzy);
    this.crowdPose('oops');
    _th.logToAi('BalanceScale.timeout', SeverityLevel.Information, this.questionProps());
    // "Out of time!" shows even on the last life, so the kid knows why the round ends.
    const banner = screenBanner(this, 'Out of time!');
    this.spendLife(decision);
    this.time.delayedCall(this.cfg.timeoutBannerMs, () => {
      banner.destroy();
      if (decision.kind === 'out-of-lives') this.handleOutOfLives(decision.record);
      else this.reopen();
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
    _th.logToAi('BalanceScale.outOfLives', SeverityLevel.Information, this.questionProps());
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

  /** The wrong weight hops back to the tray, the "?" returns and the beam goes back to the start. */
  private retry(i: number): void {
    const q = this.currentQuestion;
    const w = this.tray[i];
    const slot = this.slot;
    if (!q || this.roundOver) return;
    if (w && slot) {
      w.setPosition(slot.x, slot.y).setScale(this.cfg.scale.itemScale).setVisible(true);
      slot.setSlot();
      this.tweens.add({
        targets: w,
        x: this.trayX[i],
        y: this.cfg.tray.bottomY,
        scale: this.cfg.tray.scale,
        duration: this.cfg.returnMs,
        ease: 'Quad.Out',
        onComplete: () => w.setDepth(Z.tray),
      });
    }
    this.swingTo(this.startTilt(q), this.cfg.resetMs, () => this.reopen());
  }

  /** Faces back to normal, full time again, taps open. */
  private reopen(): void {
    if (this.roundOver) return;
    this.pillar.setFrame(BALANCE_SHEETS.pillar.frames.idle);
    this.crowdPose('idle');
    this.clock.start(this.totalSec() * 1000);
    this.busy = false;
    this.drawFocus();
  }

  /** Twelve balanced: the duckling cheers at the flag. */
  private finish(): void {
    this.busy = true;
    this.drawPath();
    const [fx, fy] = this.stone(this.cfg.path.stones - 1);
    this.playSparkle(fx, fy - 60);
    const banner = screenBanner(this, 'All balanced!', { style: 'stars' });
    banner.setStroke(CALLOUT_INK_CSS, this.cfg.finishBannerStrokePx);
    const pop = this.cfg.finishBannerPop;
    banner.setScale(pop.fromScale);
    this.tweens.add({ targets: banner, scale: 1, duration: pop.ms, ease: 'Back.Out' });
    this.crowdPose('happy');
    _th.logToAi('BalanceScale.finished', SeverityLevel.Information, {
      gameId: this.gameId,
      mathId: this.mathId,
      speed: this.speed,
      strikesUsed: String(this.livesUsed),
    });
    this.time.delayedCall(this.cfg.celebrateMs, () => this.endRound(true));
  }

  // ----- Question flow -----------------------------------------------------

  /** The next sentence: new scenery and animals, the "?" side up, then taps open. */
  private startNextQuestion(): void {
    if (this.roundOver) return;
    const S = this.cfg.speed[this.speed];
    let q: MissingNumberQuestion | null = null;
    for (let tries = 0; tries < 40 && q === null; tries++) {
      const base = this.roundController.drawNextQuestion();
      if (base === null) {
        this.endRound(true);
        return;
      }
      q = toMissingNumber(base, { count: S.weights, reversedAllowed: S.reversed, rng: Math.random });
    }
    if (q === null) {
      // Every challenge yields fair sentences (tested); never leave the round stuck if one didn't.
      _th.logToAi('BalanceScale.noSentence', SeverityLevel.Error, this.questionProps());
      this.endRound(false);
      return;
    }
    this.currentQuestion = q;
    this.usedWrong = false;
    this.busy = true;
    this.clock.stop();
    this.pillar.setFrame(BALANCE_SHEETS.pillar.frames.idle);
    this.duck.setFrame(BALANCE_SHEETS.duck.poses.idle);
    this.nextProps();
    this.newCrowd();
    this.placeSentence(q);
    this.placeTray(q);
    this.drawPath();
    const first = this.roundController.questionIndex === 0;
    if (first) {
      this.tilt = this.startTilt(q);
      this.layoutScale();
    } else {
      this.swingTo(this.startTilt(q), this.cfg.resetMs);
    }
    if (first) this.tapHint?.show();
    _th.logToAi('QuestionStarted', SeverityLevel.Information, this.questionProps());
    this.events.emit('questionStarted', {
      question: q,
      index: this.roundController.questionIndex,
      total: this.roundController.questionsPerRound,
    });
    // Taps and the clock open together once the scale has settled.
    this.inputOpenAt = this.time.now + this.cfg.inputLockMs;
    this.time.delayedCall(this.cfg.inputLockMs, () => {
      if (this.roundOver) return;
      this.clock.start(this.totalSec() * 1000);
      this.busy = false;
      this.drawFocus();
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

  /** "👆 Tap the weight that makes both sides the same!" on the first sentence; gone on the first tap. */
  private buildTapHint(): void {
    const { y, heightPx, backdropAlpha } = this.cfg.tapHint;
    this.tapHint = createTapHint(this, {
      x: this.cfg.scale.pivot.x,
      y,
      label: '👆 Tap the weight that makes both sides the same!',
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
    this.tiltTween?.remove();
    this.pans = null;
    this.tray = [];
    this.panItems = [[], []];
    this.slot = null;
    this.crowd = [];
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
