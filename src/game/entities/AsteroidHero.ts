// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { pickNextHeroSpriteKey, ParticleSpriteKeys } from '@/core/spriteKeys';

/**
 * Hero for the Asteroid Field game mode.
 *
 * Differs from `Hero` (Alien Shoot's auto-side-to-side runner):
 *  - Sits FIXED at the playfield center (no movement input)
 *  - ROTATES to face an aim target (driven externally via `setAimAngle`)
 *  - Fires in the facing direction (caller spawns the projectile with
 *    the current facing angle)
 *
 * Reuses the same speeder sprites + round-robin picker as the Alien
 * Shoot hero (sprint 0.7 Story 3) for visual continuity across game
 * modes. Engine glow particle emitter behind the ship (relative to its
 * facing direction) gives a sense of "this ship has thrust."
 *
 * Sprint 2.1 design call: hero is STATIC in Asteroid Field. The mode
 * is "you stand still and shoot floating things" — adding hero
 * translation would mean a twin-stick scheme that complicates the
 * mobile input model. If a future sprint wants a moving hero, the
 * input layer can pipe a translation vector into a new public setter.
 */
export class AsteroidHero extends Phaser.GameObjects.Container {
  /**
   * Display dimensions in design pixels. Slightly larger than the Alien
   * Shoot Hero (115×65) because it's the focal point of a stationary
   * scene rather than competing with descending aliens for attention.
   */
  static readonly WIDTH = 130;
  static readonly HEIGHT = 73;

  private readonly sprite: Phaser.GameObjects.Sprite;
  /**
   * Engine glow emitter. Follows the hero in world space (NOT a
   * container child) so particles stay where emitted as the hero
   * rotates — when the ship spins, you see a trail of past particles
   * behind it like a comet tail.
   */
  private readonly engineEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  /**
   * Current aim angle in radians. 0 = facing right (Phaser standard).
   * Set externally via `setAimAngle`. The sprite's actual rendered
   * rotation is `aimAngle` — the source art faces LEFT (per the Alien
   * Shoot Hero contract), so we render flipped THEN rotate. See
   * `applyFacing` for the details.
   */
  private aimAngle = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);

    const heroKey = pickNextHeroSpriteKey();
    this.sprite = scene.add.sprite(0, 0, heroKey);
    const nativeWidth = this.sprite.width;
    this.sprite.setScale(AsteroidHero.WIDTH / nativeWidth);

    // Source art faces LEFT (see Hero.ts for the same contract). Sprite
    // is flipped to face RIGHT as the "0 rad" baseline, then rotated to
    // the aimAngle. This mirrors how Alien Shoot's Hero handles flip but
    // here the rotation is continuous instead of binary.
    this.sprite.setFlipX(true);
    this.add(this.sprite);

    // Engine glow — emits OPPOSITE the facing direction (so it trails
    // behind the ship). We update the emitter's angle in applyFacing.
    this.engineEmitter = scene.add.particles(0, 0, ParticleSpriteKeys.Circle03, {
      speed: { min: 20, max: 50 },
      angle: { min: 80, max: 100 }, // default: down (will be re-aimed)
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.75, end: 0 },
      lifespan: 400,
      frequency: 55,
      tint: 0xfacc15,
      blendMode: 'ADD',
    });
    this.engineEmitter.startFollow(this);
    this.engineEmitter.setDepth(-1);

    this.setSize(AsteroidHero.WIDTH, AsteroidHero.HEIGHT);
    this.applyFacing();
  }

  /**
   * Set the aim angle (radians, 0 = right). Called by the input system
   * each frame (mouse position, joystick drag, or keyboard arrow keys).
   * Triggers a re-render of the ship's facing + the engine glow's
   * trail direction.
   */
  setAimAngle(angleRad: number): void {
    this.aimAngle = angleRad;
    this.applyFacing();
  }

  /** Current aim angle in radians (0 = right, π/2 = down, π = left, etc.). */
  getAimAngle(): number {
    return this.aimAngle;
  }

  /**
   * Rotate by a delta (used by the keyboard arrow-key path and the
   * touch-drag joystick — both accumulate angular velocity over time).
   * `deltaRad` can be positive or negative.
   */
  rotateBy(deltaRad: number): void {
    this.aimAngle += deltaRad;
    // Wrap into [-π, π] so consumers don't see growing-without-bound angles.
    while (this.aimAngle > Math.PI) this.aimAngle -= Math.PI * 2;
    while (this.aimAngle < -Math.PI) this.aimAngle += Math.PI * 2;
    this.applyFacing();
  }

  /**
   * Maximum angular velocity in rad/s for the keyboard/joystick paths.
   * Read from config so a future "rotate slower" playtest call is a
   * 1-line config edit.
   */
  static get maxRotationRadPerSec(): number {
    return config.asteroidField.heroRotationRadPerSec;
  }

  // ----- Animations (mirrored from Alien Shoot Hero for consistency) -------

  /** Brief alpha flash when something interesting happens (hit confirmation). */
  playHitAnim(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: { from: 0.4, to: 1 },
      duration: 120,
      ease: 'Quad.Out',
    });
  }

  /** Per-frame update hook. Currently a no-op (hero is static); kept for parity. */
  update(_dt: number): void {
    // Reserved for future: idle bob, thrust-jitter, etc.
  }

  /** Tear down emitter to avoid orphan particle systems at scene shutdown. */
  destroy(fromScene?: boolean): void {
    this.engineEmitter.stop();
    this.engineEmitter.destroy();
    super.destroy(fromScene);
  }

  // ----- Internal -----------------------------------------------------------

  /**
   * Apply the current `aimAngle` to the sprite rotation + the engine-glow
   * emitter follow-offset (so the trail spawns BEHIND the ship's current
   * facing). Called whenever aimAngle changes.
   *
   * Geometry: aimAngle = 0 means "facing right." The source sprite is
   * already flipped to baseline-right (setFlipX(true) in the constructor).
   * Setting `this.sprite.rotation = aimAngle` rotates the (already-right-
   * facing) sprite to point at the aim direction.
   *
   * Engine trail: rather than dynamically changing the emitter's particle
   * angle (Phaser 3's runtime API for that is awkward — particleAngle is
   * an EmitterOp, not a simple setter), we move the EMITTER POSITION to
   * a point behind the ship via `followOffset`. The particles spawn at
   * that offset position and drift in the emitter's configured direction
   * (downward). The visual effect is "particles appear behind the ship
   * and stream away" which reads as a trail.
   *
   * Offset distance is a half-hero-length behind the facing direction.
   */
  private applyFacing(): void {
    this.sprite.rotation = this.aimAngle;
    const trailOffset = AsteroidHero.WIDTH * 0.4;
    const behindDx = -Math.cos(this.aimAngle) * trailOffset;
    const behindDy = -Math.sin(this.aimAngle) * trailOffset;
    this.engineEmitter.followOffset.set(behindDx, behindDy);
  }
}
