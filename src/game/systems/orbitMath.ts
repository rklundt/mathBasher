// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Pure helpers for Asteroid Field's elliptical orbit physics.
 *
 * Extracted from `AsteroidWaveSystem` in sprint 2.1 wrap-up so the
 * geometry — which has been re-tuned three times across the sprint
 * (orbit spiral fix → ellipse pivot → angular-speed-from-drift) —
 * can be exercised by isolated unit tests without spinning up a
 * Phaser scene. The wave system retains the spawn/advance bookkeeping
 * (Phaser-coupled); this module owns just the math.
 *
 * Convention: all angles in radians. All positions / sizes in design
 * pixels. Angular speed in rad/ms (matches Phaser's `update(dt)`
 * delta unit; multiply by dt directly).
 */

export interface PlayfieldBounds {
  leftBound: number;
  rightBound: number;
  topBound: number;
  bottomBound: number;
}

export interface OrbitParams {
  /** Center of the ellipse — the playfield center. */
  centerX: number;
  centerY: number;
  /** X-axis radius (half the playfield width, minus the asteroid radius). */
  semiMajor: number;
  /** Y-axis radius (half the playfield height, minus the asteroid radius). */
  semiMinor: number;
  /**
   * Angular speed in rad/ms, derived so that the asteroid's PEAK linear
   * speed (at the top/bottom of the ellipse, where motion is along the
   * wider axis) matches `driftPxPerSec`. Without this scaling, a fixed
   * angular speed × the elliptical radii produced orbit asteroids that
   * crossed the playfield 5-10× faster than straight/bounce asteroids
   * (sprint 2.1 retest #3 bug).
   *
   * Formula: `driftPxPerSec / semiMajor / 1000`. Divide by 1000 to
   * convert rad/s → rad/ms.
   */
  angularSpeedRadPerMs: number;
}

/**
 * Compute the elliptical orbit parameters for a given playfield + drift
 * speed + asteroid radius. Pure function — no Phaser deps, no IO,
 * deterministic. Inputs flow from `AsteroidWaveOpts` + the asteroid
 * radius config; outputs feed `applyPhysicsMode`'s orbit branch.
 */
export function computeOrbitParams(
  bounds: PlayfieldBounds,
  driftPxPerSec: number,
  asteroidRadiusPx: number,
): OrbitParams {
  const playfieldWidth = bounds.rightBound - bounds.leftBound;
  const playfieldHeight = bounds.bottomBound - bounds.topBound;
  const centerX = (bounds.leftBound + bounds.rightBound) / 2;
  const centerY = (bounds.topBound + bounds.bottomBound) / 2;
  // Inset by the asteroid radius so the orbit never crosses the
  // playfield boundary. `Math.max(1, ...)` defends against degenerate
  // configurations (e.g. playfield too small to fit an asteroid) so the
  // angular-speed division below can't produce Infinity or NaN.
  const semiMajor = Math.max(1, playfieldWidth / 2 - asteroidRadiusPx);
  const semiMinor = Math.max(1, playfieldHeight / 2 - asteroidRadiusPx);
  const angularSpeedRadPerMs = driftPxPerSec / semiMajor / 1000;
  return { centerX, centerY, semiMajor, semiMinor, angularSpeedRadPerMs };
}

/**
 * Compute a position on the ellipse for a given parametric angle.
 * Just the parametric formula — `x = cx + a·cos(θ)`, `y = cy + b·sin(θ)`.
 * Extracted as a named function so call sites (spawn placement,
 * per-frame advance) share the same line of math; a future change
 * to the orbit geometry (e.g. tilt, eccentricity-from-position)
 * happens in exactly one place.
 */
export function pointOnEllipse(params: OrbitParams, thetaRad: number): { x: number; y: number } {
  return {
    x: params.centerX + params.semiMajor * Math.cos(thetaRad),
    y: params.centerY + params.semiMinor * Math.sin(thetaRad),
  };
}
