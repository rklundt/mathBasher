// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import type { RoundPuzzleId } from '@/core/gameIds';
import { PAIR_PALS_PICTURE_KEYS } from '@/core/spriteKeys';
import { COPY_CAT_VOICES } from '@/core/audioKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { Settings } from '@/services/Settings';
import { copyCatLengths, copyCatSequence } from '@/game/systems/puzzles/memoryAndSpeed';
import { PuzzleRoundScene } from '@/game/scenes/PuzzleRoundScene';
import { PUZZLE_DEPTH, sparkle } from '@/game/ui/puzzleFrame';
import { text } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';

const C = config.puzzles.copyCat;
const PAD_COLOURS = [0x8ce99a, 0xffd43b, 0xfaa2c1, 0x74c0fc, 0xb197fc, 0xffa94d];
const INK = 0x3a2420;

interface Pad {
  readonly root: Phaser.GameObjects.Container;
  readonly disc: Phaser.GameObjects.Arc;
  readonly glow: Phaser.GameObjects.Arc;
}

/**
 * Sprint 2.14 — Copy Cat (working memory): the animals light up and make
 * their sound in order; copy the order back. Eight sequences a round, the
 * first as long as the level says (2 / 3 / 4), one longer each time. A
 * mistake shows the order again; that sequence is no longer "first time".
 */
export class CopyCatScene extends PuzzleRoundScene {
  static readonly key = SceneKeys.CopyCat;

  private pads: Pad[] = [];
  private lengths: number[] = [];
  private sequence: number[] = [];
  private step = 0;
  private firstTry = true;
  private listening = false;

  constructor() {
    super(CopyCatScene.key);
  }

  protected puzzleId(): RoundPuzzleId | null {
    return Settings.round.gameId === 'copy-cat' ? 'copy-cat' : null;
  }

  protected startRound(): void {
    this.pads = [];
    this.lengths = copyCatLengths(this.level);
    this.buildPads(C.pads[this.level]);
    const kb = this.input.keyboard;
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'].forEach((k, i) => kb?.on(`keydown-${k}`, () => this.tap(i)));
    this.startSequence(0);
  }

  /** The pads: 4 in a square, 5 as 3 + 2, 6 as two rows of 3; each an animal on a coloured disc. */
  private buildPads(n: number): void {
    const cx = this.scale.width / 2;
    const rows = n === 4 ? [2, 2] : n === 5 ? [3, 2] : [3, 3];
    const r = n === 4 ? 92 : 80;
    const gapX = r * 2 + 50;
    const ys = [270, 450];
    let i = 0;
    rows.forEach((count, row) => {
      for (let k = 0; k < count; k++) {
        const x = cx + (k - (count - 1) / 2) * gapX;
        const y = ys[row];
        const root = this.add.container(x, y).setDepth(PUZZLE_DEPTH.stage);
        const glow = this.add.circle(0, 0, r + 18, 0xffffff, 0.85).setVisible(false);
        const disc = this.add.circle(0, 0, r, PAD_COLOURS[i], 0.55).setStrokeStyle(5, INK);
        const animal = this.add
          .image(0, -4, PAIR_PALS_PICTURE_KEYS.animals, C.animals[i])
          .setDisplaySize(r * 1.55, r * 1.55);
        const n1 = text(this, 0, r - 8, String(i + 1), 'rowLabel').setOrigin(0.5);
        applyTextOutline(n1);
        root.add([glow, disc, animal, n1]);
        const idx = i;
        disc.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.tap(idx));
        root.setScale(0);
        this.tweens.add({ targets: root, scale: 1, duration: 260, delay: i * 70, ease: 'Back.Out' });
        this.pads.push({ root, disc, glow });
        i++;
      }
    });
  }

  private startSequence(i: number): void {
    this.firstTry = true;
    this.beginPuzzle(i, 'Watch, then copy!');
    this.bar.setLeft(`Sounds: ${String(this.lengths[i])}`);
    this.sequence = copyCatSequence(this.lengths[i], this.pads.length);
    this.time.delayedCall(i === 0 ? 900 : C.betweenMs, () => this.playSequence());
  }

  /** Light each pad in order, then it's the child's turn. */
  private playSequence(): void {
    this.listening = false;
    this.step = 0;
    this.prompt.setText('Watch…');
    this.sequence.forEach((pad, k) => {
      this.time.delayedCall(k * (C.litMs + C.gapMs), () => this.light(pad));
    });
    this.time.delayedCall(this.sequence.length * (C.litMs + C.gapMs), () => {
      this.listening = true;
      this.prompt.setText('Your turn!');
    });
  }

  private light(i: number): void {
    const pad = this.pads[i];
    getAudioManager().play(COPY_CAT_VOICES[i], 'sfx');
    pad.glow.setVisible(true);
    pad.disc.setFillStyle(PAD_COLOURS[i], 1);
    this.tweens.killTweensOf(pad.root);
    pad.root.setScale(1); // never wobble from a pop-in still under way
    this.tweens.add({ targets: pad.root, scale: 1.12, duration: 120, yoyo: true, ease: 'Quad.Out' });
    this.time.delayedCall(C.litMs, () => {
      pad.glow.setVisible(false);
      pad.disc.setFillStyle(PAD_COLOURS[i], 0.55);
    });
  }

  private tap(i: number): void {
    if (this.blocked || !this.listening || i >= this.pads.length) return;
    this.light(i);
    if (i !== this.sequence[this.step]) {
      this.listening = false;
      this.firstTry = false;
      this.markWrong('Oops! Watch again');
      this.time.delayedCall(1300, () => this.playSequence());
      return;
    }
    this.step++;
    if (this.step < this.sequence.length) return;
    this.listening = false;
    const pad = this.pads[i];
    sparkle(this, pad.root.x, pad.root.y);
    this.markRight(this.firstTry, `You remembered ${String(this.sequence.length)}!`, () => {
      if (this.index + 1 >= config.puzzles.perRound) this.endRound();
      else this.startSequence(this.index + 1);
    });
  }
}
