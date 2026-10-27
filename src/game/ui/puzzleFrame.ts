// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { BALANCE_SHEETS, PAIR_PALS_PICTURE_KEYS, PUZZLE_SHEETS } from '@/core/spriteKeys';
import type { Token } from '@/game/systems/puzzles/tokens';
import { text } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';
import { createIconButton } from '@/game/ui/IconButton';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { CALLOUT_INK, SELECTED_AMBER } from '@/game/ui/uiPalette';

/**
 * Sprint 2.14 — the puzzle pack's shared frame: the pieces every puzzle's
 * scene uses, so the seven look and behave alike. Tokens drawn from their
 * data, the backdrops that change between puzzles, the top bar with its
 * progress bar, the two dancing animals, the prompt pill, the answer cards
 * and the end-of-round panel.
 */

const P = config.puzzles;
const L = P.layout;
const INK = 0x3a2420;
const CARD = 0xfffaf0;

/** Depths every puzzle scene shares. */
export const PUZZLE_DEPTH = { backdrop: 0, dancers: 5, stage: 10, tray: 20, bar: 30, note: 40, panel: 50 } as const;

// ---------------------------------------------------------------- tokens

/**
 * A token drawn `px` across: a shape (its size, turn, flip, how many, hat),
 * a spin shape (turned, maybe mirrored) or a Pair Pals picture.
 */
export function drawToken(scene: Phaser.Scene, token: Token, px: number): Phaser.GameObjects.Container {
  const box = scene.add.container(0, 0);
  if (token.kind === 'picture') {
    box.add(scene.add.image(0, 0, PAIR_PALS_PICTURE_KEYS[token.sheet], token.frame).setDisplaySize(px * 0.9, px * 0.9));
    return box;
  }
  if (token.kind === 'spin') {
    const frame = token.colour * PUZZLE_SHEETS.spin.cols + token.shape;
    const img = scene.add.image(0, 0, PUZZLE_SHEETS.spin.key, frame).setDisplaySize(px, px);
    img.setFlipX(token.flip).setAngle(token.turn * 90);
    box.add(img);
    return box;
  }
  const frame = token.colour * PUZZLE_SHEETS.tokens.cols + token.shape;
  const size = px * P.sizeScales[token.size];
  // Copies: one in the middle; two side by side; three in a triangle.
  const spots =
    token.count === 1
      ? [[0, 0]]
      : token.count === 2
        ? [
            [-0.24, 0],
            [0.24, 0],
          ]
        : [
            [0, -0.2],
            [-0.24, 0.2],
            [0.24, 0.2],
          ];
  const each = token.count === 1 ? size : size * 0.5;
  for (const [dx, dy] of spots) {
    const piece = scene.add.container(dx * px, dy * px);
    const img = scene.add.image(0, 0, PUZZLE_SHEETS.tokens.key, frame).setDisplaySize(each, each);
    img.setFlipX(token.flip);
    piece.add(img);
    if (token.hat !== null) {
      const hatName = P.hats[token.hat];
      const hat = scene.add.image(0, 0, PUZZLE_SHEETS.hats.key, token.hat).setDisplaySize(each * 0.62, each * 0.62);
      // Glasses sit on the face; the rest on top of the head.
      if (hatName === 'glasses') hat.setPosition(0, -each * 0.02);
      else hat.setOrigin(0.5, 1).setPosition(0, -each * 0.2);
      piece.add(hat);
    }
    piece.setAngle(token.turn * 90);
    box.add(piece);
  }
  return box;
}

/** A cream card (`w` × `h`) with a token on it. */
export function tokenCard(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  token: Token | null,
): Phaser.GameObjects.Container {
  const card = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(CARD, 1).fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.14);
  g.lineStyle(4, INK, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.14);
  card.add(g);
  if (token !== null) card.add(drawToken(scene, token, Math.min(w, h) * 0.86));
  return card;
}

