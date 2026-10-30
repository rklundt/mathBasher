// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { isPickPuzzleId, type RoundPuzzleId } from '@/core/gameIds';
import { PUZZLE_SHEETS } from '@/core/spriteKeys';
import { pickTileFlipSfx } from '@/core/audioKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { Settings } from '@/services/Settings';
import { generatePickRound, type PickPuzzle } from '@/game/systems/puzzles/pickPuzzles';
import type { Token } from '@/game/systems/puzzles/tokens';
import { PuzzleRoundScene } from '@/game/scenes/PuzzleRoundScene';
import { AnswerTray, PUZZLE_DEPTH, SandTimer, drawToken, questionCard, tokenCard } from '@/game/ui/puzzleFrame';
import { text } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';

const P = config.puzzles;
const INK = 0x3a2420;

/**
 * Sprint 2.14 — the five "pick one" puzzles in one scene (which one comes
 * from `Settings.round.gameId`): Pattern Train, Missing Piece, Odd One Out,
 * Magic Wand and Spin Match. Each puzzle shows its stage (a train, a window,
 * a shelf, a wand, a turntable) and a tray of answers; Odd One Out's
 * answers stand on its shelf. A wrong answer greys out and the puzzle
 * stays; the right one fills the "?" and the next puzzle comes.
 */
export class PickPuzzleScene extends PuzzleRoundScene {
  static readonly key = SceneKeys.PickPuzzle;

  private puzzles: PickPuzzle[] = [];
  /** Everything drawn for the current puzzle (cleared for the next). */
  private stageObjects: Phaser.GameObjects.GameObject[] = [];
  private tray?: AnswerTray;
  /** Where the answer goes once found (the "?" card), if the stage has one. */
  private slot?: { x: number; y: number; w: number; h: number; card: Phaser.GameObjects.Container };
  /** Wrong picks on this puzzle (three and it goes red). */
  private misses = 0;
  private locked = false;
  /** The sand bar, on the timed puzzles (Pattern Train, Odd One Out). */
  private sand?: SandTimer;

  constructor() {
    super(PickPuzzleScene.key);
  }

  protected puzzleId(): RoundPuzzleId | null {
    const id = Settings.round.gameId;
    return isPickPuzzleId(id) ? id : null;
  }

  protected startRound(): void {
    if (!isPickPuzzleId(this.id)) return;
    this.puzzles = generatePickRound(this.id, this.level, P.perRound);
    this.stageObjects = [];
    this.sand =
      this.seconds() === null
        ? undefined
        : new SandTimer(this, this.scale.width / 2, P.layout.sand.y, P.layout.sand.width);
    this.tray = undefined;
    this.slot = undefined;
    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', () => this.tray?.moveFocus(-1));
    kb?.on('keydown-RIGHT', () => this.tray?.moveFocus(1));
    const pickFocused = (): void => {
      const f = this.tray?.focused() ?? -1;
      if (f >= 0) this.pick(f);
      else this.tray?.moveFocus(0);
    };
    kb?.on('keydown-SPACE', pickFocused);
    kb?.on('keydown-ENTER', pickFocused);
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((k, i) => kb?.on(`keydown-${k}`, () => this.pick(i)));
    this.showPuzzle(0);
  }

