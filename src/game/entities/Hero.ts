// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';

/**
 * The auto-running hero at the bottom of the play area.
 *
 * Movement: bounces between `leftBound` and `rightBound` at the constant speed
 * from `config.hero.runSpeedPxPerSec`. The player's only direct control is
 * fire timing — the hero's position is deterministic given the elapsed time
 * since round start, which keeps gameplay focused on math+timing rather than
 * twin-stick steering.
 *
 * Visuals: a placeholder rounded rectangle (~48x64) with a small "front" notch
 * indicating direction. Real Kenney sprites land in the art-polish milestone.
 *
 * Animations: `playHitAnim()` is a brief tint flash; `playDeathAnim(onDone)`
 * is a short drop+shake then calls back. Both are kid-friendly: short
 * (~400ms), informative-not-punishing.
 */
export class Hero extends Phaser.GameObjects.Container {
  private readonly chassis: Phaser.GameObjects.Rectangle;
  private readonly notch: Phaser.GameObjects.Triangle;
  private readonly leftBound: number;
  private readonly rightBound: number;
  /** +1 moving right, -1 moving left. */
  private direction: 1 | -1 = 1;
  /** Set true while the death animation is playing; movement halts. */
  private dead = false;

  constructor(scene: Phaser.Scene, x: number, y: number, leftBound: number, rightBound: number) {
    super(scene, x, y);
    scene.add.existing(this);

    this.leftBound = leftBound;
    this.rightBound = rightBound;

    // Chassis: vivid amber rectangle (NOT named `body` — that field is
    // reserved by Phaser's GameObject for the arcade physics body).
    this.chassis = scene.add.rectangle(0, 0, 48, 64, 0xfacc15);
    this.chassis.setStrokeStyle(2, 0xeab308);

    // Direction notch: small triangle on the leading edge so the hero "looks"
    // the way they're running.
    this.notch = scene.add.triangle(24, 0, 0, -10, 0, 10, 12, 0, 0xeab308);

    this.add([this.chassis, this.notch]);
    this.setSize(48, 64);
  }

  /**
   * Per-frame update. Call once from the GameScene's `update()` with `dt` in
   * milliseconds (Phaser's standard unit).
   */
  update(dt: number): void {
    if (this.dead) return;
    const dxPerMs = config.hero.runSpeedPxPerSec / 1000;
    this.x += this.direction * dxPerMs * dt;
    if (this.x > this.rightBound) {
      this.x = this.rightBound;
      this.direction = -1;
      this.notch.setX(-24);
      this.notch.setRotation(Math.PI);
    } else if (this.x < this.leftBound) {
      this.x = this.leftBound;
      this.direction = 1;
      this.notch.setX(24);
      this.notch.setRotation(0);
    }
  }

  /**
   * Returns which lane (0-indexed, left to right) the hero is currently under,
   * given the lane count and the same bounds the hero is moving inside.
   * Used by HitSystem to decide which alien a fired projectile will reach.
   */
  currentLane(lanes: number): number {
    const span = this.rightBound - this.leftBound;
    const laneWidth = span / lanes;
    const offset = this.x - this.leftBound;
    return Phaser.Math.Clamp(Math.floor(offset / laneWidth), 0, lanes - 1);
  }

  /** Brief alpha flash when something interesting happens (hit confirmation). */
  playHitAnim(): void {
    this.scene.tweens.add({
      targets: this.chassis,
      alpha: { from: 0.4, to: 1 },
      duration: 120,
      ease: 'Quad.Out',
    });
  }

  /**
   * Death animation — short downward drop + shake + fade. Calls `onComplete`
   * when done. Kept under ~400ms so kids don't lose patience.
   */
  playDeathAnim(onComplete: () => void): void {
    this.dead = true;
    const startX = this.x;
    const startY = this.y;
    this.scene.tweens.add({
      targets: this,
      y: startY + 30,
      alpha: 0.4,
      duration: 200,
      ease: 'Sine.In',
    });
    this.scene.tweens.add({
      targets: this,
      x: { from: startX - 4, to: startX + 4 },
      yoyo: true,
      repeat: 3,
      duration: 50,
      ease: 'Sine.InOut',
      onComplete: () => {
        // Reset for next question.
        this.x = startX;
        this.y = startY;
        this.alpha = 1;
        this.dead = false;
        onComplete();
      },
    });
  }
}
