// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { ParticleSpriteKeys } from '@/core/spriteKeys';

/**
 * Upward-moving projectile fired by the hero.
 *
 * Visuals (sprint 0.7 Story 5): a `light_01` radial-blob texture from
 * the Kenney Particle Pack, stretched to a tall capsule shape and
 * tinted amber to read as a "glowing laser pellet." This is the
 * option 1-a decision from Story 1 planning — use a particle-pack
 * texture as the projectile rather than downloading a dedicated
 * laser-sprite pack.
 *
 * Texture choice rationale: `trace_03` was tried first but its source
 * texture is a narrow streak with only ~2-3 pixels of visible content
 * in the 64×64 PNG — stretching it to projectile dimensions produced
 * a near-invisible 1-pixel line in-game. `light_01` is a full-area
 * radial glow (the entire 64×64 area is visible as a soft blob), so
 * stretching to 22×60 gives a clearly-visible capsule with natural
 * additive glow.
 *
 * Lifecycle: created at the hero's position when InputSystem emits 'fire',
 * advanced each frame in GameScene.update, destroyed on collision (HitSystem)
 * OR when the projectile leaves the top of the canvas. GameScene tracks at
 * most one live projectile at a time per the design (one shot per cooldown
 * window).
 */
export class Projectile extends Phaser.GameObjects.Container {
  /**
   * Projectile display dimensions. Also drives the AABB hit area.
   *
   * Tuning history (sprint 0.7 Story 5 playtest):
   *   - First pass: 8×24 with `trace_03` texture. Felt "too small by far."
   *   - Second pass: 14×40 still with `trace_03`. STILL invisible —
   *     trace_03's actual visible streak is only 2-3 pixels wide in the
   *     source, so stretching produced a near-1-pixel line.
   *   - Current: 22×60 with `light_01` texture. light_01 is a full-area
   *     radial glow whose entire 64×64 area is visible, so stretching
   *     to capsule proportions gives a clearly-visible glowing pellet.
   */
  static readonly WIDTH = 22;
  static readonly HEIGHT = 60;

  private readonly sprite: Phaser.GameObjects.Image;
  private destroyed = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);

    // Stretched light_01 radial blob as a glowing capsule. ADD blend so
    // it reads as glow against the dark canvas. Amber tint matches the
    // hero engine glow + UI accent palette.
    this.sprite = scene.add.image(0, 0, ParticleSpriteKeys.Light01);
    this.sprite.setDisplaySize(Projectile.WIDTH, Projectile.HEIGHT);
    this.sprite.setTint(0xfacc15);
    this.sprite.setBlendMode(Phaser.BlendModes.ADD);
    this.add(this.sprite);
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

  /**
   * AABB rectangle for HitSystem collision checks. Returns a per-instance
   * scratch buffer mutated in place — callers must NOT retain the reference
   * across frames. This avoids allocating a fresh `Rectangle` every frame
   * (the projectile is hit-tested once per `update()`).
   */
  bounds(): Phaser.Geom.Rectangle {
    this._boundsScratch.setTo(
      this.x - Projectile.WIDTH / 2,
      this.y - Projectile.HEIGHT / 2,
      Projectile.WIDTH,
      Projectile.HEIGHT,
    );
    return this._boundsScratch;
  }
  private readonly _boundsScratch = new Phaser.Geom.Rectangle(0, 0, 0, 0);

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
