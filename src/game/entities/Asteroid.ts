// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { textStyle } from '@/game/ui/typography';
import { defaultRng } from '@/math/rng';
import { pickRandomAsteroidSpriteKey } from '@/core/spriteKeys';

/**
 * Asteroid Field — procedural cartoon asteroid carrying one answer number.
 *
 * Visual: irregular polygon (12 vertices around a circle, each with random
 * radial "salt" of ±18%) filled from an asteroid-palette color, with a
 * thick darker-shade outline for the chunky cartoon look. Per-instance
 * size variation (scale 0.85×–1.15×), per-instance random rotation, and
 * per-instance palette pick mean every asteroid looks distinct.
 *
 * **Why procedural for sprint 2.1**: the user direction was "polygon
 * rendering for now; sprint 2.1.5 develops a sheet-extraction pipeline
 * for AI-art asteroids." The procedural version is fully self-contained
 * (no sprite asset dependencies), endlessly varied (every instance is
 * fresh), and gives precise control over the kid-friendly cartoon look
 * (color + border + roughness all knob-tunable here).
 *
 * The answer text sits ON TOP of the asteroid as a fixed-size label (38px
 * Baloo 2 bold, white for high contrast against the warm palette).
 *
 * Drift behavior is the WaveSystem's concern — Asteroid exposes setters
 * for position + velocity + rotation, and `advance(dt)` handles the
 * per-frame transform. Physics modes (straight, bounce, orbit) are
 * external — the wave system updates vx/vy according to mode each frame.
 */

/**
 * Asteroid color palette: warm earthy tones (browns, reds, slate, dark
 * yellows). Each asteroid picks one fill color at random; the border
 * is a darker variant of the fill (fill brightness × 0.4 — see
 * darkerVariant() below for the math).
 */
const ASTEROID_PALETTE = [
  0x7a4a2e, // medium brown
  0xa04428, // brick red
  0xc69642, // dark yellow / mustard
  0x5a4030, // dark brown
  0x8a3a28, // burnt red
  0x6b5440, // taupe
  0x9a6432, // ochre
  0x4a3828, // very dark brown
] as const;

// Tuning constants live in `config.asteroidField.visual.*` (moved out
// of inline literals in sprint 2.1 wrap-up). Read inline below at
// each use site.

export interface AsteroidOpts {
  scene: Phaser.Scene;
  /** Initial x in world coords. */
  x: number;
  /** Initial y in world coords. */
  y: number;
  /** Answer number to render on the asteroid. */
  answer: number;
  /** Initial velocity x (px/s); WaveSystem will mutate via setVelocity per physics mode. */
  vx: number;
  /** Initial velocity y (px/s). */
  vy: number;
  /** Optional RNG injection for deterministic tests. Defaults to Math.random. */
  rng?: () => number;
  /**
   * Sprint 2.1 playtest — render mode toggle.
   * `false` (default) = procedural polygon asteroid (the original
   *                     sprint 2.1 visual).
   * `true`            = Midjourney image-variant rock sprite picked
   *                     at random from `AsteroidSpriteKeys`.
   * AsteroidWaveSystem passes this through from `Settings.getImageAsteroidsEnabled()`
   * at spawn time, so a wave reflects whatever the toggle is when the
   * question begins (mid-wave toggles wait until the next spawn).
   */
  useImageVariant?: boolean;
}

export class Asteroid extends Phaser.GameObjects.Container {
  /**
   * Base collision radius (design pixels). The actual collision radius is
   * `BASE_RADIUS × this.scale` since each asteroid has per-instance size
   * variation. Drives the AsteroidHitSystem's circle-circle collision test.
   */
  static readonly BASE_RADIUS = config.asteroidField.asteroidRadiusPx;

  readonly answer: number;
  private vx: number;
  private vy: number;
  private destroyed = false;
  /** Per-instance asteroid scale (in [scaleMin, scaleMax]). */
  private readonly instanceScale: number;
  /**
   * Rendered visual — either a `Graphics` (procedural polygon) or a
   * `Sprite` (image-variant). Held as the base type so animations
   * (`playExplodeAnim`) can target it uniformly. Mutable to support
   * in-place visual swap via `setUseImageVariant` — when the user
   * toggles the Settings → Game → Asteroid Images switch mid-round,
   * AsteroidWaveSystem walks the live asteroids and swaps each one's
   * visual without disturbing position / velocity / answer text.
   */
  private visual: Phaser.GameObjects.GameObject;
  private readonly answerText: Phaser.GameObjects.Text;
  /** Tracks current visual mode so swaps can no-op when already matching. */
  private usingImageVariant: boolean;
  /**
   * RNG stored for re-use during in-place visual swap (`setUseImageVariant`
   * needs to pick palette / rotation / sprite key for the NEW visual,
   * mirroring the constructor's random decisions).
   */
  private readonly rng: () => number;

