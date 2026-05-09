// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';

/**
 * Upward-moving projectile fired by the hero. Simple ellipse for v1; real
 * sprite art lands in the polish milestone.
 *
 * Lifecycle: created at the hero's position when InputSystem emits 'fire',
 * advanced each frame in GameScene.update, destroyed on collision (HitSystem)
 * OR when the projectile leaves the top of the canvas. GameScene tracks at
 * most one live projectile at a time per the design (one shot per cooldown
 * window).
 */
export class Projectile extends Phaser.GameObjects.Container {
  static readonly WIDTH = 8;
  static readonly HEIGHT = 18;

  private readonly chassis: Phaser.GameObjects.Ellipse;
  private destroyed = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);

    this.chassis = scene.add.ellipse(0, 0, Projectile.WIDTH, Projectile.HEIGHT, 0xfacc15);
    this.chassis.setStrokeStyle(1, 0xeab308);
    this.add(this.chassis);
    this.setSize(Projectile.WIDTH, Projectile.HEIGHT);
  }

  /** Per-frame upward motion. Returns true if the projectile is still alive. */
  advance(dt: number): boolean {
    if (this.destroyed) return false;
    this.y -= (config.hero.projectileSpeedPxPerSec / 1000) * dt;
    return true;
  }

  /** Y of the projectile's TOP edge — used to decide when it leaves the canvas. */
  topY(): number {
    return this.y - Projectile.HEIGHT / 2;
  }

  /** Y of the projectile's BOTTOM edge — used for collision against alien tops. */
  bottomY(): number {
    return this.y + Projectile.HEIGHT / 2;
  }

  /** AABB rectangle for HitSystem collision checks. */
  bounds(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      this.x - Projectile.WIDTH / 2,
      this.y - Projectile.HEIGHT / 2,
      Projectile.WIDTH,
      Projectile.HEIGHT,
    );
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Tear down the projectile. Idempotent — calling twice is safe. */
  kill(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.destroy();
  }
}