  private showPuzzle(i: number): void {
    // Stop the looping tweens on the old pieces (the "?" pulse, the wand's
    // wobble, the turntable's wiggle) before they go, so none outlive them.
    const stopTweens = (o: Phaser.GameObjects.GameObject): void => {
      this.tweens.killTweensOf(o);
      if (o instanceof Phaser.GameObjects.Container) o.list.forEach(stopTweens);
    };
    for (const o of this.stageObjects) {
      stopTweens(o);
      o.destroy();
    }
    this.stageObjects = [];
    this.tray?.destroy();
    this.slot = undefined;
    this.misses = 0;
    this.locked = false;
    const p = this.puzzles[i];
    const seconds = this.seconds();
    if (seconds !== null) this.sand?.start(seconds, () => this.miss('Time’s up! It was this one.'));
    this.beginPuzzle(i, p.prompt);
    switch (p.stage.kind) {
      case 'train':
        this.drawTrain(p.stage.cars);
        break;
      case 'window':
        this.drawWindow(p.stage.cells, p.stage.cols);
        break;
      case 'shelf':
        this.drawShelf(p.choices.length);
        break;
      case 'wand':
        this.drawWand(p.stage.from, p.stage.to, p.stage.next);
        break;
      case 'spin':
        this.drawSpin(p.stage.target);
        break;
    }
    this.tray = new AnswerTray(
      this,
      p.choices,
      (c) => this.pick(c),
      this.shelfSpots(p),
      p.stage.kind === 'shelf' ? 150 : undefined,
    );
  }

  /** Odd One Out's answers stand on the shelf instead of the tray. */
  private shelfSpots(p: PickPuzzle): { x: number; y: number }[] | undefined {
    if (p.stage.kind !== 'shelf') return undefined;
    const n = p.choices.length;
    const gap = 180;
    return p.choices.map((_, i) => ({ x: this.scale.width / 2 + (i - (n - 1) / 2) * gap, y: 360 }));
  }

  private pick(c: number): void {
    if (this.blocked || this.locked || !this.tray || c >= this.tray.cards.length || this.tray.isTried(c)) return;
    const p = this.puzzles[this.index];
    getAudioManager().play(pickTileFlipSfx(), 'sfx');
    if (c === p.answer) {
      this.locked = true;
      this.sand?.stop();
      this.tray.right(c);
      this.fillSlot(p.choices[c]);
      this.markRight(this.misses, this.sand?.used() ?? null, p.why, () => this.next());
      return;
    }
    this.misses++;
    this.tray.wrong(c);
    if (this.outOfTries(this.misses)) this.miss('It was this one!');
    else this.markWrong();
  }

  /** Red: three misses, or the time ran out. Show the answer and move on. */
  private miss(note: string): void {
    if (this.locked || !this.tray) return;
    this.locked = true;
    this.sand?.stop();
    const p = this.puzzles[this.index];
    this.tray.reveal(p.answer);
    this.fillSlot(p.choices[p.answer]);
    this.markRed(note, () => this.next());
  }

  /** This puzzle's seconds at this level, or null if it isn't timed. */
  private seconds(): number | null {
    const timed = P.timed as Partial<Record<string, Record<string, number>>>;
    return timed[this.id]?.[this.level] ?? null;
  }

  private next(): void {
    if (this.index + 1 >= this.puzzles.length) {
      this.sand?.destroy();
      this.endRound();
      return;
    }
    this.showPuzzle(this.index + 1);
  }

  /** The "?" becomes the answer. */
  private fillSlot(token: Token): void {
    const s = this.slot;
    if (!s) return;
    const card = tokenCard(this, s.x, s.y, s.w, s.h, token)
      .setDepth(PUZZLE_DEPTH.stage + 1)
      .setScale(0.3);
    this.tweens.add({ targets: card, scale: 1, duration: 260, ease: 'Back.Out' });
    s.card.setVisible(false);
    this.stageObjects.push(card);
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.stageObjects.push(o);
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(PUZZLE_DEPTH.stage);
    return o;
  }

  /** Pop the stage's pieces in. */
  private popIn(targets: Phaser.GameObjects.GameObject[]): void {
    targets.forEach((t, i) => {
      // Grow to each piece's own scale (the train is drawn smaller than its frames).
      const tr = t as unknown as Phaser.GameObjects.Components.Transform;
      const to = tr.scaleX;
      tr.setScale(to * 0.2);
      this.tweens.add({
        targets: t,
        scale: to,
        duration: P.timings.popInMs,
        delay: i * P.timings.popStaggerMs,
        ease: 'Back.Out',
      });
    });
  }