  constructor(opts: AsteroidOpts) {
    super(opts.scene, opts.x, opts.y);
    opts.scene.add.existing(this);

    this.answer = opts.answer;
    this.vx = opts.vx;
    this.vy = opts.vy;
    this.rng = opts.rng ?? defaultRng;

    // Per-instance variation: scale (applied uniformly to whichever
    // visual variant renders).
    const cfg = config.asteroidField;
    this.instanceScale =
      cfg.asteroidScaleMin + this.rng() * (cfg.asteroidScaleMax - cfg.asteroidScaleMin);

    this.usingImageVariant = opts.useImageVariant === true;
    this.visual = this.buildVisual(this.usingImageVariant);

    // Answer text — white, centered, on top of the asteroid. Uses the
    // existing alienAnswer TextKind for typographic consistency across
    // game modes (the kid sees the same number style whether it's on a
    // falling alien block or a drifting asteroid).
    this.answerText = opts.scene.add.text(0, 0, String(opts.answer), textStyle('alienAnswer'));
    this.answerText.setOrigin(0.5);

    this.add([this.visual, this.answerText]);
    this.setScale(this.instanceScale);
    // Container size is set for downstream consumers that want bounds
    // (KeyboardNavigator focus rings, future tween targets). Diameter at
    // BASE_RADIUS (pre-scale; the container's `scale` does the rest).
    this.setSize(Asteroid.BASE_RADIUS * 2, Asteroid.BASE_RADIUS * 2);
  }