/** The dashed "?" card of the missing piece. */
export function questionCard(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
): Phaser.GameObjects.Container {
  const card = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 0.85).fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.14);
  // A dashed outline: short strokes along each side.
  g.lineStyle(4, 0x7a849c, 1);
  const dash = 12;
  for (let x0 = -w / 2 + 10; x0 < w / 2 - 10; x0 += dash * 2) {
    g.lineBetween(x0, -h / 2, Math.min(x0 + dash, w / 2 - 10), -h / 2);
    g.lineBetween(x0, h / 2, Math.min(x0 + dash, w / 2 - 10), h / 2);
  }
  for (let y0 = -h / 2 + 10; y0 < h / 2 - 10; y0 += dash * 2) {
    g.lineBetween(-w / 2, y0, -w / 2, Math.min(y0 + dash, h / 2 - 10));
    g.lineBetween(w / 2, y0, w / 2, Math.min(y0 + dash, h / 2 - 10));
  }
  const q = text(scene, 0, 0, '?', 'h2').setOrigin(0.5).setColor('#7a849c');
  card.add([g, q]);
  scene.tweens.add({ targets: q, scale: 1.12, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  return card;
}

// ---------------------------------------------------------------- backdrops

/** The puzzle's backdrops, one shown at a time, cross-fading to the next. */
export class PuzzleBackdrop {
  private readonly images: Phaser.GameObjects.Image[];
  private current = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    keys: readonly string[],
  ) {
    this.images = keys.map((k) => scene.add.image(0, 0, k).setOrigin(0).setAlpha(0).setDepth(PUZZLE_DEPTH.backdrop));
  }

  /** Show backdrop `i` (wrapping), fading from the one before. */
  show(i: number): void {
    const next = i % this.images.length;
    if (next === this.current) return;
    const ms = this.current < 0 ? 0 : P.timings.backdropFadeMs;
    const old = this.current >= 0 ? this.images[this.current] : null;
    const img = this.images[next];
    img.setDepth(PUZZLE_DEPTH.backdrop + 1);
    old?.setDepth(PUZZLE_DEPTH.backdrop);
    this.scene.tweens.add({
      targets: img,
      alpha: 1,
      duration: ms,
      onComplete: () => old?.setAlpha(0),
    });
    this.current = next;
  }
}

// ---------------------------------------------------------------- top bar + progress

/** A puzzle's step: green (right first try, in time), yellow (right after misses or slower), red (missed). */
export type StepState = 'green' | 'yellow' | 'red';
const STEP_COLOURS: Record<StepState, number> = { green: 0x4ade80, yellow: 0xfacc15, red: 0xf87171 };

/** The slim top bar (name, mute, pause) and the progress bar under it: one step per puzzle. */
export class PuzzleTopBar {
  private readonly steps: Phaser.GameObjects.Rectangle[] = [];
  private pulse?: Phaser.Tweens.Tween;

  constructor(
    private readonly scene: Phaser.Scene,
    title: string,
    total: number,
    onPause: () => void,
    leftLabel?: string,
  ) {
    const { width } = scene.scale;
    const B = L.topBar;
    scene.add.rectangle(0, 0, width, B.height, CALLOUT_INK, 0.45).setOrigin(0).setDepth(PUZZLE_DEPTH.bar);
    const name = text(scene, width / 2, B.y, title, 'accent')
      .setOrigin(0.5)
      .setDepth(PUZZLE_DEPTH.bar);
    applyTextOutline(name);
    this.leftText = text(scene, 24, B.y, leftLabel ?? '', 'sectionLabel')
      .setOrigin(0, 0.5)
      .setDepth(PUZZLE_DEPTH.bar);
    applyTextOutline(this.leftText);

    const w = 44;
    const pause = createIconButton({
      scene,
      x: width - 16 - w / 2,
      y: B.y,
      width: w,
      height: 36,
      render: (c) => {
        c.add([scene.add.rectangle(-6, 0, 5, 18, 0xeaeaf2), scene.add.rectangle(6, 0, 5, 18, 0xeaeaf2)]);
        return undefined;
      },
      onActivate: onPause,
    });
    pause.setDepth(PUZZLE_DEPTH.bar);
    createMuteIconButton(scene, width - 16 - w - 24 - w / 2, B.y).setDepth(PUZZLE_DEPTH.bar);

    // The progress bar: a pill holding one step per puzzle.
    const G = L.progress;
    const stepW = (G.width - (total - 1) * G.gap) / total;
    const x0 = width / 2 - G.width / 2;
    scene.add
      .rectangle(width / 2, G.y, G.width + 16, G.height + 12, CALLOUT_INK, 0.35)
      .setDepth(PUZZLE_DEPTH.bar)
      .setStrokeStyle(2, 0xffffff, 0.5);
    for (let i = 0; i < total; i++) {
      const step = scene.add
        .rectangle(x0 + stepW / 2 + i * (stepW + G.gap), G.y, stepW, G.height, 0xffffff, 0.35)
        .setDepth(PUZZLE_DEPTH.bar)
        .setStrokeStyle(2, 0xffffff, 0.7);
      this.steps.push(step);
    }
  }

