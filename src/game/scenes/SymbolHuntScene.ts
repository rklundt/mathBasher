// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import type { RoundPuzzleId } from '@/core/gameIds';
import { pickTileFlipSfx } from '@/core/audioKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { Settings } from '@/services/Settings';
import { huntBoard, type HuntBoard } from '@/game/systems/puzzles/memoryAndSpeed';
import { PuzzleRoundScene } from '@/game/scenes/PuzzleRoundScene';
import { PUZZLE_DEPTH, SandTimer, sparkle, tokenCard } from '@/game/ui/puzzleFrame';
import { text } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';
import { SELECTED_AMBER } from '@/game/ui/uiPalette';

const H = config.puzzles.symbolHunt;

/**
 * Sprint 2.14 — Symbol Hunt (processing speed): find every card like the
 * sign (same shape and colour) before the sand runs out. Eight boards a
 * round; Medium and Hard mix in look-alikes. Green: all found with no wrong
 * tap in the first half of the time; yellow: found later or after a wrong
 * tap; red: the sand runs out or three wrong taps (the ones left are shown).
 * Keyboard (sprint 2.15.1): the arrow keys move a ring around the grid,
 * Space or Enter taps the card under it.
 */
export class SymbolHuntScene extends PuzzleRoundScene {
  static readonly key = SceneKeys.SymbolHunt;

  private board!: HuntBoard;
  private cards: Phaser.GameObjects.Container[] = [];
  private objects: Phaser.GameObjects.GameObject[] = [];
  private found = new Set<number>();
  /** Cards already tapped wrong on this board: greyed, and a second tap costs nothing. */
  private tried = new Set<number>();
  /** Wrong taps on this board (three and it goes red). */
  private misses = 0;
  private live = false;
  private sand?: SandTimer;
  /** The card under the keyboard ring (−1 until an arrow key is pressed); kept from board to board. */
  private focus = -1;
  private focusRing?: Phaser.GameObjects.Graphics;
  private cardPx = 0;

  constructor() {
    super(SymbolHuntScene.key);
  }

  protected puzzleId(): RoundPuzzleId | null {
    return Settings.round.gameId === 'symbol-hunt' ? 'symbol-hunt' : null;
  }

  protected startRound(): void {
    this.objects = [];
    this.focus = -1;
    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', () => this.moveFocus(-1, 0));
    kb?.on('keydown-RIGHT', () => this.moveFocus(1, 0));
    kb?.on('keydown-UP', () => this.moveFocus(0, -1));
    kb?.on('keydown-DOWN', () => this.moveFocus(0, 1));
    const tapFocused = (): void => {
      if (this.focus >= 0) this.tap(this.focus);
      else this.moveFocus(0, 0);
    };
    kb?.on('keydown-SPACE', tapFocused);
    kb?.on('keydown-ENTER', tapFocused);
    this.showBoard(0);
  }

  private showBoard(i: number): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.cards = [];
    this.found = new Set();
    this.tried = new Set();
    this.misses = 0;
    this.board = huntBoard(this.level);
    this.beginPuzzle(i, 'Find all of these!');
    this.updateCount();

    // The sign, on the left.
    const sign = tokenCard(this, 150, 330, 190, 190, this.board.target).setDepth(PUZZLE_DEPTH.stage);
    const label = text(this, 150, 452, 'This one!', 'rowLabel').setOrigin(0.5).setDepth(PUZZLE_DEPTH.stage);
    applyTextOutline(label);
    this.objects.push(sign, label);
    this.tweens.add({ targets: sign, scale: { from: 0.4, to: 1 }, duration: 260, ease: 'Back.Out' });

    // The cards, in a grid to the right.
    const cols = H.cols[this.level];
    const rows = Math.ceil(this.board.cards.length / cols);
    const left = 300;
    const right = 1200;
    const top = 190;
    const bottom = 520;
    const gap = 12;
    const px = Math.floor(
      Math.min((right - left - (cols - 1) * gap) / cols, (bottom - top - (rows - 1) * gap) / rows, 120),
    );
    const x0 = (left + right) / 2 - ((cols - 1) * (px + gap)) / 2;
    const y0 = (top + bottom) / 2 - ((rows - 1) * (px + gap)) / 2;
    this.board.cards.forEach((tok, k) => {
      const x = x0 + (k % cols) * (px + gap);
      const y = y0 + Math.floor(k / cols) * (px + gap);
      const card = tokenCard(this, x, y, px, px, tok).setDepth(PUZZLE_DEPTH.stage).setScale(0);
      this.tweens.add({ targets: card, scale: 1, duration: 200, delay: k * 25, ease: 'Back.Out' });
      const zone = this.add.zone(x, y, px, px).setInteractive({ useHandCursor: true }).setDepth(PUZZLE_DEPTH.stage);
      zone.on('pointerdown', () => this.tap(k));
      this.cards.push(card);
      this.objects.push(card, zone);
    });
    this.cardPx = px;
    this.focusRing = this.add.graphics().setDepth(PUZZLE_DEPTH.stage + 2);
    this.objects.push(this.focusRing);
    this.drawFocus();

