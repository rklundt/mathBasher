// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { PENGUIN_SHEET, type PenguinSpriteKey } from '@/core/spriteKeys';

type Pose = keyof typeof PENGUIN_SHEET.poses;

/**
 * Penguin Slide's penguin (sprint 2.7): one sprite on a sheet of poses
 * (slide, lean left / right, gulp, bonk, cheer — `scripts/sprites/penguin.mjs`)
 * plus a soft ring on the snow under it that marks its lane. All movement
 * is tweens, so pausing the scene's tweens freezes it mid-swoop.
 */
export class Penguin {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly ring: Phaser.GameObjects.Ellipse;
  private readonly cfg = config.penguinSlide;
  private readonly baseScale: number;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    private readonly homeY: number,
    key: PenguinSpriteKey,
  ) {
    const { displayPx } = this.cfg.penguin;
    this.baseScale = displayPx / PENGUIN_SHEET.frame;
    const { rx, ry, alpha } = this.cfg.laneRing;
    this.ring = scene.add
      .ellipse(x, homeY + displayPx * 0.42, rx * 2, ry * 2, 0xffffff, alpha)
      .setStrokeStyle(3, 0x9fc3e3, 0.9)
      .setDepth(3);
    this.sprite = scene.add.sprite(x, homeY, key, PENGUIN_SHEET.poses.slide).setScale(this.baseScale).setDepth(8);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  setPose(pose: Pose): void {
    this.sprite.setFrame(PENGUIN_SHEET.poses[pose]);
  }

  /** Glide sideways to another lane (keyboard), leaning the way it goes. */
  glideTo(x: number, ms: number): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.setPose(x < this.sprite.x ? 'leanLeft' : x > this.sprite.x ? 'leanRight' : 'slide');
    this.scene.tweens.add({
      targets: this.sprite,
      x,
      duration: ms,
      ease: 'Sine.Out',
      onUpdate: () => this.ring.setX(this.sprite.x),
      onComplete: () => this.setPose('slide'),
    });
  }

  /** Swoop across to the lane, then up to the fish; `onArrive` plays the outcome. */
  swoop(x: number, fishY: number, onArrive: () => void): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.setPose(x < this.sprite.x ? 'leanLeft' : x > this.sprite.x ? 'leanRight' : 'slide');
    // Two plain tweens (across, then up to the fish), the second started by the first.
    this.scene.tweens.add({
      targets: this.sprite,
      x,
      duration: this.cfg.swoopMs,
      ease: 'Sine.InOut',
      onUpdate: () => this.ring.setX(this.sprite.x),
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.sprite,
          y: fishY + 40,
          duration: this.cfg.reachMs,
          ease: 'Quad.Out',
          onComplete: onArrive,
        });
      },
    });
  }

  /** Back down to the catch line in its lane, upright. */
  returnHome(onDone?: () => void): void {
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.homeY,
      angle: 0,
      duration: this.cfg.returnMs,
      ease: 'Sine.InOut',
      onComplete: () => {
        this.setPose('slide');
        onDone?.();
      },
    });
  }

  /** Right fish: a happy gulp with a little bounce. */
  gulp(): void {
    this.setPose('gulp');
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScale * 1.12,
      scaleY: this.baseScale * 0.92,
      duration: 120,
      yoyo: true,
      ease: 'Quad.Out',
    });
  }

  /** Snowball: BONK — dizzy, a short spin, no shaking. */
  bonk(): void {
    this.setPose('bonk');
    this.scene.tweens.add({ targets: this.sprite, angle: 360, duration: this.cfg.bonkSpinMs, ease: 'Cubic.Out' });
  }

  /** The row reached it (time's up): a tumble — a bigger, wobblier spin. */
  tumble(): void {
    this.setPose('bonk');
    this.scene.tweens.add({
      targets: this.sprite,
      angle: -540,
      duration: this.cfg.bonkSpinMs * 1.4,
      ease: 'Cubic.Out',
    });
  }

  /** The finish: slide away down the hill toward the igloo, then cheer. */
  slideHome(toY: number, onDone: () => void): void {
    this.ring.setVisible(false);
    this.setPose('slide');
    this.scene.tweens.add({
      targets: this.sprite,
      y: toY,
      x: this.scene.scale.width / 2,
      scale: this.baseScale * 0.35,
      duration: this.cfg.iglooSlideMs,
      ease: 'Sine.In',
      onComplete: () => {
        this.setPose('cheer');
        onDone();
      },
    });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
    this.ring.destroy();
  }
}