  private readonly leftText: Phaser.GameObjects.Text;

  setLeft(label: string): void {
    this.leftText.setText(label);
  }

  /** The puzzle being played pulses. */
  setCurrent(i: number): void {
    this.pulse?.stop();
    this.steps.forEach((s, j) => {
      if (j !== i) s.setScale(1);
    });
    const step = this.steps[i];
    if (!step) return;
    this.pulse = this.scene.tweens.add({
      targets: step,
      scaleY: 1.35,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  /** A puzzle done: green, yellow or red. */
  mark(i: number, state: StepState): void {
    const step = this.steps[i];
    if (!step) return;
    this.pulse?.stop();
    step.setScale(1).setFillStyle(STEP_COLOURS[state], 1);
    this.scene.tweens.add({ targets: step, scaleY: 1.6, duration: 160, yoyo: true, ease: 'Back.Out' });
  }
}

// ---------------------------------------------------------------- dancers

/**
 * Two animals from Balance Scale's crowd at the bottom corners, swaying
 * slowly; they cheer on a right answer and say "Oh!" on a wrong one, and
 * new ones come in every few puzzles.
 */
export class PuzzleDancers {
  private readonly sprites: Phaser.GameObjects.Sprite[] = [];
  private readonly hops: (Phaser.Tweens.Tween | undefined)[] = [];
  private animals: number[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    const C = BALANCE_SHEETS.crowd;
    L.dancers.forEach((d, i) => {
      const s = scene.add
        .sprite(d.x, d.bottomY, C.key, 0)
        .setOrigin(0.5, 1)
        .setScale(d.scale)
        .setDepth(PUZZLE_DEPTH.dancers);
      if (i === 1) s.setFlipX(true);
      s.setAngle(-P.timings.swayDeg);
      scene.tweens.add({
        targets: s,
        angle: P.timings.swayDeg,
        duration: P.timings.swayMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
        delay: i * 700,
      });
      this.sprites.push(s);
    });
    this.swap(true);
  }

  /** The crowd sheet is each animal's poses in a row (idle, happy, oops). */
  private frame(slot: number, pose: number): number {
    return this.animals[slot] * Object.keys(BALANCE_SHEETS.crowd.poses).length + pose;
  }

  private pose(pose: number): void {
    this.sprites.forEach((s, i) => s.setFrame(this.frame(i, pose)));
  }

  /** New animals (never the same pair twice running). */
  swap(instant = false): void {
    const n = BALANCE_SHEETS.crowd.animals.length;
    const prev = new Set(this.animals);
    const next: number[] = [];
    while (next.length < this.sprites.length) {
      const a = Math.floor(Math.random() * n);
      if (!next.includes(a) && !prev.has(a)) next.push(a);
    }
    if (instant) {
      this.animals = next;
      this.pose(0);
      return;
    }
    this.scene.tweens.add({
      targets: this.sprites,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        this.animals = next;
        this.pose(0);
        this.scene.tweens.add({ targets: this.sprites, alpha: 1, duration: 260 });
      },
    });
  }

  /** A right answer: a happy hop. */
  cheer(): void {
    this.pose(1);
    this.sprites.forEach((s, i) => {
      // Always hop from the resting spot (quick answers mustn't stack the hops).
      this.hops[i]?.stop();
      const base = L.dancers[i].bottomY;
      s.setY(base);
      this.hops[i] = this.scene.tweens.add({
        targets: s,
        y: base - 26,
        duration: 180,
        yoyo: true,
        repeat: 1,
        ease: 'Quad.Out',
      });
    });
    this.scene.time.delayedCall(900, () => this.pose(0));
  }

  /** A wrong answer: "Oh!" for a moment. */
  oops(): void {
    this.pose(2);
    this.scene.time.delayedCall(700, () => this.pose(0));
  }
}

// ---------------------------------------------------------------- prompt + notes

/**
 * The prompt pill under the progress bar. It also says how an answer went
 * ("Try again!", "The others are all stars!") for a moment, in colour, so
 * nothing ever covers the puzzle.
 */
export class PromptPill {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private base = '';
  private flashTimer?: Phaser.Time.TimerEvent;

  constructor(private readonly scene: Phaser.Scene) {
    const { width } = scene.scale;
    this.bg = scene.add
      .rectangle(width / 2, L.prompt.y, 400, L.prompt.heightPx, CALLOUT_INK, 0.62)
      .setDepth(PUZZLE_DEPTH.bar)
      .setStrokeStyle(2, 0xffffff, 0.6);
    this.label = text(scene, width / 2, L.prompt.y, '', 'rowLabel')
      .setOrigin(0.5)
      .setDepth(PUZZLE_DEPTH.bar);
  }

  setText(s: string): void {
    this.base = s;
    this.flashTimer?.remove(false);
    this.flashTimer = undefined;
    this.show(s, '#ffffff', 0x0b1020);
  }

  /** Say how it went for a moment (green: right; amber: try again), then back to the prompt. */
  flash(msg: string, kind: 'good' | 'retry', ms = 1300): void {
    this.flashTimer?.remove(false);
    this.show(msg, kind === 'good' ? '#bbf7d0' : '#fde68a', kind === 'good' ? 0x166534 : 0x92400e);
    this.label.setScale(0.8);
    this.scene.tweens.add({ targets: this.label, scale: 1, duration: 180, ease: 'Back.Out' });
    this.flashTimer = this.scene.time.delayedCall(ms, () => {
      this.flashTimer = undefined;
      this.show(this.base, '#ffffff', 0x0b1020);
    });
  }

  private show(s: string, colour: string, fill: number): void {
    this.label.setText(s).setColor(colour);
    this.bg.setFillStyle(fill, 0.72);
    this.bg.setSize(this.label.width + 56, L.prompt.heightPx);
    this.bg.setOrigin(0.5);
  }
}

/** A short sparkle burst. */
export function sparkle(scene: Phaser.Scene, x: number, y: number, count = 12): void {
  const burst = scene.add.particles(x, y, 'star_05', {
    speed: { min: 80, max: 220 },
    scale: { start: 0.42, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: 560,
    tint: [0xffc21a, 0xff6fa8, 0x9b6bff, 0x37c3ff],
    emitting: false,
  });
  burst.setDepth(PUZZLE_DEPTH.note);
  burst.explode(count);
  scene.time.delayedCall(650, () => burst.destroy());
}

// ---------------------------------------------------------------- the answer tray

/** The tray of answer cards along the bottom; tap one (or 1–5, ← → and Space / Enter). */
export class AnswerTray {
  readonly cards: Phaser.GameObjects.Container[] = [];
  private readonly zones: Phaser.GameObjects.Zone[] = [];
  /** Rings drawn on top of the cards (removed with them). */
  private readonly extras: Phaser.GameObjects.GameObject[] = [];
  private readonly panel: Phaser.GameObjects.Graphics;
  private focus = -1;
  private readonly ring: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    choices: readonly Token[],
    private readonly onPick: (i: number) => void,
    positions?: readonly { x: number; y: number }[],
    cardPx: number = L.tray.cardPx,
  ) {
    const { width } = scene.scale;
    const T = L.tray;
    const n = choices.length;
    const spots =
      positions ?? choices.map((_, i) => ({ x: width / 2 + (i - (n - 1) / 2) * (cardPx + T.gapPx), y: T.y }));
    this.panel = scene.add.graphics().setDepth(PUZZLE_DEPTH.tray - 1);
    if (positions === undefined) {
      const w = n * cardPx + (n - 1) * T.gapPx + T.panelPad * 2;
      this.panel
        .fillStyle(0xffffff, 0.45)
        .fillRoundedRect(width / 2 - w / 2, T.y - cardPx / 2 - T.panelPad, w, cardPx + T.panelPad * 2, 26);
    }
    this.ring = scene.add.graphics().setDepth(PUZZLE_DEPTH.tray + 1);
    choices.forEach((tok, i) => {
      const { x, y } = spots[i];
      const card = tokenCard(scene, x, y, cardPx, cardPx, tok).setDepth(PUZZLE_DEPTH.tray).setScale(0);
      scene.tweens.add({
        targets: card,
        scale: 1,
        duration: P.timings.popInMs,
        delay: i * P.timings.popStaggerMs,
        ease: 'Back.Out',
      });
      const zone = scene.add
        .zone(x, y, cardPx, cardPx)
        .setInteractive({ useHandCursor: true })
        .setDepth(PUZZLE_DEPTH.tray);
      zone.on('pointerdown', () => this.onPick(i));
      this.cards.push(card);
      this.zones.push(zone);
    });
    this.cardPx = cardPx;
  }

  private readonly cardPx: number;

  /** Keyboard: move the focus ring. */
  moveFocus(d: number): void {
    const n = this.cards.length;
    this.focus = this.focus < 0 ? 0 : (this.focus + d + n) % n;
    this.drawRing();
  }

  focused(): number {
    return this.focus;
  }

  private drawRing(): void {
    this.ring.clear();
    const c = this.cards[this.focus];
    if (!c) return;
    const s = this.cardPx + 16;
    this.ring.lineStyle(5, SELECTED_AMBER, 1).strokeRoundedRect(c.x - s / 2, c.y - s / 2, s, s, s * 0.16);
  }

  /** A wrong pick: a wiggle, and it greys out (it can't be the answer). */
  wrong(i: number): void {
    const card = this.cards[i];
    this.scene.tweens.add({
      targets: card,
      angle: { from: -6, to: 6 },
      duration: P.timings.wrongWiggleMs,
      yoyo: true,
      repeat: 2,
      onComplete: () => card.setAngle(0),
    });
    card.setAlpha(0.45);
    this.zones[i].disableInteractive();
  }

  /** Red: show which one it was (an amber ring, a pulse). */
  reveal(i: number): void {
    const card = this.cards[i];
    const s = this.cardPx + 14;
    const g = this.scene.add.graphics().setDepth(PUZZLE_DEPTH.tray + 1);
    g.lineStyle(7, SELECTED_AMBER, 1).strokeRoundedRect(card.x - s / 2, card.y - s / 2, s, s, s * 0.16);
    this.scene.tweens.add({ targets: card, scale: 1.12, duration: 240, yoyo: true, repeat: 2 });
    this.extras.push(g);
    for (const z of this.zones) z.disableInteractive();
  }

  /** The right pick: a pop and a green ring. */
  right(i: number): void {
    const card = this.cards[i];
    const s = this.cardPx + 14;
    const g = this.scene.add.graphics().setDepth(PUZZLE_DEPTH.tray + 1);
    g.lineStyle(7, 0x4ade80, 1).strokeRoundedRect(card.x - s / 2, card.y - s / 2, s, s, s * 0.16);
    this.scene.tweens.add({ targets: card, scale: 1.15, duration: 180, yoyo: true, ease: 'Back.Out' });
    sparkle(this.scene, card.x, card.y);
    this.extras.push(g);
  }

  destroy(): void {
    for (const c of this.cards) c.destroy();
    for (const z of this.zones) z.destroy();
    for (const e of this.extras) e.destroy();
    this.panel.destroy();
    this.ring.destroy();
  }
}

// ---------------------------------------------------------------- sand timer

/**
 * A sand bar that runs out: a timed puzzle's clock (Pattern Train, Odd One
 * Out, Symbol Hunt). It turns red near the end; pausing the scene's tweens
 * pauses it.
 */
export class SandTimer {
  private readonly tray: Phaser.GameObjects.Rectangle;
  private readonly sand: Phaser.GameObjects.Rectangle;
  private tween?: Phaser.Tweens.Tween;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number = L.sand.height,
  ) {
    this.tray = scene.add
      .rectangle(x, y, width + 8, height + 8, CALLOUT_INK, 0.35)
      .setStrokeStyle(2, 0xffffff, 0.6)
      .setDepth(PUZZLE_DEPTH.stage);
    this.sand = scene.add
      .rectangle(x - width / 2, y, width, height, 0xffd43b, 1)
      .setOrigin(0, 0.5)
      .setDepth(PUZZLE_DEPTH.stage);
  }

  /** Fill it and let it run for `seconds`; `onDone` when it's empty. */
  start(seconds: number, onDone: () => void): void {
    this.tween?.stop();
    this.sand.setScale(1, 1).setFillStyle(0xffd43b, 1);
    this.tween = this.scene.tweens.add({
      targets: this.sand,
      scaleX: 0,
      duration: seconds * 1000,
      onUpdate: () => {
        if (this.sand.scaleX < 0.25) this.sand.setFillStyle(0xff8787, 1);
      },
      onComplete: onDone,
    });
  }

  /** How much of the time is gone (0–1). */
  used(): number {
    return 1 - this.sand.scaleX;
  }

  stop(): void {
    this.tween?.stop();
    this.tween = undefined;
  }

  destroy(): void {
    this.stop();
    this.tray.destroy();
    this.sand.destroy();
  }
}

// ---------------------------------------------------------------- end panel

export interface EndPanelOpts {
  title: string;
  lines: readonly [string, string];
  stars: number;
  newBest: boolean;
  onPlayAgain: () => void;
  onChange: () => void;
  onMenu: () => void;
  changeLabel: string;
}

/** The end of a round: stars, what happened, Play Again / Change Difficulty / Menu. */
export function showEndPanel(scene: Phaser.Scene, o: EndPanelOpts): void {
  const { width, height } = scene.scale;
  const cx = width / 2;
  const cy = height / 2;
  const D = PUZZLE_DEPTH.panel;
  scene.add.rectangle(0, 0, width, height, 0x000000, 0.45).setOrigin(0).setDepth(D);
  scene.add.rectangle(cx, cy, 700, 470, 0x1f2740, 0.96).setStrokeStyle(4, SELECTED_AMBER).setDepth(D);
  text(scene, cx, cy - 170, o.title, 'success')
    .setOrigin(0.5)
    .setDepth(D);
  const stars = text(scene, cx, cy - 100, '★'.repeat(o.stars) + '☆'.repeat(3 - o.stars), 'stars')
    .setOrigin(0.5)
    .setDepth(D)
    .setFontSize(60)
    .setScale(0.4);
  scene.tweens.add({ targets: stars, scale: 1, duration: 360, ease: 'Back.Out' });
  text(scene, cx, cy - 34, o.lines[0], 'bodyLarge')
    .setOrigin(0.5)
    .setDepth(D);
  const best = text(scene, cx, cy + 8, o.lines[1], o.newBest ? 'accent' : 'bodyAccent')
    .setOrigin(0.5)
    .setDepth(D);
  if (o.newBest) scene.tweens.add({ targets: best, scale: { from: 0.6, to: 1 }, duration: 320, ease: 'Back.Out' });

  const again = new PlaceholderButton({
    scene,
    x: cx,
    y: cy + 88,
    width: 320,
    height: 72,
    label: 'Play Again',
    onClick: o.onPlayAgain,
  }).setDepth(D);
  const change = new PlaceholderButton({
    scene,
    x: cx - 110,
    y: cy + 178,
    width: 260,
    height: 64,
    label: o.changeLabel,
    onClick: o.onChange,
  }).setDepth(D);
  const menu = new PlaceholderButton({
    scene,
    x: cx + 170,
    y: cy + 178,
    width: 180,
    height: 64,
    label: 'Menu',
    onClick: o.onMenu,
  }).setDepth(D);
  new KeyboardNavigator(scene, [again, change, menu]);
}