  /**
   * Build the visual GameObject (Graphics polygon OR Sprite) per the
   * variant flag. Extracted from the constructor so `setUseImageVariant`
   * can rebuild on toggle without duplicating the construction logic.
   * Does NOT add to the container — caller is responsible for placement
   * in the container's child list (under the answer text).
   */
  private buildVisual(useImage: boolean): Phaser.GameObjects.GameObject {
    const visualCfg = config.asteroidField.visual;
    if (useImage) {
      // Image variant: random Midjourney rock sprite from the 8-key
      // pool. Rendered larger than the procedural polygon by
      // `visualCfg.imageVisualScale` (1.5× today — the AI rocks have
      // texture detail that benefits from extra screen real estate).
      // Collision radius stays at BASE_RADIUS so gameplay difficulty
      // is unchanged across variants. Per-instance random rotation
      // gives visual variety since source sprites have a "natural top".
      const spriteKey = pickRandomAsteroidSpriteKey(this.rng);
      const sprite = this.scene.add.sprite(0, 0, spriteKey);
      const nativeSize = sprite.width;
      const targetDiameter = Asteroid.BASE_RADIUS * 2 * visualCfg.imageVisualScale;
      sprite.setScale(targetDiameter / nativeSize);
      sprite.setRotation(this.rng() * Math.PI * 2);
      return sprite;
    }
    // Procedural polygon variant (the original sprint 2.1 look).
    const fillColor = ASTEROID_PALETTE[Math.floor(this.rng() * ASTEROID_PALETTE.length)]!;
    const borderColor = darkerVariant(fillColor, visualCfg.borderDarken);
    const visualRotation = this.rng() * Math.PI * 2;

    // Build the irregular polygon: vertexCount vertices around a circle,
    // each at BASE_RADIUS × (1 + rand[-saltAmplitude, +saltAmplitude]).
    // The result is a "bumpy circle" — recognizable as an asteroid
    // silhouette without being chaotic.
    const vertices: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < visualCfg.vertexCount; i++) {
      const angle = (i / visualCfg.vertexCount) * Math.PI * 2 + visualRotation;
      const salt = 1 + (this.rng() * 2 - 1) * visualCfg.saltAmplitude;
      const r = Asteroid.BASE_RADIUS * salt;
      vertices.push(new Phaser.Math.Vector2(Math.cos(angle) * r, Math.sin(angle) * r));
    }
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(visualCfg.borderWidthPx, borderColor, 1);
    graphics.fillStyle(fillColor, 1);
    graphics.beginPath();
    graphics.moveTo(vertices[0]!.x, vertices[0]!.y);
    for (let i = 1; i < vertices.length; i++) {
      graphics.lineTo(vertices[i]!.x, vertices[i]!.y);
    }
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
    return graphics;
  }

  /**
   * Swap the visual representation in place. Called when the user
   * toggles the Settings → Game → Asteroid Images switch mid-round —
   * AsteroidWaveSystem fans the new value out to every live asteroid
   * so the change is visible IMMEDIATELY rather than waiting for the
   * next wave spawn. No-op if already in the requested mode (so a
   * batch refresh from the wave system is idempotent).
   *
   * Preserves: position, velocity, answer, answer-text overlay,
   * collision radius, instance scale, destroyed flag. Re-randomizes:
   * the polygon shape / palette OR the picked sprite key + rotation
   * (intentional — the new visual gets fresh look-randomization since
   * the old visual's random seed bits are gone with it).
   */
  setUseImageVariant(useImage: boolean): void {
    if (this.destroyed) return;
    if (this.usingImageVariant === useImage) return;
    this.usingImageVariant = useImage;
    this.visual.destroy();
    this.visual = this.buildVisual(useImage);
    this.add(this.visual);
    // Answer text must render ABOVE the new visual. `sendToBack` on
    // the visual is equivalent to `bringToTop` on the text; pick one
    // (sendToBack keeps the answer-text child list position stable
    // across visual swaps, which is friendlier to future tween code
    // that targets answerText by index).
    this.sendToBack(this.visual);
  }

  // ----- Per-frame advance --------------------------------------------------

  /**
   * Per-frame position update. `dt` is in milliseconds (Phaser's standard).
   * The asteroid simply translates by its velocity each frame; the
   * WaveSystem is responsible for updating velocity per the current
   * physics mode (straight = constant; bounce = reflect at edges; orbit =
   * rotate the velocity vector around the orbit center).
   */
  advance(dt: number): void {
    if (this.destroyed) return;
    this.x += (this.vx * dt) / 1000;
    this.y += (this.vy * dt) / 1000;
  }

  // ----- Velocity getters/setters (used by physics-mode update) -------------

  getVx(): number {
    return this.vx;
  }
  getVy(): number {
    return this.vy;
  }
  setVelocity(vx: number, vy: number): void {
    this.vx = vx;
    this.vy = vy;
  }

  /**
   * Effective collision radius (with per-instance scale applied). Used
   * by AsteroidHitSystem for the circle-circle intersection test against
   * the projectile.
   */
  getCollisionRadius(): number {
    return Asteroid.BASE_RADIUS * this.instanceScale;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  // ----- Hit/wrong/fade animations ------------------------------------------

  /**
   * Explode animation — tints the asteroid green (correct) or red (wrong)
   * via a graphics overlay, scales up, fades out, then calls onComplete.
   * Mirrors `Alien.playExplodeAnim` in feel so the player gets
   * consistent feedback across game modes.
   */
  playExplodeAnim(correct: boolean, onComplete: () => void): void {
    if (this.destroyed) {
      onComplete();
      return;
    }
    this.destroyed = true;
    // Draw a colored overlay at full alpha and let the container fade.
    // Simpler than rebuilding the polygon with a different fill.
    //
    // Sprint 2.1 wrap-up — overlay diameter must match the visual
    // diameter, which differs by variant: procedural polygons render
    // at BASE_RADIUS; image rocks render at BASE_RADIUS × imageVisualScale.
    // The pre-fix overlay was hard-coded to BASE_RADIUS, leaving image
    // rocks tinted in a "bullseye" pattern (only the inner ~67%
    // covered). Scaling by the same factor used in `buildVisual` keeps
    // the overlay edge-aligned with the rendered asteroid.
    const overlayRadius = this.usingImageVariant
      ? Asteroid.BASE_RADIUS * config.asteroidField.visual.imageVisualScale
      : Asteroid.BASE_RADIUS;
    const overlay = this.scene.add.circle(0, 0, overlayRadius, correct ? 0x22c55e : 0xef4444, 0.6);
    this.add(overlay);
    this.scene.tweens.add({
      targets: this,
      scaleX: this.instanceScale * 1.4,
      scaleY: this.instanceScale * 1.4,
      alpha: 0,
      duration: 250,
      ease: 'Quad.Out',
      onComplete: () => {
        this.destroy();
        onComplete();
      },
    });
  }

  /** Smooth fade-out for the OTHER asteroids when one is correctly hit. */
  playFadeOut(onComplete?: () => void): void {
    if (this.destroyed) {
      onComplete?.();
      return;
    }
    this.destroyed = true;
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 250,
      ease: 'Quad.Out',
      onComplete: () => {
        this.destroy();
        onComplete?.();
      },
    });
  }
}

/**
 * Derive a darker shade of a hex color by multiplying each RGB channel
 * by `factor` (0..1; lower = darker). Used to compute the asteroid's
 * border color from its fill color so the border always reads as "this
 * color but darker" regardless of which palette entry was picked.
 */
function darkerVariant(hex: number, factor: number): number {
  const r = Math.floor(((hex >> 16) & 0xff) * factor);
  const g = Math.floor(((hex >> 8) & 0xff) * factor);
  const b = Math.floor((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
