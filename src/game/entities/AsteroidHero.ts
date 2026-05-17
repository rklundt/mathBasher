// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { ParticleSpriteKeys } from '@/core/spriteKeys';

/**
 * Hero for the Asteroid Field game mode.
 *
 * Differs from `Hero` (Alien Shoot's auto-side-to-side runner):
 *  - Sits FIXED at the playfield center (no movement input)
 *  - ROTATES to face an aim target (driven externally via `setAimAngle`)
 *  - Fires in the facing direction (caller spawns the projectile with
 *    the current facing angle)
 *
 * **Visual: procedural triangle ship** (classic Asteroids style).
 * Sprint 2.1 originally reused Alien Shoot's speeder sprites; playtest
 * showed the curved sleek speeder didn't fit the spinning-aim metaphor
 * (a side-facing ship is unintuitive to rotate). Swapped to a hand-
 * drawn isoceles triangle pointing right (= aim direction 0) with a
 * cockpit dot, amber outline, and an "engine vent" notch at the back.
 * Reads instantly as "this is the thing that rotates and shoots."
 *
 * No sprite-asset dependency — the ship is built with Phaser Graphics
 * and lives entirely in code. If a future sprint wants AI-art ships,
 * the procedural fallback stays as a clean visual baseline.
 *
 * Sprint 2.1 design call: hero is STATIC in Asteroid Field. The mode
 * is "you stand still and shoot floating things" — adding hero
 * translation would mean a twin-stick scheme that complicates the
 * mobile input model. If a future sprint wants a moving hero, the
 * input layer can pipe a translation vector into a new public setter.
 */
export class AsteroidHero extends Phaser.GameObjects.Container {
  /**
   * Display dimensions in design pixels. Triangle ship is wider-than-
   * tall, pointing right. 64×52 reads as a clean focal-point ship
   * without competing with the asteroid silhouettes for attention.
   */
  static readonly WIDTH = 64;
  static readonly HEIGHT = 52;

  /**
   * Procedural triangle ship body. Re-rendered into a Graphics object
   * once at construction; rotated as a whole via `this.rotation` when
   * the aim angle changes. Named `shipGraphics` (not `body`) to avoid
   * collision with Phaser's `Container.body` field (the Arcade-physics
   * body slot, which we don't use but the type declares).
   */
  private readonly shipGraphics: Phaser.GameObjects.Graphics;
  /**
   * Engine glow emitter. Follows the hero in world space (NOT a
   * container child) so particles stay where emitted as the hero
   * rotates — when the ship spins, you see a trail of past particles
   * behind it like a comet tail.
   */
  private readonly engineEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  /**
   * Current aim angle in radians. 0 = facing right (Phaser standard).
   * Set externally via `setAimAngle`. The triangle ship is drawn
   * pointing RIGHT at the (0, 0) baseline; `this.rotation = aimAngle`
   * spins it to face the aim direction.
   */
  private aimAngle = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);

    // Procedural triangle ship body. Drawn pointing RIGHT at the (0, 0)
    // baseline. Container rotation (`this.rotation = aimAngle`) handles
    // facing. Visual breakdown:
    //   - Main triangle: amber fill + darker amber stroke. Nose at +halfW,
    //     back corners at (-halfW, ±halfH). Classic vector look.
    //   - Engine vent at the back: a small inset notch + slightly darker
    //     stroke for the "thrust nozzle" detail.
    //   - Cockpit dot near the nose: small circle in a brighter color
    //     for visual interest + a clear "front of ship" cue.
    this.shipGraphics = scene.add.graphics();
    this.drawTriangleShip();
    this.add(this.shipGraphics);
    // Re-target the per-instance graphics so its draw calls land on the
    // fresh object created above (was implicitly correct via `this.body`
    // before the rename; explicit now for clarity).

    // Engine glow — emits BEHIND the ship via the followOffset trick
    // (see applyFacing for details). Same particle pool + tint as the
    // Alien Shoot hero for visual continuity.
    this.engineEmitter = scene.add.particles(0, 0, ParticleSpriteKeys.Circle03, {
      speed: { min: 20, max: 50 },
      angle: { min: 80, max: 100 },
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
   * Draw the triangle ship body. Called once at construction; the
   * container's rotation handles re-orientation each frame so the
   * Graphics doesn't need to be re-drawn.
   *
   * Geometry (right-facing at baseline):
   *   - Nose:           ( +W/2,    0    )
   *   - Top-back:       ( -W/2, -H/2 )
   *   - Bottom-back:    ( -W/2, +H/2 )
   *   - Engine notch:   ( -W/2 + 6, 0 )  (inset for the thrust nozzle)
   */
  private drawTriangleShip(): void {
    const halfW = AsteroidHero.WIDTH / 2;
    const halfH = AsteroidHero.HEIGHT / 2;
    const FILL = 0xfacc15; // amber, matches projectile + UI accent
    const STROKE = 0xa16207; // darker amber for the outline
    const COCKPIT = 0xffffff; // bright white for the cockpit dot

    // Main triangle body (filled).
    this.shipGraphics.fillStyle(FILL, 1);
    this.shipGraphics.lineStyle(3, STROKE, 1);
    this.shipGraphics.beginPath();
    this.shipGraphics.moveTo(halfW, 0);
    this.shipGraphics.lineTo(-halfW, -halfH);
    this.shipGraphics.lineTo(-halfW + 6, 0); // engine-vent notch top
    this.shipGraphics.lineTo(-halfW, +halfH);
    this.shipGraphics.closePath();
    this.shipGraphics.fillPath();
    this.shipGraphics.strokePath();

    // Cockpit dot — small white circle a third of the way back from the nose.
    const cockpitX = halfW * 0.35;
    this.shipGraphics.fillStyle(COCKPIT, 1);
    this.shipGraphics.fillCircle(cockpitX, 0, 4);
    this.shipGraphics.lineStyle(1, STROKE, 1);
    this.shipGraphics.strokeCircle(cockpitX, 0, 4);
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
      targets: this.shipGraphics,
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
   * Apply the current `aimAngle` to the container rotation + the
   * engine-glow emitter follow-offset (so the trail spawns BEHIND the
   * ship's current facing). Called whenever aimAngle changes.
   *
   * Geometry: aimAngle = 0 means "facing right." The triangle ship body
   * is drawn pointing RIGHT at the (0, 0) baseline (see
   * `drawTriangleShip` above). Setting `this.rotation = aimAngle`
   * rotates the whole container (body + future cosmetic children) to
   * point at the aim direction.
   *
   * Engine trail: rather than dynamically changing the emitter's
   * particle angle (Phaser 3's runtime API for that is awkward —
   * particleAngle is an EmitterOp, not a simple setter), we move the
   * EMITTER POSITION to a point behind the ship via `followOffset`.
   * The particles spawn at that offset position and drift in the
   * emitter's configured direction (downward). The visual effect is
   * "particles appear behind the ship and stream away" which reads
   * as a trail.
   *
   * Offset distance is a half-hero-length behind the facing direction.
   */
  private applyFacing(): void {
    this.rotation = this.aimAngle;
    const trailOffset = AsteroidHero.WIDTH * 0.4;
    const behindDx = -Math.cos(this.aimAngle) * trailOffset;
    const behindDy = -Math.sin(this.aimAngle) * trailOffset;
    this.engineEmitter.followOffset.set(behindDx, behindDy);
  }
}
