// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { BUNNY_SHEET, type BunnySpriteKey } from '@/core/spriteKeys';

type Pose = keyof typeof BUNNY_SHEET.poses;

/**
 * Bunny Garden's bunny (sprint 2.8): one sprite on a sheet of poses (idle,
 * hop, pull, happy, oops, cheer — `scripts/sprites/bunny.mjs`) plus a soft
 * ring on the grass under it that marks its lane. It hops along the front
 * of the patch; every move is a tween, so pausing the scene's tweens
 * freezes it mid-hop.
 */
export class Bunny {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly ring: Phaser.GameObjects.Ellipse;
  private readonly cfg = config.bunnyGarden;
  private readonly baseScale: number;
  /** The hop in flight (it runs on a proxy, so killTweensOf(sprite) can't stop it). */
  private hopTween?: Phaser.Tweens.Tween;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    private readonly homeY: number,
    key: BunnySpriteKey,
  ) {
    const { displayPx } = this.cfg.bunny;
    this.baseScale = displayPx / BUNNY_SHEET.frame;
    const { rx, ry, alpha, belowFrac, strokePx, stroke, strokeAlpha } = this.cfg.laneRing;
    this.ring = scene.add
      .ellipse(x, homeY + displayPx * belowFrac, rx * 2, ry * 2, 0xffffff, alpha)
      .setStrokeStyle(strokePx, stroke, strokeAlpha)
      .setDepth(8);
    this.sprite = scene.add.sprite(x, homeY, key, BUNNY_SHEET.poses.idle).setScale(this.baseScale).setDepth(12);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  setPose(pose: Pose): void {
    this.sprite.setFrame(BUNNY_SHEET.poses[pose]);
  }

  /** One hop arc to `x` (the same time whatever the distance); `onLand` runs on landing. */
  hopTo(x: number, onLand?: () => void, ms: number = this.cfg.hop.ms): void {
    // A new hop replaces one still in the air (it starts from where the bunny is now).
    this.hopTween?.stop();
    this.hopTween = undefined;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0).setY(this.homeY);
    if (Math.abs(x - this.sprite.x) < 1) {
      onLand?.();
      return;
    }
    this.setPose('hop');
    this.sprite.setFlipX(x < this.sprite.x);
    const fromX = this.sprite.x;
    const arc = { t: 0 };
    this.hopTween = this.scene.tweens.add({
      targets: arc,
      t: 1,
      duration: ms,
      ease: 'Sine.InOut',
      onUpdate: () => {
        this.sprite.setX(fromX + (x - fromX) * arc.t);
        this.sprite.setY(this.homeY - Math.sin(Math.PI * arc.t) * this.cfg.hop.heightPx);
        this.ring.setX(this.sprite.x);
      },
      onComplete: () => {
        this.hopTween = undefined;
        this.sprite.setPosition(x, this.homeY).setFlipX(false);
        this.ring.setX(x);
        this.setPose('idle');
        onLand?.();
      },
    });
  }

  /** The tug before a carrot (or the mole) comes up. */
  pull(onDone: () => void): void {
    this.setPose('pull');
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScale * this.cfg.bunnyMotion.pullSquash.x,
      scaleY: this.baseScale * this.cfg.bunnyMotion.pullSquash.y,
      duration: this.cfg.pullMs / 2,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: onDone,
    });
  }

  /** Right carrot: a happy squash-and-hop in place. */
  happy(): void {
    this.setPose('happy');
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.homeY - this.cfg.reward.hopPx,
      duration: this.cfg.reward.hopMs,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => this.sprite.setY(this.homeY),
    });
  }

  /** Wrong hole or time's up: ears droop, a sweat drop (no spin, nothing scary). */
  oops(): void {
    // A time-out can land mid-hop (arrow keys): land first, so the hop's landing
    // doesn't put the idle pose back over the oops.
    if (this.hopTween?.isPlaying()) this.hopTween.complete();
    this.setPose('oops');
    const m = this.cfg.bunnyMotion;
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -m.oopsWobbleDeg, to: m.oopsWobbleDeg },
      duration: m.oopsWobbleMs,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  /** The finish: hop over to the basket and cheer. */
  cheerAt(x: number, onDone: () => void): void {
    this.ring.setVisible(false);
    this.hopTo(
      x,
      () => {
        this.setPose('cheer');
        this.scene.tweens.add({
          targets: this.sprite,
          y: this.homeY - this.cfg.bunnyMotion.cheerBouncePx,
          duration: this.cfg.bunnyMotion.cheerBounceMs,
          yoyo: true,
          repeat: this.cfg.bunnyMotion.cheerBounces,
          ease: 'Quad.Out',
        });
        onDone();
      },
      this.cfg.finishHopMs,
    );
  }

  destroy(): void {
    this.hopTween?.stop();
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
    this.ring.destroy();
  }
}
