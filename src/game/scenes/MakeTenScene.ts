// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import type { RoundPuzzleId } from '@/core/gameIds';
import { THEME_COUNTERS_SHEET } from '@/core/spriteKeys';
import { pickTileFlipSfx } from '@/core/audioKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { Settings } from '@/services/Settings';
import { makeTenBoard, makeTenSolutions, type MakeTenBoard } from '@/game/systems/puzzles/numberPuzzles';
import { textToken } from '@/game/systems/puzzles/tokens';
import { ThemedRoundScene } from '@/game/scenes/ThemedRoundScene';
import { PUZZLE_DEPTH, SandTimer, sparkle, tokenCard } from '@/game/ui/puzzleFrame';
import { text } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';
import { SELECTED_AMBER } from '@/game/ui/uiPalette';

const P = config.puzzles;

/**
 * Sprint 2.16 — Make Ten: tap the cards that add up to the target (Easy two
 * that make 10, Medium three that make 10, Hard three that make 20). Any
 * set that adds up counts. The sum so far shows under the target; a full
 * pick that's wrong shakes and clears (a miss), three misses or the sand
 * and it goes red with one way shown. Eight boards a round.
 */
export class MakeTenScene extends ThemedRoundScene {
  static readonly key = SceneKeys.MakeTen;

  private board!: MakeTenBoard;
  private cards: Phaser.GameObjects.Container[] = [];
  private objects: Phaser.GameObjects.GameObject[] = [];
  private chosen: number[] = [];
  private rings: Phaser.GameObjects.Graphics[] = [];
  private sumText?: Phaser.GameObjects.Text;
  private misses = 0;
  private live = false;
  private sand?: SandTimer;
  private focus = -1;
  private focusRing?: Phaser.GameObjects.Graphics;
  private cols = 4;
  private cardPx = 120;

  constructor() {
    super(MakeTenScene.key);
  }

  protected puzzleId(): RoundPuzzleId | null {
    return Settings.round.gameId === 'make-ten' ? 'make-ten' : null;
  }

  protected startRound(): void {
    this.objects = [];
    this.focus = -1;
    this.sand = new SandTimer(this, this.scale.width / 2, P.layout.sand.y, P.layout.sand.width);
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
    for (const o of this.objects) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.objects = [];
    this.cards = [];
    this.rings = [];
    this.chosen = [];
    this.misses = 0;
    this.board = makeTenBoard(this.level);
    const b = this.board;
    this.beginPuzzle(i, `Tap ${b.pick === 2 ? 'two' : 'three'} that make ${String(b.target)}!`);

    // The target: a badge with the look's counter, and the sum so far under it.
    const badge = this.add.graphics().setDepth(PUZZLE_DEPTH.stage);
    badge.fillStyle(this.colours.mat, 0.95).fillRoundedRect(140, 220, 220, 250, 30);
    badge.lineStyle(5, this.colours.matEdge, 1).strokeRoundedRect(140, 220, 220, 250, 30);
    const icon = this.add
      .image(250, 268, THEME_COUNTERS_SHEET.key, this.art.counters[i % this.art.counters.length])
      .setDisplaySize(64, 64)
      .setDepth(PUZZLE_DEPTH.stage);
    const target = text(this, 250, 350, String(b.target), 'title')
      .setOrigin(0.5)
      .setFontSize(120)
      .setDepth(PUZZLE_DEPTH.stage);
    target.setColor(this.theme === 'cosmos' ? '#f8f9fa' : '#3a2420');
    this.sumText = text(this, 250, 430, '', 'accent').setOrigin(0.5).setDepth(PUZZLE_DEPTH.stage);
    applyTextOutline(this.sumText);
    this.objects.push(badge, icon, target, this.sumText);
    this.tweens.add({ targets: target, scale: { from: 0.4, to: 1 }, duration: 260, ease: 'Back.Out' });

    // The cards, in a grid to the right.
    const n = b.cards.length;
    this.cols = n <= 6 ? 3 : n <= 8 ? 4 : 3;
    const rows = Math.ceil(n / this.cols);
    this.cardPx = rows > 2 ? 108 : 124;
    const gap = 18;
    const cx = 790;
    const cy = 360;
    const x0 = cx - ((this.cols - 1) * (this.cardPx + gap)) / 2;
    const y0 = cy - ((rows - 1) * (this.cardPx + gap)) / 2;
    b.cards.forEach((v, k) => {
      const x = x0 + (k % this.cols) * (this.cardPx + gap);
      const y = y0 + Math.floor(k / this.cols) * (this.cardPx + gap);
      const card = tokenCard(this, x, y, this.cardPx, this.cardPx, textToken(String(v)))
        .setDepth(PUZZLE_DEPTH.stage)
        .setScale(0);
      this.tweens.add({ targets: card, scale: 1, duration: 200, delay: k * 30, ease: 'Back.Out' });
      const zone = this.add
        .zone(x, y, this.cardPx, this.cardPx)
        .setInteractive({ useHandCursor: true })
        .setDepth(PUZZLE_DEPTH.stage);
      zone.on('pointerdown', () => this.tap(k));
      const ring = this.add.graphics().setDepth(PUZZLE_DEPTH.stage + 1);
      this.cards.push(card);
      this.rings.push(ring);
      this.objects.push(card, zone, ring);
    });
    this.focusRing = this.add.graphics().setDepth(PUZZLE_DEPTH.stage + 2);
    this.objects.push(this.focusRing);
    if (this.focus >= n) this.focus = n - 1;
    this.drawFocus();
    this.updateSum();
    this.live = true;
    this.sand?.start(P.timed['make-ten'][this.level], () => this.miss('Time’s up! Here’s one way.'));
    this.restartClock();
  }

