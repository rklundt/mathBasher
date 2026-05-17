// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { ParticleSpriteKeys } from '@/core/spriteKeys';

/**
 * Aimed projectile fired by the AsteroidHero in arbitrary 2D direction.
 *
 * Distinct from `Projectile` (Alien Shoot's straight-up shot) because:
 *  - Travels in an ARBITRARY direction (set at construction time via
 *    `angleRad`), not just upward
 *  - Uses an out-of-bounds-on-any-edge culling check, not just topY < 0
 *  - Collision is circle-on-circle vs the asteroids (AsteroidHitSystem),
 *    not AABB
 *
 * Visual: same `light_01` glowing-capsule as Alien Shoot's Projectile,
 * but the capsule is rotated to face the travel direction so it visually
 * reads as "going that way" rather than "going up sideways."
 *
 * Lifecycle: created at the hero's position when fire is triggered,
 * advanced each frame in AsteroidFieldScene.update, destroyed on
 * collision (AsteroidHitSystem) OR when leaving the playfield. Scene
 * tracks at most one live projectile at a time per the cooldown design.
 */
export class AsteroidProjectile extends Phaser.GameObjects.Container {
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly vx: number;
  private readonly vy: number;
  private readonly lengthPx: number;
  private destroyed = false;

  /**
   * @param scene    Phaser scene
   * @param x        Spawn x (hero's center)
   * @param y        Spawn y (hero's center)
   * @param angleRad Travel direction in radians (0 = right)
   */
  constructor(scene: Phaser.Scene, x: number, y: number, angleRad: number) {
    super(scene, x, y);
    scene.add.existing(this);

    // Capsule dimensions live in config (sprint 2.1 wrap-up — Architect
    // review lift). Stored per-instance for the collision-radius getter.
    this.lengthPx = config.asteroidField.projectile.lengthPx;
    const thicknessPx = config.asteroidField.projectile.thicknessPx;

    this.sprite = scene.add.image(0, 0, ParticleSpriteKeys.Light01);
    this.sprite.setDisplaySize(this.lengthPx, thicknessPx);
    this.sprite.setTint(0xfacc15);
    this.sprite.setBlendMode(Phaser.BlendModes.ADD);
    this.add(this.sprite);

    // Rotate the whole container so the capsule's long axis aligns with
    // the travel direction. The sprite is naturally wider-than-tall (the
    // setDisplaySize above), so rotation = angleRad makes the long axis
    // point at the target.
    this.rotation = angleRad;

    // Velocity components: speed in the aimed direction.
    const speed = config.asteroidField.projectileSpeedPxPerSec;
    this.vx = Math.cos(angleRad) * speed;
    this.vy = Math.sin(angleRad) * speed;

    this.setSize(this.lengthPx, thicknessPx);
  }

  /**
   * Per-frame motion. Returns true if still alive (in-bounds + not killed).
   * Caller passes playfield bounds so the projectile can self-cull when
   * it leaves the canvas (vs. Alien Shoot's simpler topY < 0 check).
   */
  advance(dt: number, leftBound: number, rightBound: number, topBound: number, bottomBound: number): boolean {
    if (this.destroyed) return false;
    this.x += (this.vx * dt) / 1000;
    this.y += (this.vy * dt) / 1000;
    if (this.x < leftBound || this.x > rightBound || this.y < topBound || this.y > bottomBound) {
      return false;
    }
    return true;
  }

  /**
   * Collision radius (for circle-circle test against asteroids). Using
   * the longer half-axis of the capsule as a conservative bound — the
   * capsule is visually thinner than this but it makes the hit test
   * forgiving for kid aim, which is the right side to err on.
   */
  getCollisionRadius(): number {
    return this.lengthPx / 2;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Tear down. Idempotent. */
  kill(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.destroy();
  }
}
