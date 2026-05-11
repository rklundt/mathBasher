// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { advanceY } from '@/game/systems/waveKinematics';
import { FONT_FAMILY, TEXT_WHITE } from '@/game/ui/typography';
import { alienAnimKey } from '@/core/spriteKeys';

export interface AlienOpts {
  scene: Phaser.Scene;
  x: number;
  y: number;
  /** 0-indexed lane this alien occupies. Stored so HitSystem can match shots. */
  lane: number;
  /** The answer this alien carries — displayed as text on its body. */
  answer: number;
  /** Initial descent speed in pixels per second. WaveSystem can change it. */
  descentSpeedPxPerSec: number;
  /**
   * Optional sprite key (one of `ALIEN_SPRITE_KEYS`) to layer ABOVE the
   * chassis as an animated "rider" — gives the falling block a creature
   * on top of it. Plays the corresponding looping idle animation. Omit
   * for plain-rectangle behavior (legacy / fallback). Sprint 0.6.3
   * introduces this; sprint 0.7's curation pass will pick a smaller pool
   * for the production keepers.
   */
  spriteKey?: string;
}

/**
 * One descending alien carrying an answer. Four of these spawn per question
 * (one per lane); WaveSystem owns descent speed for all live aliens so the
 * wrong-shot penalty can boost them as a group.
 *
 * Visuals: a placeholder rounded-corner panel (~80x60) with the answer rendered
 * as large centered text. Real Kenney sprites land in the art-polish milestone.
 */
export class Alien extends Phaser.GameObjects.Container {
  static readonly WIDTH = 80;
  static readonly HEIGHT = 60;

  /**
   * Display size of the optional rider-sprite in design pixels (square).
   * Smaller than the chassis so the number text below stays the focal
   * point. The sprite scales DOWN from its native source (128 or 192 per
   * tier) — both tiers downscale cleanly to this size on every viewport.
   */
  static readonly SPRITE_SIZE = 64;

  /**
   * Vertical gap between the BOTTOM of the rider-sprite and the TOP of
   * the chassis. Small positive value so the sprite visually "sits on"
   * the block instead of overlapping it.
   */
  static readonly SPRITE_CHASSIS_GAP = 2;

  readonly lane: number;
  readonly answer: number;
  private descentSpeed: number;
  private destroyed = false;
  private readonly chassis: Phaser.GameObjects.Rectangle;
  private readonly answerText: Phaser.GameObjects.Text;

  /**
   * Optional animated rider-sprite layered ABOVE the chassis (negative y
   * offset within the container). Hit detection in `HitSystem` uses the
   * chassis bounds only — the rider is decorative. Null when no
   * `spriteKey` was passed in opts.
   */
  private readonly riderSprite: Phaser.GameObjects.Sprite | null;

  /**
   * X coordinate captured at construction. The jiggle phase oscillates the
   * container's `x` around this value — once jiggle ends, `x` snaps back
   * to `spawnX` so the descent path stays vertically aligned with the lane.
   */
  private readonly spawnX: number;

  /**
   * Pre-fall jiggle state. While `jiggleRemainingMs > 0`, `advance(dt)`
   * oscillates `x` around `spawnX` and skips descent. WaveSystem calls
   * `setJigglePhase()` immediately after constructing the alien.
   *
   * Pause integration is automatic: WaveSystem's pause early-returns from
   * its own `update(dt)` before calling `advance(dt)`, so jiggle elapsed
   * time naturally freezes during pause and resumes from where it left off.
   */
  private jiggleRemainingMs = 0;
  private jiggleElapsedMs = 0;
  private jiggleAmplitudePx = 0;

  constructor(opts: AlienOpts) {
    super(opts.scene, opts.x, opts.y);
    opts.scene.add.existing(this);

    this.lane = opts.lane;
    this.answer = opts.answer;
    this.descentSpeed = opts.descentSpeedPxPerSec;
    this.spawnX = opts.x;

    this.chassis = opts.scene.add.rectangle(0, 0, Alien.WIDTH, Alien.HEIGHT, 0x4338ca);
    this.chassis.setStrokeStyle(2, 0x6366f1);

    this.answerText = opts.scene.add.text(0, 0, String(opts.answer), {
      fontFamily: FONT_FAMILY,
      fontSize: '32px',
      color: TEXT_WHITE,
      fontStyle: 'bold',
    });
    this.answerText.setOrigin(0.5);

    // Build the rider-sprite if a key was passed. Positioned ABOVE the
    // chassis so the number stays unobstructed; scaled to SPRITE_SIZE
    // (downscale from the 128 or 192 native source — both look crisp at
    // this display size on every viewport per ADR-0010 D3).
    if (opts.spriteKey) {
      const sprite = opts.scene.add.sprite(0, 0, opts.spriteKey);
      // `frameWidth` from the loader is the native tier (128 or 192).
      const nativeSize = sprite.width;
      sprite.setScale(Alien.SPRITE_SIZE / nativeSize);
      sprite.setOrigin(0.5, 1); // bottom-center → easy to align ABOVE chassis
      sprite.y = -Alien.HEIGHT / 2 - Alien.SPRITE_CHASSIS_GAP;
      sprite.play(alienAnimKey(opts.spriteKey));
      this.riderSprite = sprite;
      // Z-order: chassis (back) → riderSprite (middle) → answerText (front).
      // answerText must stay on top so the number is always readable even
      // if a sprite happens to extend down into the chassis area.
      this.add([this.chassis, sprite, this.answerText]);
    } else {
      this.riderSprite = null;
      this.add([this.chassis, this.answerText]);
    }
    this.setSize(Alien.WIDTH, Alien.HEIGHT);
  }