  private moveFocus(dx: number, dy: number): void {
    if (this.blocked || this.cards.length === 0) return;
    const n = this.cards.length;
    if (this.focus < 0) this.focus = 0;
    else {
      const col = Phaser.Math.Clamp((this.focus % this.cols) + dx, 0, this.cols - 1);
      const row = Phaser.Math.Clamp(Math.floor(this.focus / this.cols) + dy, 0, Math.ceil(n / this.cols) - 1);
      this.focus = Math.min(n - 1, row * this.cols + col);
    }
    this.drawFocus();
  }

  private drawFocus(): void {
    const g = this.focusRing;
    if (!g) return;
    g.clear();
    const card = this.cards[this.focus] as Phaser.GameObjects.Container | undefined;
    if (!card) return;
    const s = this.cardPx + 22;
    g.lineStyle(4, 0xffffff, 1).strokeRoundedRect(card.x - s / 2, card.y - s / 2, s, s, s * 0.16);
  }

  private updateSum(): void {
    const vals = this.chosen.map((k) => this.board.cards[k]);
    const sum = vals.reduce((a, c) => a + c, 0);
    this.sumText?.setText(vals.length === 0 ? '' : `${vals.join(' + ')} = ${String(sum)}`);
  }

  private drawRing(k: number, colour: number | null): void {
    const g = this.rings[k];
    g.clear();
    if (colour === null) return;
    const card = this.cards[k];
    const s = this.cardPx + 12;
    g.lineStyle(7, colour, 1).strokeRoundedRect(card.x - s / 2, card.y - s / 2, s, s, s * 0.16);
  }

  private tap(k: number): void {
    if (this.blocked || !this.live) return;
    getAudioManager().play(pickTileFlipSfx(), 'sfx');
    if (this.chosen.includes(k)) {
      this.chosen = this.chosen.filter((c) => c !== k);
      this.drawRing(k, null);
      this.updateSum();
      return;
    }
    this.chosen.push(k);
    this.drawRing(k, SELECTED_AMBER);
    this.updateSum();
    if (this.chosen.length < this.board.pick) return;
    const sum = this.chosen.reduce((a, c) => a + this.board.cards[c], 0);
    if (sum === this.board.target) {
      this.live = false;
      this.sand?.stop();
      for (const c of this.chosen) {
        this.drawRing(c, 0x4ade80);
        sparkle(this, this.cards[c].x, this.cards[c].y, 8);
      }
      const vals = this.chosen.map((c) => this.board.cards[c]);
      this.markRight(
        this.misses,
        this.sand?.used() ?? null,
        `${vals.join(' + ')} = ${String(this.board.target)}!`,
        () => this.next(),
      );
      return;
    }
    // Wrong: a shake, then the picks clear.
    this.misses++;
    const picked = [...this.chosen];
    this.chosen = [];
    for (const c of picked) {
      const card = this.cards[c];
      this.tweens.add({
        targets: card,
        angle: { from: -6, to: 6 },
        duration: 70,
        yoyo: true,
        repeat: 2,
        onComplete: () => {
          card.setAngle(0);
          this.drawRing(c, null);
        },
      });
    }
    this.time.delayedCall(450, () => this.updateSum());
    if (this.outOfTries(this.misses)) this.miss('Here’s one way!');
    else this.markWrong(`That makes ${String(sum)}. Try again!`);
  }

  /** Red: show one way that works, then the next board. */
  private miss(note: string): void {
    if (!this.live) return;
    this.live = false;
    this.sand?.stop();
    const way = makeTenSolutions(this.board.cards, this.board.pick, this.board.target)[0] ?? [];
    this.time.delayedCall(300, () => {
      for (const c of way) {
        this.drawRing(c, 0xffd43b);
        this.tweens.add({ targets: this.cards[c], scale: 1.1, duration: 240, yoyo: true, repeat: 2 });
      }
      this.chosen = way;
      this.updateSum();
    });
    this.markRed(note, () => this.next());
  }

  private next(): void {
    if (this.index + 1 >= P.perRound) {
      this.sand?.destroy();
      this.endRound();
      return;
    }
    this.showBoard(this.index + 1);
  }
}
