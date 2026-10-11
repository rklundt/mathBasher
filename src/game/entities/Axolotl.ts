// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { AXOLOTL_SHEET, type AxolotlSpriteKey } from '@/core/spriteKeys';
import { facingFor, rotationFor, stepToward, type Facing } from '@/game/systems/mathALotlMath';

/**
 * The Math-a-lotl hero (sprint 2.5.4): a code-drawn axolotl sprite that
 * swims toward a target with the 6-frame swim cycle, flips to face its
 * travel direction, tilts its nose up / down toward the target, and
 * shows a happy face after a catch.
 *
 * The target is either a fixed point (tap on open water) or a moving
 * one (a rising bubble), so it's supplied as a function polled each
 * frame. The scene owns catch detection; this class only reports where
 * the head is (`headPoint`).
 */
export class Axolotl {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly animKey: string;
  private readonly cfg = config.mathALotl.axolotl;
  private readonly maxTiltRad = (config.mathALotl.axolotl.maxTiltDeg * Math.PI) / 180;
  private target: (() => { x: number; y: number } | null) | null = null;
  /** A bubble chase keeps tracking after "arrival"; a tap on open water ends there. */
  private targetMoves = false;
  private facing: Facing = { flipX: false, tilt: 0 };
  private happyTimer: Phaser.Time.TimerEvent | null = null;

  /**
   * Head offset from the sprite centre in SHEET pixels (facing right,
   * untilted) — where the mouth sits in `scripts/sprites/axolotl.mjs`.
   */
  private static readonly HEAD_OFFSET = { x: 90, y: 12 };

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    textureKey: AxolotlSpriteKey,
  ) {
    this.animKey = `${textureKey}/swim`;
    if (!scene.anims.exists(this.animKey)) {
      scene.anims.create({
        key: this.animKey,
        frames: scene.anims.generateFrameNumbers(textureKey, { start: 0, end: AXOLOTL_SHEET.swimFrames - 1 }),
        frameRate: this.cfg.swimFps,
        repeat: -1,
      });
    }
    this.sprite = scene.add.sprite(x, y, textureKey, 0);
    this.sprite.setScale(this.cfg.displayWidthPx / AXOLOTL_SHEET.frameWidth);
    this.sprite.play(this.animKey);
    this.sprite.anims.timeScale = this.cfg.idleFps / this.cfg.swimFps;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  /** Swim toward a (possibly moving) target; `null` from the getter stops the chase. */
  chase(getTarget: () => { x: number; y: number } | null): void {
    this.target = getTarget;
    this.targetMoves = true;
  }

  /** Swim toward a fixed point. */
  swimTo(x: number, y: number): void {
    this.target = () => ({ x, y });
    this.targetMoves = false;
  }

  stop(): void {
    this.target = null;
  }

  /** Mouth position in world space — the point that catches bubbles. */
  headPoint(): { x: number; y: number } {
    const s = this.sprite.scaleX;
    const ox = Axolotl.HEAD_OFFSET.x * s * (this.facing.flipX ? -1 : 1);
    const oy = Axolotl.HEAD_OFFSET.y * s;
    const r = this.sprite.rotation;
    return {
      x: this.sprite.x + ox * Math.cos(r) - oy * Math.sin(r),
      y: this.sprite.y + ox * Math.sin(r) + oy * Math.cos(r),
    };
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    const t = this.target?.() ?? null;
    let moving = false;
    if (t) {
      // Steer so the HEAD (not the sprite centre) reaches the target.
      const head = this.headPoint();
      const goalX = t.x - (head.x - this.sprite.x);
      const goalY = t.y - (head.y - this.sprite.y);
      const step = stepToward(this.sprite.x, this.sprite.y, goalX, goalY, this.cfg.swimPxPerSec * dt);
      this.sprite.setPosition(step.x, step.y);
      if (!step.arrived) {
        moving = true;
        this.facing = facingFor(step.dx, step.dy, this.facing.flipX, this.maxTiltRad);
      } else if (!this.targetMoves) {
        this.target = null;
      }
    }
    // Ease the nose back to level when resting; toward the target tilt when moving.
    const wantTilt = moving ? this.facing.tilt : 0;
    const k = Math.min(1, this.cfg.tiltEasePerSec * dt);
    const current = this.facing.flipX ? -this.sprite.rotation : this.sprite.rotation;
    const eased = current + (wantTilt - current) * k;
    this.sprite.setFlipX(this.facing.flipX);
    this.sprite.setRotation(rotationFor({ flipX: this.facing.flipX, tilt: eased }));
    // Paddle at full speed while swimming, lazily while resting.
    if (!this.happyTimer) {
      this.sprite.anims.timeScale = moving ? 1 : this.cfg.idleFps / this.cfg.swimFps;
    }
  }

  /** Closed-eye happy face for a beat, then back to swimming. */
  playHappy(): void {
    this.happyTimer?.remove();
    this.sprite.anims.stop();
    this.sprite.setFrame(AXOLOTL_SHEET.happyFrame);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.sprite.scaleX * 1.12,
      scaleY: this.sprite.scaleY * 1.12,
      duration: 140,
      yoyo: true,
      ease: 'Quad.Out',
    });
    this.happyTimer = this.scene.time.delayedCall(this.cfg.happyHoldMs, () => {
      this.happyTimer = null;
      this.sprite.play(this.animKey);
    });
  }

  pause(): void {
    this.sprite.anims.pause();
  }

  resume(): void {
    this.sprite.anims.resume();
  }

  destroy(): void {
    this.happyTimer?.remove();
    this.happyTimer = null;
    this.sprite.destroy();
  }
}
