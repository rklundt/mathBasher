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
  private readonly baseScale: number;
  /** Tweened multipliers on top of `baseScale`: `squash` (turning around) and `pop` (happy bounce). */
  private readonly look = { squash: 1, pop: 1 };
  private lastTurnMs = -Infinity;

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
    this.baseScale = this.cfg.displayWidthPx / AXOLOTL_SHEET.frameWidth;
    this.sprite.setScale(this.baseScale);
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
    const s = this.baseScale;
    const ox = Axolotl.HEAD_OFFSET.x * s * (this.sprite.flipX ? -1 : 1);
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
    let wantTilt = 0;
    if (t) {
      // Facing comes from where the target is relative to the CENTRE
      // (with a deadzone + cooldown — see `facingFor`), never from the
      // per-frame step: steering toward the mouth makes the step's
      // direction depend on the facing itself, which flickered.
      const next = facingFor(
        t.x - this.sprite.x,
        t.y - this.sprite.y,
        this.facing.flipX,
        this.maxTiltRad,
        this.cfg.turnDeadzonePx,
      );
      const now = this.scene.time.now;
      if (next.flipX !== this.facing.flipX && now - this.lastTurnMs >= this.cfg.turnCooldownMs) {
        this.lastTurnMs = now;
        this.facing = next;
        this.playTurn(next.flipX);
      } else {
        this.facing = { flipX: this.facing.flipX, tilt: next.tilt };
      }
      // Steer so the MOUTH (not the sprite centre) reaches the target.
      const head = this.headPoint();
      const goalX = t.x - (head.x - this.sprite.x);
      const goalY = t.y - (head.y - this.sprite.y);
      const step = stepToward(this.sprite.x, this.sprite.y, goalX, goalY, this.cfg.swimPxPerSec * dt);
      this.sprite.setPosition(step.x, step.y);
      if (!step.arrived) {
        moving = true;
        wantTilt = this.facing.tilt;
      } else if (!this.targetMoves) {
        this.target = null;
      }
    }
    // Ease the nose toward the target tilt while swimming, back to level at rest.
    const k = Math.min(1, this.cfg.tiltEasePerSec * dt);
    const shownFlip = this.sprite.flipX;
    const current = shownFlip ? -this.sprite.rotation : this.sprite.rotation;
    this.sprite.setRotation(rotationFor({ flipX: shownFlip, tilt: current + (wantTilt - current) * k }));
    this.sprite.setScale(this.baseScale * this.look.pop * this.look.squash, this.baseScale * this.look.pop);
    // Paddle at full speed while swimming, lazily while resting.
    if (!this.happyTimer) {
      this.sprite.anims.timeScale = moving ? 1 : this.cfg.idleFps / this.cfg.swimFps;
    }
  }

  /** Squash-and-turn: narrow to a sliver, mirror at the thinnest point, widen back. */
  private playTurn(toFlipX: boolean): void {
    this.scene.tweens.killTweensOf(this.look);
    this.look.squash = 1;
    this.scene.tweens.add({
      targets: this.look,
      squash: 0.12,
      duration: this.cfg.turnMs / 2,
      ease: 'Sine.In',
      yoyo: true,
      onYoyo: () => this.sprite.setFlipX(toFlipX),
      onComplete: () => {
        this.sprite.setFlipX(toFlipX);
        this.look.squash = 1;
      },
    });
  }

  /** Closed-eye happy face for a beat, then back to swimming. */
  playHappy(): void {
    this.happyTimer?.remove();
    this.sprite.anims.stop();
    this.sprite.setFrame(AXOLOTL_SHEET.happyFrame);
    this.scene.tweens.add({
      targets: this.look,
      pop: { from: 1, to: 1.12 },
      duration: 140,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => {
        this.look.pop = 1;
      },
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
    this.scene.tweens.killTweensOf(this.look);
    this.sprite.destroy();
  }
}