    // The sand: a bar that runs out under the grid.
    this.sand?.destroy();
    this.sand = new SandTimer(this, (left + right) / 2, 560, right - left);
    this.live = true;
    this.sand.start(H.seconds[this.level], () => this.miss('Time’s up! Here they were.'));
  }

  /** Keyboard: move the ring around the grid (it stops at the edges). */
  private moveFocus(dx: number, dy: number): void {
    if (this.blocked || this.cards.length === 0) return;
    const cols = H.cols[this.level];
    const n = this.cards.length;
    if (this.focus < 0) {
      this.focus = 0;
    } else {
      const col = Phaser.Math.Clamp((this.focus % cols) + dx, 0, cols - 1);
      const row = Phaser.Math.Clamp(Math.floor(this.focus / cols) + dy, 0, Math.ceil(n / cols) - 1);
      this.focus = Math.min(n - 1, row * cols + col);
    }
    this.drawFocus();
  }

  private drawFocus(): void {
    const g = this.focusRing;
    if (!g) return;
    g.clear();
    const card = this.cards[this.focus] as Phaser.GameObjects.Container | undefined;
    if (!card) return;
    const s = this.cardPx + 18;
    g.lineStyle(5, SELECTED_AMBER, 1).strokeRoundedRect(card.x - s / 2, card.y - s / 2, s, s, s * 0.16);
  }

  private updateCount(): void {
    this.refreshTopLeft();
  }

  /** "Found 1 / 3 · Points: 150". */
  protected topLeftLabel(): string {
    const board = this.board as HuntBoard | undefined;
    const found = board === undefined ? '' : `Found ${String(this.found.size)} / ${String(board.matches.length)}  ·  `;
    return found + super.topLeftLabel();
  }

  private tap(k: number): void {
    if (this.blocked || !this.live || this.found.has(k) || this.tried.has(k)) return;
    const card = this.cards[k];
    if (!this.board.matches.includes(k)) {
      this.misses++;
      this.tried.add(k);
      card.setAlpha(0.45);
      this.tweens.add({
        targets: card,
        angle: { from: -6, to: 6 },
        duration: 70,
        yoyo: true,
        repeat: 2,
        onComplete: () => card.setAngle(0),
      });
      if (this.outOfTries(this.misses)) this.miss('Here they were!');
      else this.markWrong('Not that one!');
      return;
    }
    getAudioManager().play(pickTileFlipSfx(), 'sfx');
    this.found.add(k);
    this.ring(card, 0x4ade80);
    sparkle(this, card.x, card.y, 8);
    this.updateCount();
    if (this.found.size < this.board.matches.length) return;
    this.live = false;
    this.sand?.stop();
    this.markRight(this.misses, this.sand?.used() ?? null, `You found all ${String(this.board.matches.length)}!`, () =>
      this.next(),
    );
  }

  /** Red: the sand ran out or three wrong taps. Show the ones still hiding, then the next board. */
  private miss(note: string): void {
    if (!this.live) return;
    this.live = false;
    this.sand?.stop();
    for (const k of this.board.matches) {
      if (!this.found.has(k)) {
        const card = this.cards[k];
        this.ring(card, 0xffd43b);
        this.tweens.add({ targets: card, scale: 1.12, duration: 240, yoyo: true, repeat: 2 });
      }
    }
    this.markRed(note, () => this.next());
  }

  private ring(card: Phaser.GameObjects.Container, colour: number): void {
    const s = card.getBounds().width + 10;
    const g = this.add.graphics().setDepth(PUZZLE_DEPTH.stage + 1);
    g.lineStyle(6, colour, 1).strokeRoundedRect(card.x - s / 2, card.y - s / 2, s, s, s * 0.16);
    this.objects.push(g);
  }

  private next(): void {
    if (this.index + 1 >= config.puzzles.perRound) {
      this.sand?.destroy();
      this.endRound();
      return;
    }
    this.showBoard(this.index + 1);
  }
}
