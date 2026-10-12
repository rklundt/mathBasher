// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { FROG_SHEET, type FrogSpriteKey } from '@/core/spriteKeys';
import { hopPoint } from '@/game/systems/frogSplashMath';

type Pose = keyof typeof FROG_SHEET.poses;

/**
 * The Frog Splash hero (sprint 2.5.6): a code-drawn cartoon frog that sits,
 * blinks, crouches, leaps along an arc (growing a little at the top, with a
 * shadow left on the water), splashes into the river, pops back up, and
 * opens its mouth for the fly at the end.
 *
 * Poses are frames of one sheet (`FROG_SHEET.poses`); motion is tweens, so
 * the scene's tween / clock pause freezes everything mid-hop.
 */
export class Frog {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly cfg = config.frogSplash.frog;
  private readonly baseScale: number;
  private pose: Pose = 'sit';
  private blinkTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    textureKey: FrogSpriteKey,
  ) {
    this.baseScale = this.cfg.displayPx / FROG_SHEET.frame;
    this.shadow = scene.add.ellipse(x, y + this.cfg.displayPx * 0.38, this.cfg.displayPx * 0.7, this.cfg.displayPx * 0.22, 0x0b2a3a, 0.28);
    this.shadow.setDepth(9);
    this.sprite = scene.add.sprite(x, y, textureKey, FROG_SHEET.poses.sit);
    this.sprite.setScale(this.baseScale).setDepth(10);
    this.blinkTimer = scene.time.addEvent({
      delay: this.cfg.blinkEveryMs,
      loop: true,
      callback: () => this.blink(),
    });
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  /** Where the mouth is (world px) — the tongue starts here. */
  mouthPoint(): { x: number; y: number } {
    const s = this.sprite.scaleX;
    return { x: this.sprite.x + FROG_SHEET.mouthOffset.x * s, y: this.sprite.y + FROG_SHEET.mouthOffset.y * s };
  }

  setPose(pose: Pose): void {
    this.pose = pose;
    this.sprite.setFrame(FROG_SHEET.poses[pose]);
  }

  /** Place the frog (and its shadow) — used while riding a pad and on respawn. */
  placeAt(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    this.shadow.setPosition(x, y + this.cfg.displayPx * 0.38);
  }

  /**
   * Crouch, then leap along an arc to a (possibly moving) target, landing
   * exactly on it. `onLand` fires once, at the landing point.
   */
  hop(getTarget: () => { x: number; y: number }, onLand: () => void, onLeap?: () => void): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.setPose('crouch');
    const from = { x: this.sprite.x, y: this.sprite.y };
    this.scene.time.delayedCall(this.cfg.crouchMs, () => {
      this.setPose('leap');
      onLeap?.();
      const prog = { t: 0 };
      this.scene.tweens.add({
        targets: prog,
        t: 1,
        duration: this.cfg.hopMs,
        ease: 'Sine.InOut',
        onUpdate: () => {
          const to = getTarget();
          const p = hopPoint(from, to, prog.t, this.cfg.hopArcPx);
          this.sprite.setPosition(p.x, p.y);
          this.sprite.setScale(this.baseScale * (1 + this.cfg.hopGrow * p.lift));
          // The shadow stays on the water: straight line, shrinking at the top.
          const gx = from.x + (to.x - from.x) * prog.t;
          const gy = from.y + (to.y - from.y) * prog.t + this.cfg.displayPx * 0.38;
          this.shadow.setPosition(gx, gy).setScale(1 - 0.4 * p.lift);
        },
        onComplete: () => {
          const to = getTarget();
          this.placeAt(to.x, to.y);
          this.sprite.setScale(this.baseScale);
          this.shadow.setScale(1);
          this.setPose('sit');
          // Little landing squash.
          this.scene.tweens.add({
            targets: this.sprite,
            scaleY: this.baseScale * 0.88,
            scaleX: this.baseScale * 1.08,
            duration: 70,
            yoyo: true,
            ease: 'Quad.Out',
          });
          onLand();
        },
      });
    });
  }

  /** SPLASH: surprised face, sink into the water and vanish. */
  splashDown(): void {
    this.setPose('oops');
    this.shadow.setVisible(false);
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y + 22,
      scaleX: this.baseScale * 0.5,
      scaleY: this.baseScale * 0.5,
      alpha: 0,
      duration: 420,
      ease: 'Quad.In',
    });
  }

  /** Pop back up at (x, y) — after a splash, on the last row or the bank. */
  reappear(x: number, y: number): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.placeAt(x, y + 18);
    this.shadow.setVisible(true);
    this.setPose('sit');
    this.sprite.setAlpha(0).setScale(this.baseScale * 0.7);
    this.scene.tweens.add({
      targets: this.sprite,
      y,
      alpha: 1,
      scaleX: this.baseScale,
      scaleY: this.baseScale,
      duration: 320,
      ease: 'Back.Out',
    });
  }

  /** Embarrassed wobble (time ran out — no splash). */
  wobble(): void {
    this.setPose('oops');
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -8, to: 8 },
      duration: 90,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.sprite.setAngle(0);
        this.setPose('sit');
      },
    });
  }

  /** Happy little double bounce in place (made it across). */
  cheer(): void {
    this.setPose('sit');
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 26,
      duration: 160,
      yoyo: true,
      repeat: 1,
      ease: 'Quad.Out',
    });
  }

  private blink(): void {
    if (this.pose !== 'sit') return;
    this.setPose('blink');
    this.scene.time.delayedCall(130, () => {
      if (this.pose === 'blink') this.setPose('sit');
    });
  }

  destroy(): void {
    this.blinkTimer?.remove();
    this.blinkTimer = null;
    this.scene.tweens.killTweensOf(this.sprite);
    this.shadow.destroy();
    this.sprite.destroy();
  }
}
