// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config } from '@/core/config';
import { Asteroid } from '@/game/entities/Asteroid';
import { defaultRng } from '@/math/rng';
import type { Question } from '@/math/types';
import { Settings } from '@/services/Settings';
import { computeOrbitParams, pointOnEllipse, type OrbitParams } from '@/game/systems/orbitMath';

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
  /**
   * Per-wave elliptical-orbit geometry — center, semi-axes, angular
   * speed. Computed in `spawnWave` via `computeOrbitParams` (the pure
   * helper in `orbitMath.ts`) so the formula lives in exactly one
   * unit-tested place. Null between waves and while non-orbit modes
   * are active; orbit-mode code paths assert non-null.
   *
   * The ellipse is sized so a) each semi-axis is the distance from
   * orbit center to the nearest playfield edge minus the asteroid's
   * display radius (no boundary crossing), and b) angular speed is
   * `driftPxPerSec / semiMajor` so peak linear speed matches the
   * current speed setting's drift (sprint 2.1 retest #3 — fixed
   * angular speed × elliptical radii made orbit asteroids fly past
   * the playfield 5-10× faster than straight/bounce).
   *
   * `orbitThetas` tracks the current orbital angle per asteroid,
   * keyed by asteroid reference. Each asteroid updates its position
   * each frame via `pointOnEllipse(orbitParams, theta)`. Random
   * initial θ per asteroid gives visual variety; all share the same
   * ellipse + angular speed so they stay evenly spread.
   */
  private orbitParams: OrbitParams | null = null;
  private orbitThetas: Map<Asteroid, number> = new Map();

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

    // Sprint 2.1 wrap-up — geometry delegated to `computeOrbitParams`
    // (pure, unit-tested helper in `orbitMath.ts`). Centralizes the
    // "orbit center = playfield middle; semi-axes = half-playfield
    // minus asteroid radius; angular speed = drift / semi-major"
    // contract so the math has one source of truth + isolated tests.
    const asteroidRadius = config.asteroidField.asteroidRadiusPx;
    const playfieldWidth = this.opts.rightBound - this.opts.leftBound;
    const playfieldHeight = this.opts.bottomBound - this.opts.topBound;
    this.orbitParams = computeOrbitParams(this.opts, this.opts.driftPxPerSec, asteroidRadius);
    this.orbitThetas.clear();

    // Spawn asteroids — orbit mode and straight/bounce modes use
    // different placement strategies.
    const minDist = config.asteroidField.minSpawnDistancePx;
    const minDistSq = minDist * minDist;
    const inset = config.asteroidField.asteroidRadiusPx + 16; // keep fully on-screen
    const spawnedPositions: Array<{ x: number; y: number }> = [];
    // Orbit mode: place asteroids directly on the ellipse with evenly-
    // spaced theta values + small random jitter. Guarantees they're on
    // the orbit path from frame 0 (no transient "snap to orbit" motion)
    // and visually spread around the playfield.
    const thetaStep = (Math.PI * 2) / question.choices.length;
    const thetaJitter = thetaStep * 0.3; // ±30% of even-spacing step
    const thetaBase = rng() * Math.PI * 2; // random starting rotation for the whole wave

    for (let i = 0; i < question.choices.length; i++) {
      const candidateAnswer = question.choices[i];
      if (candidateAnswer === undefined) {
        // Generator contract guarantees `choices.length === asteroidsPerWave`,
        // so this branch is defensive — but a silent default to 0 (a
        // legal answer in add-to-10) would mask a real bug as a
        // wrong-answer asteroid the player can never hit. Log a Warning
        // and skip the slot instead.
        _th.logToAi('AsteroidWaveSystem.missingChoice', SeverityLevel.Warning, {
          reason: `choices[${String(i)}] undefined; expected length ${String(question.choices.length)}`,
        });
        continue;
      }
      const answer = candidateAnswer;
      let x = 0;
      let y = 0;
      // Compute the orbit theta ONCE per asteroid (used for both initial
      // position AND stashed in `orbitThetas` for per-frame advancement).
      // Each call to rng() consumes a different value, so computing the
      // jitter twice would yield different thetas — initial position
      // wouldn't match the stored theta and the asteroid would jump on
      // the first frame.
      let orbitTheta = 0;

      if (this.currentMode === 'orbit') {
        // Spawn directly on the ellipse at the i'th evenly-spaced theta
        // + small random offset for visual variety. No rejection
        // sampling needed because the even spacing already guarantees
        // they're spread apart — skip the min-distance bookkeeping
        // (pre-fix, the `spawnedPositions.push` ran for orbit too but
        // was never read, since the `tries`/rejection loop only runs
        // for straight/bounce).
        orbitTheta = thetaBase + i * thetaStep + (rng() * 2 - 1) * thetaJitter;
        const pt = pointOnEllipse(this.orbitParams!, orbitTheta);
        x = pt.x;
        y = pt.y;
        // (theta is assigned to the asteroid after construction below.)
      } else {
        // Straight + bounce: uniform random with min-distance rejection.
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
      }

      // Initial velocity: random direction at the configured drift
      // speed FOR STRAIGHT/BOUNCE MODES. For ORBIT MODE, velocity is
      // zero — the orbit motion comes entirely from the per-asteroid
      // theta increment in `applyPhysicsMode` (sprint 2.1 retest #2
      // fix; retest #3 elaborated to elliptical orbit).
      let vx: number;
      let vy: number;
      if (this.currentMode === 'orbit') {
        vx = 0;
        vy = 0;
      } else {
        const angle = rng() * Math.PI * 2;
        vx = Math.cos(angle) * this.opts.driftPxPerSec;
        vy = Math.sin(angle) * this.opts.driftPxPerSec;
      }

      // Sprint 2.4 story 5 — pass the fraction display string parallel to
      // the numeric answer when the generator provides one (fractions).
      // Integer generators leave choiceDisplays undefined; bare-number
      // render kicks in.
      const answerDisplay = question.choiceDisplays?.[i];
      const asteroid = new Asteroid({
        scene: this.opts.scene,
        x,
        y,
        answer,
        answerDisplay,
        vx,
        vy,
        rng,
        // Sprint 2.1 playtest — image-variant toggle. Read fresh from
        // Settings PER WAVE (not per round) so flipping the toggle
        // mid-round shows the new look on the next question's wave
        // without having to start a new round.
        useImageVariant: Settings.getImageAsteroidsEnabled(),
      });
      this.asteroids.push(asteroid);

      // For orbit mode, stash the asteroid's initial theta so the
      // per-frame update can advance it. Reuses the SAME `orbitTheta`
      // computed above for the initial position, so the asteroid's
      // stored angle exactly matches where it spawned.
      if (this.currentMode === 'orbit') {
        this.orbitThetas.set(asteroid, orbitTheta);
      }
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
        // Orbit (elliptical): advance the asteroid's stored theta by
        // `angularSpeedRadPerMs × dt` and recompute its position via
        // `pointOnEllipse` (the pure ellipse-parametric helper in
        // `orbitMath.ts`). One source of truth for the geometry —
        // spawn placement uses the same helper.
        //
        // Velocity is intentionally zero in orbit mode (set in
        // spawnWave) — the theta-advance IS the motion. `a.advance(dt)`
        // still runs after this in update(), but with vx,vy = 0 it's
        // a no-op.
        //
        // History: sprint 2.1 retest #2 fixed a prior spiral bug
        // (the original rotated BOTH position and velocity); retest
        // #3 swapped circular rotation for the elliptical formula so
        // semi-axes could differ (more on-screen presence on the
        // wider horizontal axis).
        //
        // `orbitParams!` is non-null here because this case body
        // only runs when currentMode === 'orbit', which spawnWave
        // gated the `computeOrbitParams` call on.
        const params = this.orbitParams!;
        let theta = this.orbitThetas.get(a) ?? 0;
        theta += params.angularSpeedRadPerMs * dt;
        this.orbitThetas.set(a, theta);
        const pt = pointOnEllipse(params, theta);
        a.x = pt.x;
        a.y = pt.y;
        break;
      }
    }
  }

  /**
   * Push a new image-variant flag to every LIVE asteroid in the
   * current wave. Called by AsteroidFieldScene when the user toggles
   * the in-game Settings → Game → Asteroid Images switch, so the
   * change is visible immediately rather than waiting for the next
   * wave spawn. Idempotent — `Asteroid.setUseImageVariant` no-ops
   * when already in the requested mode.
   */
  applyVisualMode(useImageVariant: boolean): void {
    for (const a of this.asteroids) {
      if (a.isDestroyed()) continue;
      a.setUseImageVariant(useImageVariant);
    }
  }

  /**
   * Wrong-shot bookkeeping. Called by the scene when the player hits an
   * incorrect asteroid. Two effects:
   *   1. Increments the wrong-shot count → triggers ScoreCalculator's
   *      `usedWrongShot` flag (halves points awarded for the eventual
   *      correct answer on this question).
   *   2. Subtracts `wrongShotCountdownPenaltySec` from the remaining
   *      countdown (sprint 2.1 wrap-up addition — pure score halving
   *      wasn't enough of a wrong-shot consequence; time pressure
   *      makes the mistake bite). If the penalty would push the
   *      countdown below 0, it's clamped at 0 — the next `update(dt)`
   *      will then return 'timeout' and the wave ends.
   */
  applyWrongShotPenalty(): void {
    this.wrongShotsThisWave += 1;
    const penaltyMs = config.asteroidField.wrongShotCountdownPenaltySec * 1000;
    this.countdownRemainingMs = Math.max(0, this.countdownRemainingMs - penaltyMs);
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
