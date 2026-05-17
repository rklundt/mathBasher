// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { ParticleSpriteKeys, pickNextAsteroidHeroSpriteKey } from '@/core/spriteKeys';

/**
 * Hero for the Asteroid Field game mode.
 *
 * Differs from `Hero` (Alien Shoot's auto-side-to-side runner):
 *  - Sits FIXED at the playfield center (no movement input)
 *  - ROTATES to face an aim target (driven externally via `setAimAngle`)
 *  - Fires in the facing direction (caller spawns the projectile with
 *    the current facing angle)
 *
 * **Visual: Midjourney-generated ship sprite** (sprint 2.1 playtest
 * iteration). Three variants picked round-robin per round via
 * `pickNextAsteroidHeroSpriteKey`. Procedural triangle ship was
 * shipped in the initial sprint 2.1 build; user feedback ("we are
 * going to need different heros for asteroids... it doesn't look
 * right") drove the swap to AI-art ships. The hand-painted cockpit
 * dot + engine-vent particle trail are preserved on top of the
 * sprite as visual-signature overlays.
 *
 * **Source-art orientation**: the 3 asteroid-hero PNGs face NORTH
 * (blaster pointing up). The Asteroid Field aim convention is
 * `aimAngle = 0 → facing east (right)`. To bridge: the sprite is
 * rendered with a +π/2 rotation offset baked into the container
 * rotation in `applyFacing` — so source-up matches aim-east at
 * baseline, and rotating the container by `aimAngle` aligns the
 * ship nose with the aim direction. (A future sprite regen with
 * the art facing east would let us drop the offset; the offset
 * means the source art doesn't have to follow the engine's
 * facing convention.)
 *
 * Sprint 2.1 design call: hero is STATIC in Asteroid Field. The mode
 * is "you stand still and shoot floating things" — adding hero
 * translation would mean a twin-stick scheme that complicates the
 * mobile input model. If a future sprint wants a moving hero, the
 * input layer can pipe a translation vector into a new public setter.
 */
export class AsteroidHero extends Phaser.GameObjects.Container {
  /**
   * Display dimensions in design pixels. AI-art ships render at
   * 80×80 — bigger than the procedural triangle predecessor (64×52)
   * because the detailed art deserves the focal-point real estate.
   * Square aspect keeps the orientation-rotation math simple (no
   * need to compensate for non-square scale-rotation interaction).
   */
  static readonly WIDTH = 80;
  static readonly HEIGHT = 80;