  // ----- stages ------------------------------------------------------------

  /** Pattern Train: the engine and a car per token, then the "?" car, on a track. */
  private drawTrain(cars: readonly Token[]): void {
    const T = PUZZLE_SHEETS.train;
    const scale = 0.66;
    const carW = T.frameWidth * scale;
    const y = 330;
    const n = cars.length + 1;
    const total = (n + 1) * carW;
    const x0 = this.scale.width / 2 - total / 2 + carW / 2;
    const track = this.keep(this.add.graphics());
    track.fillStyle(0xa86a3c, 1).fillRect(0, y + (T.frameHeight * scale) / 2 - 6, this.scale.width, 10);
    for (let x = 0; x < this.scale.width; x += 36)
      track.fillStyle(0xc98b5a, 1).fillRect(x, y + (T.frameHeight * scale) / 2 - 10, 20, 18);
    const pieces: Phaser.GameObjects.GameObject[] = [];
    pieces.push(this.keep(this.add.image(x0, y, T.key, 0).setScale(scale)));
    const winY = y - (T.frameHeight * scale) / 2 + T.windowY * scale;
    const tokenPx = 74 * scale * 1.35;
    cars.forEach((tok, i) => {
      const x = x0 + (i + 1) * carW;
      pieces.push(this.keep(this.add.image(x, y, T.key, 1 + (i % T.cars)).setScale(scale)));
      const t = this.keep(drawToken(this, tok, tokenPx));
      t.setPosition(x, winY);
      pieces.push(t);
    });
    const qx = x0 + n * carW;
    pieces.push(this.keep(this.add.image(qx, y, T.key, 1 + (cars.length % T.cars)).setScale(scale)));
    const q = this.keep(questionCard(this, qx, winY, 92 * scale * 1.3, 62 * scale * 1.3));
    pieces.push(q);
    this.slot = { x: qx, y: winY, w: 92 * scale * 1.3, h: 62 * scale * 1.3, card: q };
    this.popIn(pieces);
  }

