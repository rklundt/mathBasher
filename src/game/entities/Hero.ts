// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { pickRandomHeroSpriteKey, ParticleSpriteKeys } from '@/core/spriteKeys';

/**
 * The auto-running hero at the bottom of the play area.
 *
 * Movement: bounces between `leftBound` and `rightBound` at the constant speed
 * from `config.hero.runSpeedPxPerSec`. The player's only direct control is
 * fire timing — the hero's position is deterministic given the elapsed time
 * since round start, which keeps gameplay focused on math+timing rather than
 * twin-stick steering.
 *
 * Visuals (sprint 0.7 Story 3): one of three Midjourney-generated speeder
 * sprites, picked randomly per Hero instance via `pickRandomHeroSpriteKey()`.
 * Each new round (i.e. each new GameScene → new Hero) can feature a
 * different ship. Sprite faces RIGHT by default; flipped horizontally via
 * `setFlipX` when moving left so the ship visually faces direction of travel.
 * A subtle amber engine-glow particle emitter follows the hero in world
 * space (NOT a container child — particles need to stay where emitted as
 * the hero moves, leaving a brief glow trail).
 *
 * Animations: `playHitAnim()` is a brief alpha flash; `playDeathAnim(onDone)`
 * is a short drop+shake + smoke burst then calls back. Both are kid-friendly:
 * short (~400ms), informative-not-punishing.
 */
export class Hero extends Phaser.GameObjects.Container {
  /** Display dimensions in design pixels. Sprite native is 192×108 (16:9). */
  static readonly WIDTH = 96;
  static readonly HEIGHT = 54;

  private readonly sprite: Phaser.GameObjects.Sprite;
  /**
   * Engine-glow emitter. Lives at scene level (NOT a container child) so
   * particles stay in world space when emitted — as the hero moves, the
   * older particles stay put and form a brief glow trail behind the ship.
   * `startFollow(this, ...)` keeps the emit point glued to the hero.
   */
  private readonly engineEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
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

    // Pick a random ship from the 3 speeders. Each Hero instance gets its
    // own random pick at construction — a new GameScene = new round =
    // potentially different ship.
    const heroKey = pickRandomHeroSpriteKey();
    this.sprite = scene.add.sprite(0, 0, heroKey);
    // Scale from native 192-wide to display 96-wide (factor 0.5). Preserves
    // 16:9 aspect (height auto-scales to 54).
    this.sprite.setScale(Hero.WIDTH / 192);
    this.add(this.sprite);

    // Engine glow: small amber circles emitting from just below the hero,
    // drifting downward. `startFollow` glues the emit point to the hero
    // but particles themselves stay in world space — moving creates a trail.
    this.engineEmitter = scene.add.particles(0, 0, ParticleSpriteKeys.Circle03, {
      speed: { min: 20, max: 50 },
      angle: { min: 80, max: 100 }, // mostly straight down
      scale: { start: 0.25, end: 0 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 350,
      frequency: 60, // emit every 60ms — subtle, not a fire hose
      tint: 0xfacc15, // amber, matches the prior placeholder color
      blendMode: 'ADD', // additive so it reads as a glow, not a solid blob
    });
    this.engineEmitter.startFollow(this, 0, Hero.HEIGHT / 2 - 4);
    // Render the emitter BEHIND the hero (it's an effect plate, not the focal
    // point). Setting a negative depth puts it below the default-depth hero.
    this.engineEmitter.setDepth(-1);

    this.setSize(Hero.WIDTH, Hero.HEIGHT);
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
      this.sprite.setFlipX(true); // mirror to face left
    } else if (this.x < this.leftBound) {
      this.x = this.leftBound;
      this.direction = 1;
      this.sprite.setFlipX(false); // back to facing right
    }
  }

  /** Brief alpha flash when something interesting happens (hit confirmation). */
  playHitAnim(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: { from: 0.4, to: 1 },
      duration: 120,
      ease: 'Quad.Out',
    });
  }

  /**
   * Death animation — short downward drop + shake + smoke burst + fade.
   * Calls `onComplete` when done. Kept under ~400ms so kids don't lose
   * patience.
   */
  playDeathAnim(onComplete: () => void): void {
    this.dead = true;

    // Stop engine glow during death so the emitter doesn't keep firing
    // while the hero is "destroyed." Resumes after the death anim's
    // reset (the Hero is reused across questions; we don't actually
    // destroy the object).
    this.engineEmitter.stop();

    // Smoke burst — emitter at the hero's world position, one-shot explode
    // of ~8 particles, auto-destroys after 500ms (covers full lifespan).
    const smoke = this.scene.add.particles(this.x, this.y, ParticleSpriteKeys.Smoke05, {
      speed: { min: 40, max: 100 },
      scale: { start: 0.4, end: 0.1 },
      alpha: { start: 0.7, end: 0 },
      lifespan: 400,
      tint: 0xcccccc, // light grey smoke
      emitting: false, // burst only via explode() below; no continuous emit
    });
    smoke.explode(8);
    this.scene.time.delayedCall(500, () => smoke.destroy());

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
        this.engineEmitter.start(); // engine glow resumes
        onComplete();
      },
    });
  }

  /**
   * Tear down the hero entirely. Stops + destroys the engine emitter to
   * prevent orphaned particle systems from leaking when the scene ends.
   * Called when GameScene shuts down.
   */
  destroy(fromScene?: boolean): void {
    this.engineEmitter.stop();
    this.engineEmitter.destroy();
    super.destroy(fromScene);
  }
}