  /**
   * Per-frame descent. WaveSystem calls this for every live alien.
   * Pause is handled at the WaveSystem layer (its `update(dt)` early-returns
   * when paused), so this method can stay unconditional.
   *
   * If a pre-fall jiggle is active (`jiggleRemainingMs > 0`), this method
   * oscillates `x` around `spawnX` instead of descending. When the jiggle
   * window closes, `x` snaps back to `spawnX` and descent begins on the
   * same frame — no discontinuity at the handoff.
   */
  advance(dt: number): void {
    if (this.destroyed) return;
    if (this.jiggleRemainingMs > 0) {
      this.jiggleRemainingMs -= dt;
      this.jiggleElapsedMs += dt;
      if (this.jiggleRemainingMs <= 0) {
        // Jiggle complete — snap back to lane center; descent starts next frame.
        this.x = this.spawnX;
        this.jiggleRemainingMs = 0;
        return;
      }
      // Sine oscillation at ~3 Hz (3 wiggles per second). Frequency is local
      // to this method — the visual is not load-bearing enough to lift to config.
      const omega = 2 * Math.PI * 3;
      this.x = this.spawnX + Math.sin((this.jiggleElapsedMs / 1000) * omega) * this.jiggleAmplitudePx;
      return;
    }
    this.y = advanceY(this.y, dt, this.descentSpeed);
  }

  /**
   * Start a pre-fall jiggle. WaveSystem calls this immediately after
   * constructing each alien in a new wave. Duration is in milliseconds
   * (matching the dt unit used everywhere else in the game loop); amplitude
   * is the peak left/right offset in design pixels.
   */
  setJigglePhase(durationMs: number, amplitudePx: number): void {
    this.jiggleRemainingMs = durationMs;
    this.jiggleElapsedMs = 0;
    this.jiggleAmplitudePx = amplitudePx;
  }

  /** True while the alien is in its pre-fall jiggle phase (not yet descending). */
  isJiggling(): boolean {
    return this.jiggleRemainingMs > 0;
  }

  /** Change descent speed mid-flight (used for the wrong-shot speed penalty). */
  setDescentSpeed(speed: number): void {
    this.descentSpeed = speed;
  }

  /** Y-coordinate of the alien's BOTTOM edge. Used to detect "reached hero". */
  bottomY(): number {
    return this.y + Alien.HEIGHT / 2;
  }

  /**
   * Explode animation. Tints the chassis green (correct) or red (wrong),
   * scales up + fades out, then calls `onComplete`. Short (~250ms) for
   * snappy feedback.
   */
  playExplodeAnim(correct: boolean, onComplete: () => void): void {
    if (this.destroyed) {
      onComplete();
      return;
    }
    this.destroyed = true;
    this.chassis.setFillStyle(correct ? 0x22c55e : 0xef4444);
    this.chassis.setStrokeStyle(2, correct ? 0x16a34a : 0xb91c1c);
    // Stop the rider's looping idle so the explosion fade isn't competing
    // with a spinning animation. The container fade tween handles the
    // sprite's alpha automatically (it's a child of the container).
    this.riderSprite?.stop();
    this.scene.tweens.add({
      targets: this,
      scale: 1.4,
      alpha: 0,
      duration: 250,
      ease: 'Quad.Out',
      onComplete: () => {
        this.destroy();
        onComplete();
      },
    });
  }

  /** Smooth fade-out for the OTHER aliens in the wave when one is hit. */
  playFadeOut(onComplete?: () => void): void {
    if (this.destroyed) {
      onComplete?.();
      return;
    }
    this.destroyed = true;
    this.riderSprite?.stop();
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 200,
      ease: 'Linear',
      onComplete: () => {
        this.destroy();
        onComplete?.();
      },
    });
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }
}
