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
import { PUZZLE_DEPTH, sparkle, tokenCard } from '@/game/ui/puzzleFrame';
import { text } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';

const H = config.puzzles.symbolHunt;

/**
 * Sprint 2.14 — Symbol Hunt (processing speed): find every card like the
 * sign (same shape and colour) before the sand runs out. Eight boards a
 * round; Medium and Hard mix in look-alikes. A wrong tap wiggles; the sand
 * running out shows the ones left (that board isn't "first time").
 */
export class SymbolHuntScene extends PuzzleRoundScene {
  static readonly key = SceneKeys.SymbolHunt;

  private board!: HuntBoard;
  private cards: Phaser.GameObjects.Container[] = [];
  private objects: Phaser.GameObjects.GameObject[] = [];
  private found = new Set<number>();
  private firstTry = true;
  private live = false;
  private sand?: Phaser.GameObjects.Rectangle;
  private sandTween?: Phaser.Tweens.Tween;

  constructor() {
    super(SymbolHuntScene.key);
  }

  protected puzzleId(): RoundPuzzleId | null {
    return Settings.round.gameId === 'symbol-hunt' ? 'symbol-hunt' : null;
  }

  protected startRound(): void {
    this.objects = [];
    this.showBoard(0);
  }

  private showBoard(i: number): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.cards = [];
    this.found = new Set();
    this.firstTry = true;
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

    // The sand: a bar that runs out.
    const sandY = 560;
    const w = right - left;
    const tray = this.add.rectangle((left + right) / 2, sandY, w + 8, 22, 0x0b1020, 0.35).setDepth(PUZZLE_DEPTH.stage);
    this.sand = this.add.rectangle(left, sandY, w, 14, 0xffd43b, 1).setOrigin(0, 0.5).setDepth(PUZZLE_DEPTH.stage);
    this.objects.push(tray, this.sand);
    this.live = true;
    this.sandTween?.stop();
    this.sandTween = this.tweens.add({
      targets: this.sand,
      scaleX: 0,
      duration: H.seconds[this.level] * 1000,
      onUpdate: () => {
        if (this.sand && this.sand.scaleX < 0.25) this.sand.setFillStyle(0xff8787);
      },
      onComplete: () => this.timeUp(),
    });
  }

  private updateCount(): void {
    this.bar.setLeft(`Found ${String(this.found.size)} / ${String(this.board.matches.length)}`);
  }

  private tap(k: number): void {
    if (this.blocked || !this.live || this.found.has(k)) return;
    const card = this.cards[k];
    if (!this.board.matches.includes(k)) {
      this.firstTry = false;
      this.tweens.add({
        targets: card,
        angle: { from: -6, to: 6 },
        duration: 70,
        yoyo: true,
        repeat: 2,
        onComplete: () => card.setAngle(0),
      });
      this.markWrong('Not that one!');
      return;
    }
    getAudioManager().play(pickTileFlipSfx(), 'sfx');
    this.found.add(k);
    this.ring(card, 0x4ade80);
    sparkle(this, card.x, card.y, 8);
    this.updateCount();
    if (this.found.size < this.board.matches.length) return;
    this.live = false;
    this.sandTween?.stop();
    this.markRight(this.firstTry, `You found all ${String(this.board.matches.length)}!`, () => this.next());
  }

  /** The sand ran out: show the ones still hiding, then the next board. */
  private timeUp(): void {
    if (!this.live) return;
    this.live = false;
    this.firstTry = false;
    for (const k of this.board.matches) {
      if (!this.found.has(k)) {
        const card = this.cards[k];
        this.ring(card, 0xffd43b);
        this.tweens.add({ targets: card, scale: 1.12, duration: 240, yoyo: true, repeat: 2 });
      }
    }
    this.bar.mark(this.index, 'silver');
    this.prompt.flash('Here they were!', 'retry', 1800);
    this.time.delayedCall(1800, () => this.next());
  }

  private ring(card: Phaser.GameObjects.Container, colour: number): void {
    const s = card.getBounds().width + 10;
    const g = this.add.graphics().setDepth(PUZZLE_DEPTH.stage + 1);
    g.lineStyle(6, colour, 1).strokeRoundedRect(card.x - s / 2, card.y - s / 2, s, s, s * 0.16);
    this.objects.push(g);
  }

  private next(): void {
    if (this.index + 1 >= config.puzzles.perRound) {
      this.sandTween?.stop();
      this.endRound();
      return;
    }
    this.showBoard(this.index + 1);
  }
}
