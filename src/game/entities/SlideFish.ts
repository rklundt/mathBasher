// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SLIDE_FISH_SHEET, SNOWBALL_SHEET } from '@/core/spriteKeys';
import { textStyle } from '@/game/ui/typography';
import { MathText } from '@/game/ui/MathText';
import { CALLOUT_INK_CSS } from '@/game/ui/uiPalette';

/** The wiggle animation key for a fish colour. */
export const fishAnimKey = (colour: number): string => `${SLIDE_FISH_SHEET.key}/wiggle-${colour}`;

/**
 * One fish in a Penguin Slide row (sprint 2.7): a wiggling kawaii fish and
 * its answer on a dark badge above it. The fish shrinks with distance; the
 * badge never shrinks below a readable floor. Every item looks like a fish
 * until it's caught — a wrong one is then revealed as a snowball.
 */
export class SlideFish {
  readonly container: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly badge: Phaser.GameObjects.Container;
  private readonly cfg = config.penguinSlide;
  private readonly baseScale: number;
  private alive = true;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    colour: number,
    readonly answer: number,
    display: string,
  ) {
    this.baseScale = this.cfg.fish.displayPx / SLIDE_FISH_SHEET.frame;
    this.sprite = scene.add.sprite(0, 0, SLIDE_FISH_SHEET.key, colour * SLIDE_FISH_SHEET.wiggleFrames);
    this.sprite.play({
      key: fishAnimKey(colour),
      startFrame: Math.floor(Math.random() * SLIDE_FISH_SHEET.wiggleFrames),
    });

    const { padPx, heightPadPx, maxWidthPx } = this.cfg.badge;
    const label = new MathText(scene, 0, 0, display, textStyle('alienAnswer'));
    label.setStroke(CALLOUT_INK_CSS, 6);
    const fit = Math.min(1, (maxWidthPx - padPx * 2) / label.width);
    label.setScale(fit);
    const w = label.width * fit + padPx * 2;
    const h = label.height * fit + heightPadPx;
    const pill = scene.add.graphics();
    pill.fillStyle(0x1f3550, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    pill.lineStyle(3, 0xcfe6ff, 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.badge = scene.add.container(0, 0, [pill, label]);

    this.container = scene.add.container(x, y, [this.sprite, this.badge]).setDepth(6);
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  /** Radius a tap may land within to count as "on this fish". */
  get hitRadius(): number {
    return (this.cfg.fish.displayPx / 2) * (this.sprite.scaleX / this.baseScale);
  }

  /** Place the fish for its distance down the hill: fish scale + badge scale (with its floor). */
  place(y: number, fishScale: number, badgeScale: number): void {
    this.container.setY(y);
    this.sprite.setScale(this.baseScale * fishScale);
    this.badge.setScale(badgeScale).setY(this.cfg.badge.offsetY * fishScale);
  }

  /** The tap lands on this one: a quick squish so the tap feels instant. */
  squish(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.sprite.scaleX * 1.15,
      scaleY: this.sprite.scaleY * 0.85,
      duration: 90,
      yoyo: true,
    });
  }

  /** Right fish: gulped — it shrinks into the penguin's beak. */
  gulped(intoX: number, intoY: number): void {
    this.alive = false;
    this.badge.setVisible(false);
    this.sprite.stop();
    this.scene.tweens.add({
      targets: this.container,
      x: intoX,
      y: intoY,
      scale: 0.2,
      alpha: 0,
      duration: this.cfg.gulpMs * 0.6,
      ease: 'Quad.In',
      onComplete: () => this.destroy(),
    });
  }

  /** Wrong fish: revealed as a snowball, then it bursts. */
  revealSnowball(): void {
    this.alive = false;
    this.badge.setVisible(false);
    this.sprite.stop();
    this.sprite.setTexture(SNOWBALL_SHEET.key, 0);
    this.scene.time.delayedCall(this.cfg.bonkSpinMs * 0.35, () => {
      if (!this.sprite.active) return;
      this.sprite.setFrame(1);
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        scale: 1.3,
        duration: this.cfg.bonkSpinMs * 0.6,
        onComplete: () => this.destroy(),
      });
    });
  }

  /** Quietly leave (the rest of the row after an answer, or the right fish swimming past at time-out). */
  swimAway(): void {
    this.alive = false;
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      y: this.container.y + 60,
      duration: 380,
      ease: 'Quad.In',
      onComplete: () => this.destroy(),
    });
  }

  pauseAnim(): void {
    this.sprite.anims.pause();
  }

  resumeAnim(): void {
    this.sprite.anims.resume();
  }

  destroy(): void {
    this.alive = false;
    if (!this.container.active) return;
    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.killTweensOf(this.sprite);
    this.container.destroy();
  }
}