  /** Missing Piece: a wooden window of 3 rows of `cols` panes, one with a "?". */
  private drawWindow(cells: readonly (Token | null)[], cols: number): void {
    const cx = this.scale.width / 2;
    const cy = 345;
    const pane = 88;
    const gap = 10;
    const rows = Math.ceil(cells.length / cols);
    const w = pane * cols + gap * (cols - 1) + 36;
    const h = pane * rows + gap * (rows - 1) + 36;
    const frame = this.keep(this.add.graphics());
    frame.fillStyle(0xa86a3c, 1).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 22);
    frame.lineStyle(5, INK, 1).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 22);
    frame.fillStyle(0xfdf2dc, 1).fillRoundedRect(cx - w / 2 + 12, cy - h / 2 + 12, w - 24, h - 24, 14);
    const pieces: Phaser.GameObjects.GameObject[] = [];
    cells.forEach((tok, i) => {
      const x = cx + ((i % cols) - (cols - 1) / 2) * (pane + gap);
      const y = cy + (Math.floor(i / cols) - (rows - 1) / 2) * (pane + gap);
      if (tok === null) {
        const q = this.keep(questionCard(this, x, y, pane, pane));
        this.slot = { x, y, w: pane, h: pane, card: q };
        pieces.push(q);
      } else {
        pieces.push(this.keep(tokenCard(this, x, y, pane, pane, tok)));
      }
    });
    this.popIn(pieces);
  }

  /** Odd One Out: a shelf the answers stand on (the tray draws them). */
  private drawShelf(n: number): void {
    const cx = this.scale.width / 2;
    const w = n * 180 + 60;
    const shelf = this.keep(this.add.graphics());
    shelf.fillStyle(0xc98b5a, 1).fillRoundedRect(cx - w / 2, 440, w, 28, 10);
    shelf.lineStyle(4, INK, 1).strokeRoundedRect(cx - w / 2, 440, w, 28, 10);
    shelf
      .fillStyle(0xa86a3c, 1)
      .fillRect(cx - w / 2 + 40, 468, 24, 60)
      .fillRect(cx + w / 2 - 64, 468, 24, 60);
    shelf
      .lineStyle(4, INK, 1)
      .strokeRect(cx - w / 2 + 40, 468, 24, 60)
      .strokeRect(cx + w / 2 - 64, 468, 24, 60);
  }

  /** Magic Wand: from → to, "so", next → ?, the wand bobbing beside them. */
  private drawWand(from: Token, to: Token, next: Token): void {
    const y = 330;
    const card = 150;
    const xs = [250, 470, 810, 1030];
    const pieces: Phaser.GameObjects.GameObject[] = [];
    pieces.push(this.keep(tokenCard(this, xs[0], y, card, card, from)));
    pieces.push(this.keep(tokenCard(this, xs[1], y, card, card, to)));
    pieces.push(this.keep(tokenCard(this, xs[2], y, card, card, next)));
    const q = this.keep(questionCard(this, xs[3], y, card, card));
    pieces.push(q);
    this.slot = { x: xs[3], y, w: card, h: card, card: q };
    for (const ax of [(xs[0] + xs[1]) / 2, (xs[2] + xs[3]) / 2]) pieces.push(this.keep(this.arrow(ax, y)));
    const so = this.keep(
      text(this, (xs[1] + xs[2]) / 2, y, 'so', 'h3')
        .setOrigin(0.5)
        .setColor('#3a2420'),
    );
    pieces.push(so);
    const wand = this.keep(this.add.image(1176, 360, PUZZLE_SHEETS.wand.key).setScale(0.8).setAngle(-18));
    this.tweens.add({ targets: wand, angle: 8, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.popIn(pieces);
  }

  /** Spin Match: the shape on a turntable, "This one". */
  private drawSpin(target: Token): void {
    const cx = this.scale.width / 2;
    const y = 320;
    const plate = this.keep(this.add.graphics());
    plate.fillStyle(0xc98b5a, 1).fillEllipse(cx, y + 118, 300, 46);
    plate.lineStyle(4, INK, 1).strokeEllipse(cx, y + 118, 300, 46);
    const card = this.keep(tokenCard(this, cx, y, 220, 220, target));
    const label = this.keep(text(this, cx, y + 170, 'This one', 'sectionLabel').setOrigin(0.5));
    applyTextOutline(label);
    // A curved arrow: turning, not flipping.
    const arc = this.keep(this.add.graphics());
    arc.lineStyle(6, 0x7a849c, 1);
    arc.beginPath();
    arc.arc(cx, y, 150, Phaser.Math.DegToRad(-40), Phaser.Math.DegToRad(30), false);
    arc.strokePath();
    const tip = Phaser.Math.DegToRad(30);
    arc
      .fillStyle(0x7a849c, 1)
      .fillTriangle(
        cx + Math.cos(tip) * 150 - 12,
        y + Math.sin(tip) * 150 - 4,
        cx + Math.cos(tip) * 150 + 14,
        y + Math.sin(tip) * 150 - 6,
        cx + Math.cos(tip) * 150 - 2,
        y + Math.sin(tip) * 150 + 16,
      );
    this.tweens.add({
      targets: card,
      angle: { from: -4, to: 4 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    this.popIn([card]);
  }

  /** A fat right arrow with a sparkle (the wand's change). */
  private arrow(x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(0xb197fc, 1);
    g.lineStyle(4, INK, 1);
    const pts = [
      [-36, -10],
      [10, -10],
      [10, -26],
      [40, 0],
      [10, 26],
      [10, 10],
      [-36, 10],
    ].map(([px, py]) => new Phaser.Math.Vector2(x + px, y + py));
    g.fillPoints(pts, true).strokePoints(pts, true, true);
    return g;
  }
}
