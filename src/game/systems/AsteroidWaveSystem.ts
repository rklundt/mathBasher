// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { Asteroid } from '@/game/entities/Asteroid';
import { defaultRng } from '@/math/rng';
import type { Question } from '@/math/types';

/**
 * One of the supported per-question asteroid physics modes. The
 * AsteroidWaveSystem picks one of these randomly each question (from
 * `config.asteroidField.enabledPhysicsModes`) and applies the
 * corresponding velocity update per frame:
 *
 *   - "straight" — asteroids drift in straight lines; wrap at the
 *     playfield edges (off the left side → appear on the right, etc.)
 *   - "bounce" — asteroids reflect their velocity at the playfield edges
 *   - "orbit" — asteroids orbit slowly around a random center point on
 *     the playfield (velocity rotated by a constant angular speed each
 *     frame)
 */
export type AsteroidPhysicsMode = 'straight' | 'bounce' | 'orbit';

export interface AsteroidWaveOpts {
  scene: Phaser.Scene;
  /** Playfield bounds (the canvas, minus safe-area padding). */
  leftBound: number;
  rightBound: number;
  topBound: number;
  bottomBound: number;
  /** Drift speed for the current speed setting (px/s). */
  driftPxPerSec: number;
  /** Per-question countdown in seconds (drives the timeout). */
  countdownSec: number;
  /** Optional RNG injection for deterministic tests. */
  rng?: () => number;
}

/**
 * Per-question outcome reported back to the scene by `update(dt)`:
 *   - 'in-progress' — countdown still ticking, no events to report
 *   - 'timeout'     — countdown reached 0; scene should mark the question
 *                     wrong and start the next question
 *
 * Hit events (correct/wrong) are NOT routed through this enum because
 * collisions are detected in AsteroidHitSystem; the scene calls
 * `getCorrectAsteroidAnswer()` to find out what the right answer is and
 * compares against the hit asteroid's answer.
 */
export type AsteroidWaveOutcome = 'in-progress' | 'timeout';

/**
 * Spawns + advances asteroids for the Asteroid Field game mode. Mirrors
 * Alien Shoot's `WaveSystem` in shape (spawnWave, update, clearWave,
 * pause/resume, applyWrongShotPenalty) but with different physics
 * (free 2D drift + per-question mode pick + countdown).
 */
export class AsteroidWaveSystem {
  private asteroids: Asteroid[] = [];
  private correctAnswer = -1;
  private wrongShotsThisWave = 0;
  private paused = false;
  private countdownRemainingMs = 0;
  private currentMode: AsteroidPhysicsMode = 'straight';
  private orbitCenterX = 0;
  private orbitCenterY = 0;
  /** Orbit angular speed in rad/ms (constant; tuned for "feels orbital"). */
  private readonly orbitAngularSpeed = 0.0008;

  constructor(private readonly opts: AsteroidWaveOpts) {}

  // ----- Pause / resume ----------------------------------------------------

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  // ----- Wave lifecycle ----------------------------------------------------

  /**
   * Spawn 4 asteroids for the given question. Position is uniform-random
   * on the playfield with a minimum spawn-distance constraint (no two
   * asteroids initially within `config.asteroidField.minSpawnDistancePx`).
   * Picks a random physics mode for this wave from the enabled set.
   *
   * Returns the spawned asteroids (the scene uses these for the
   * KeyboardNavigator focus + future hit logging).
   */
  spawnWave(question: Question): Asteroid[] {
    if (this.asteroids.length > 0) {
      this.clearWave(true);
    }
    this.wrongShotsThisWave = 0;
    this.countdownRemainingMs = this.opts.countdownSec * 1000;
    this.correctAnswer = question.correctAnswer;

    const rng = this.opts.rng ?? defaultRng;

    // Pick a physics mode for this wave from the enabled set.
    const modes = config.asteroidField.enabledPhysicsModes;
    this.currentMode = modes[Math.floor(rng() * modes.length)] as AsteroidPhysicsMode;

    // Orbit-mode picks a random center somewhere in the inner playfield.
    // 20% inset from each edge so asteroids don't immediately orbit out
    // of the visible region.
    const playfieldWidth = this.opts.rightBound - this.opts.leftBound;
    const playfieldHeight = this.opts.bottomBound - this.opts.topBound;
    this.orbitCenterX = this.opts.leftBound + playfieldWidth * (0.3 + rng() * 0.4);
    this.orbitCenterY = this.opts.topBound + playfieldHeight * (0.3 + rng() * 0.4);

    // Spawn asteroids one at a time with min-distance rejection sampling.
    const minDist = config.asteroidField.minSpawnDistancePx;
    const minDistSq = minDist * minDist;
    const inset = config.asteroidField.asteroidRadiusPx + 16; // keep fully on-screen
    const spawnedPositions: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < question.choices.length; i++) {
      const answer = question.choices[i] ?? 0;
      let x = 0;
      let y = 0;
      // Reject-and-retry until we find a position min-dist from all
      // previously-spawned asteroids. Cap retries to prevent infinite
      // loop if minSpawnDistancePx is too generous for the playfield.
      const MAX_TRIES = 40;
      let tries = 0;
      while (tries < MAX_TRIES) {
        x = this.opts.leftBound + inset + rng() * (playfieldWidth - inset * 2);
        y = this.opts.topBound + inset + rng() * (playfieldHeight - inset * 2);
        const tooClose = spawnedPositions.some((p) => {
          const dx = p.x - x;
          const dy = p.y - y;
          return dx * dx + dy * dy < minDistSq;
        });
        if (!tooClose) break;
        tries += 1;
      }
      spawnedPositions.push({ x, y });

      // Initial velocity: random direction at the configured drift speed.
      const angle = rng() * Math.PI * 2;
      const vx = Math.cos(angle) * this.opts.driftPxPerSec;
      const vy = Math.sin(angle) * this.opts.driftPxPerSec;

      const asteroid = new Asteroid({
        scene: this.opts.scene,
        x,
        y,
        answer,
        vx,
        vy,
        rng,
      });
      this.asteroids.push(asteroid);
    }