  /**
   * AI-art ship sprite. Source faces NORTH; rendered with a +π/2
   * baseline rotation in `applyFacing` so it aligns with the aim
   * convention (east-facing at aimAngle = 0).
   */
  private readonly sprite: Phaser.GameObjects.Sprite;
  /**
   * White cockpit dot overlay — sprint 2.1 visual signature element
   * carried over from the original triangle ship at user request
   * ("we still want the white cockpit dot and engine vent effects").
   * Drawn as a small Graphics circle near the nose of the sprite.
   * Rotates with the container so it stays anchored to the visual
   * "front" of the ship regardless of aim angle.
   */
  private readonly cockpitGraphics: Phaser.GameObjects.Graphics;
  /**
   * Engine glow emitter. Follows the hero in world space (NOT a
   * container child) so particles stay where emitted as the hero
   * rotates — when the ship spins, you see a trail of past particles
   * behind it like a comet tail.
   */
  private readonly engineEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  /**
   * Current aim angle in radians. 0 = facing right (Phaser standard).
   * Set externally via `setAimAngle`. The sprite is drawn facing NORTH
   * in the source art; `applyFacing` adds π/2 to bridge to the
   * east-facing aim convention.
   */
  private aimAngle = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);

    // Ship sprite (AI-art, picked round-robin). Scaled to fit the
    // Hero.WIDTH × Hero.HEIGHT bounding box. Native source is
    // 192×192 (per the hero sprite pipeline profile).
    const heroKey = pickNextAsteroidHeroSpriteKey();
    this.sprite = scene.add.sprite(0, 0, heroKey);
    const nativeSize = this.sprite.width;
    this.sprite.setScale(AsteroidHero.WIDTH / nativeSize);
    this.add(this.sprite);

    // Cockpit dot overlay — small white circle near the nose with a
    // darker outline. Sized to read clearly at 80×80 ship dimensions
    // without competing with sprite details. Position is in container-
    // local coords; rotates with the container so it stays anchored to
    // the visual front of the ship.
    this.cockpitGraphics = scene.add.graphics();
    this.drawCockpitDot();
    this.add(this.cockpitGraphics);

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
   * Draw the white cockpit dot overlay. Called once at construction;
   * the container's rotation handles re-orientation each frame so the
   * Graphics doesn't need to be re-drawn.
   *
   * Position math: the source sprite faces NORTH, so the nose is at
   * the TOP of the sprite (y = -halfH). With the +π/2 baseline
   * rotation in `applyFacing`, "north of the sprite" becomes "east of
   * the container" — which means the cockpit dot should sit at
   * (+something, 0) in container-local coords for the rotation to
   * carry it to the right visual position. Specifically: the dot
   * sits ~25% forward from center on the east axis (= toward the
   * sprite's painted nose after the baseline rotation).
   */
  private drawCockpitDot(): void {
    const COCKPIT = 0xffffff;
    const COCKPIT_OUTLINE = 0x1a1a2e; // dark blue-grey for contrast on light + dark ships
    const radius = 5;
    // 25% forward of center along the east axis. The container rotation
    // (incl. the +π/2 baseline offset) carries this to the right
    // visual position on the rotated sprite.
    const forwardOffset = AsteroidHero.WIDTH * 0.25;
    this.cockpitGraphics.fillStyle(COCKPIT, 1);
    this.cockpitGraphics.fillCircle(forwardOffset, 0, radius);
    this.cockpitGraphics.lineStyle(1.5, COCKPIT_OUTLINE, 0.9);
    this.cockpitGraphics.strokeCircle(forwardOffset, 0, radius);
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
   * Apply the current `aimAngle` to the container rotation + the
   * engine-glow emitter follow-offset (so the trail spawns BEHIND the
   * ship's current facing). Called whenever aimAngle changes.
   *
   * Geometry: aimAngle = 0 means "facing right." The sprite source
   * art faces NORTH (up). Phaser rotation = π/2 rotates clockwise by
   * 90° (so north → east). We rotate the container by `aimAngle +
   * π/2` so:
   *   - aimAngle = 0     → container rot = π/2  → sprite renders east ✓
   *   - aimAngle = π/2   → container rot = π    → sprite renders south
   *   - aimAngle = -π/2  → container rot = 0    → sprite renders north
   *   - aimAngle = π     → container rot = 3π/2 → sprite renders west
   *
   * The cockpit dot drawn at (+forwardOffset, 0) in container-local
   * coords rotates along with the container, so it stays anchored to
   * the visual "front" of the rotated sprite. (Forward = east in
   * container coords = the sprite's painted nose after the +π/2
   * baseline rotation.)
   *
   * Engine trail: rather than dynamically changing the emitter's
   * particle angle (Phaser 3's runtime API for that is awkward —
   * particleAngle is an EmitterOp, not a simple setter), we move the
   * EMITTER POSITION to a point behind the ship via `followOffset`.
   * The particles spawn at that offset position and drift in the
   * emitter's configured direction (downward). The visual effect is
   * "particles appear behind the ship and stream away" which reads
   * as a trail. The "behind" direction is computed from the
   * aim angle (not the container rotation, since followOffset is in
   * WORLD coords, not container-rotated coords).
   *
   * Offset distance is a half-hero-length behind the facing direction.
   */
  private applyFacing(): void {
    // +π/2 baseline offset bridges the source-art "north-facing"
    // convention to the engine "east-facing at aimAngle = 0" convention.
    this.rotation = this.aimAngle + Math.PI / 2;
    const trailOffset = AsteroidHero.WIDTH * 0.4;
    const behindDx = -Math.cos(this.aimAngle) * trailOffset;
    const behindDy = -Math.sin(this.aimAngle) * trailOffset;
    this.engineEmitter.followOffset.set(behindDx, behindDy);
  }
}