    return this.asteroids.slice();
  }

  /**
   * Per-frame advance. Applies the current physics mode's velocity
   * update to every live asteroid, then calls each asteroid's
   * `advance(dt)` for the position step. Ticks down the countdown timer
   * and reports 'timeout' when it hits 0.
   */
  update(dt: number): AsteroidWaveOutcome {
    if (this.paused) return 'in-progress';

    // Countdown
    this.countdownRemainingMs -= dt;
    if (this.countdownRemainingMs <= 0) {
      this.countdownRemainingMs = 0;
      return 'timeout';
    }

    // Physics-mode velocity update
    for (const a of this.asteroids) {
      if (a.isDestroyed()) continue;
      this.applyPhysicsMode(a, dt);
      a.advance(dt);
    }
    return 'in-progress';
  }

  /**
   * Apply the current wave's physics mode to one asteroid's velocity.
   * Pure delta-velocity update; the asteroid's `advance(dt)` then
   * translates by the (possibly updated) velocity.
   */
  private applyPhysicsMode(a: Asteroid, dt: number): void {
    switch (this.currentMode) {
      case 'straight': {
        // Straight: edge-wrap when leaving the playfield. Velocity is
        // unchanged; only position is teleported.
        if (a.x < this.opts.leftBound) a.x = this.opts.rightBound;
        else if (a.x > this.opts.rightBound) a.x = this.opts.leftBound;
        if (a.y < this.opts.topBound) a.y = this.opts.bottomBound;
        else if (a.y > this.opts.bottomBound) a.y = this.opts.topBound;
        break;
      }
      case 'bounce': {
        // Bounce: reflect velocity at the playfield edges.
        if (a.x < this.opts.leftBound || a.x > this.opts.rightBound) {
          a.setVelocity(-a.getVx(), a.getVy());
          a.x = Phaser.Math.Clamp(a.x, this.opts.leftBound, this.opts.rightBound);
        }
        if (a.y < this.opts.topBound || a.y > this.opts.bottomBound) {
          a.setVelocity(a.getVx(), -a.getVy());
          a.y = Phaser.Math.Clamp(a.y, this.opts.topBound, this.opts.bottomBound);
        }
        break;
      }
      case 'orbit': {
        // Orbit: rotate the velocity vector around the orbit center by
        // `orbitAngularSpeed × dt`. This produces a gentle circular
        // motion around the center point.
        const dAngle = this.orbitAngularSpeed * dt;
        const cos = Math.cos(dAngle);
        const sin = Math.sin(dAngle);
        const oldVx = a.getVx();
        const oldVy = a.getVy();
        a.setVelocity(oldVx * cos - oldVy * sin, oldVx * sin + oldVy * cos);
        // Also rotate the asteroid's position around the orbit center
        // so it actually orbits (without this, only the velocity
        // rotates, producing a spiral instead of an orbit).
        const dx = a.x - this.orbitCenterX;
        const dy = a.y - this.orbitCenterY;
        a.x = this.orbitCenterX + dx * cos - dy * sin;
        a.y = this.orbitCenterY + dx * sin + dy * cos;
        break;
      }
    }
  }

  /**
   * Wrong-shot bookkeeping. Called by the scene when the player hits an
   * incorrect asteroid. Currently just increments a counter — Asteroid
   * Field doesn't accelerate the wave on wrong shots (unlike Alien
   * Shoot's descent penalty) because the countdown is the existing time
   * pressure. The flag IS used by ScoreCalculator's `usedWrongShot` to
   * halve points awarded for the eventual correct answer.
   */
  applyWrongShotPenalty(): void {
    this.wrongShotsThisWave += 1;
  }

  /** True if the player has fired at any wrong asteroid in this wave. */
  hasUsedWrongShot(): boolean {
    return this.wrongShotsThisWave > 0;
  }

  /** Returns the correct answer for the in-flight wave. */
  getCorrectAnswer(): number {
    return this.correctAnswer;
  }

  /** Live asteroids (not yet destroyed). Used by AsteroidHitSystem each frame. */
  liveAsteroids(): Asteroid[] {
    return this.asteroids.filter((a) => !a.isDestroyed());
  }

  /** All asteroids in the current wave (live + destroyed). */
  allAsteroids(): Asteroid[] {
    return this.asteroids.slice();
  }

  /** Countdown remaining in seconds, for the HUD timer. */
  getCountdownSec(): number {
    return Math.max(0, this.countdownRemainingMs / 1000);
  }

  /** Fraction of countdown remaining (0..1), for the timer ring. */
  getCountdownFraction(): number {
    const total = this.opts.countdownSec * 1000;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, this.countdownRemainingMs / total));
  }

  /** Current physics mode (for telemetry / debug). */
  getCurrentMode(): AsteroidPhysicsMode {
    return this.currentMode;
  }

  /**
   * Tear down the wave. `instant=true` snaps asteroids away (used at
   * scene exit or right before spawning a fresh wave); otherwise the
   * caller is expected to have already played fade/explode animations.
   */
  clearWave(instant: boolean): void {
    if (instant) {
      for (const a of this.asteroids) {
        if (!a.isDestroyed()) a.destroy();
      }
    }
    this.asteroids = [];
  }
}
