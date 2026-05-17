// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import {
  computeOrbitParams,
  pointOnEllipse,
  type PlayfieldBounds,
} from '@/game/systems/orbitMath';

/**
 * Tests for the pure orbit-math helpers extracted from
 * `AsteroidWaveSystem` in sprint 2.1 wrap-up. The geometry was re-tuned
 * three times across the sprint (orbit spiral → ellipse pivot →
 * angular-speed-from-drift); these tests exist to catch a regression
 * in any of those three pivots without requiring a Phaser scene to
 * run.
 */

const bounds1280x720: PlayfieldBounds = {
  leftBound: 24,
  rightBound: 1256,
  topBound: 64,
  bottomBound: 660,
};

describe('computeOrbitParams', () => {
  it('places the orbit center at the playfield midpoint', () => {
    const p = computeOrbitParams(bounds1280x720, 50, 38);
    expect(p.centerX).toBe((24 + 1256) / 2);
    expect(p.centerY).toBe((64 + 660) / 2);
  });

  it('insets semi-major/semi-minor by the asteroid radius', () => {
    const p = computeOrbitParams(bounds1280x720, 50, 38);
    // playfieldWidth = 1232, half = 616, minus 38 = 578
    expect(p.semiMajor).toBe(1232 / 2 - 38);
    // playfieldHeight = 596, half = 298, minus 38 = 260
    expect(p.semiMinor).toBe(596 / 2 - 38);
  });

  it('derives angular speed so peak linear speed matches driftPxPerSec', () => {
    // Peak linear speed on the ellipse = ω × semiMajor (reached at
    // top/bottom). We want peakLinear === driftPxPerSec when ω is in
    // rad/s; the helper returns rad/ms so multiply by 1000.
    const p = computeOrbitParams(bounds1280x720, 50, 38);
    const peakLinearPxPerSec = p.angularSpeedRadPerMs * 1000 * p.semiMajor;
    expect(peakLinearPxPerSec).toBeCloseTo(50, 6);
  });

  it('scales angular speed with drift (slow → smaller, fast → larger)', () => {
    const slow = computeOrbitParams(bounds1280x720, 30, 38);
    const medium = computeOrbitParams(bounds1280x720, 50, 38);
    const fast = computeOrbitParams(bounds1280x720, 75, 38);
    expect(slow.angularSpeedRadPerMs).toBeLessThan(medium.angularSpeedRadPerMs);
    expect(medium.angularSpeedRadPerMs).toBeLessThan(fast.angularSpeedRadPerMs);
    // Ratios should track drift ratios exactly (semiMajor cancels).
    expect(medium.angularSpeedRadPerMs / slow.angularSpeedRadPerMs).toBeCloseTo(50 / 30, 6);
    expect(fast.angularSpeedRadPerMs / slow.angularSpeedRadPerMs).toBeCloseTo(75 / 30, 6);
  });

  it('clamps semi-axes to >=1 for degenerate tiny playfields (no NaN/Infinity)', () => {
    // Playfield smaller than 2× asteroid radius — semi-major would go negative.
    const tiny: PlayfieldBounds = { leftBound: 0, rightBound: 50, topBound: 0, bottomBound: 50 };
    const p = computeOrbitParams(tiny, 50, 38);
    expect(p.semiMajor).toBeGreaterThanOrEqual(1);
    expect(p.semiMinor).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(p.angularSpeedRadPerMs)).toBe(true);
  });
});

describe('pointOnEllipse', () => {
  const p = computeOrbitParams(bounds1280x720, 50, 38);

  it('theta = 0 → rightmost point (+semiMajor, 0)', () => {
    const pt = pointOnEllipse(p, 0);
    expect(pt.x).toBeCloseTo(p.centerX + p.semiMajor, 6);
    expect(pt.y).toBeCloseTo(p.centerY, 6);
  });

  it('theta = π/2 → bottom point (0, +semiMinor) — Phaser y grows down', () => {
    const pt = pointOnEllipse(p, Math.PI / 2);
    expect(pt.x).toBeCloseTo(p.centerX, 6);
    expect(pt.y).toBeCloseTo(p.centerY + p.semiMinor, 6);
  });

  it('theta = π → leftmost point (-semiMajor, 0)', () => {
    const pt = pointOnEllipse(p, Math.PI);
    expect(pt.x).toBeCloseTo(p.centerX - p.semiMajor, 6);
    expect(pt.y).toBeCloseTo(p.centerY, 6);
  });

  it('theta = 2π wraps to the rightmost point', () => {
    const pt = pointOnEllipse(p, Math.PI * 2);
    expect(pt.x).toBeCloseTo(p.centerX + p.semiMajor, 6);
    expect(pt.y).toBeCloseTo(p.centerY, 6);
  });

  it('any point lies on the ellipse curve (x²/a² + y²/b² ≈ 1)', () => {
    // Sample 12 angles around the ellipse; each must satisfy the
    // canonical ellipse equation in the shifted frame.
    for (let i = 0; i < 12; i++) {
      const theta = (i / 12) * Math.PI * 2;
      const pt = pointOnEllipse(p, theta);
      const dx = pt.x - p.centerX;
      const dy = pt.y - p.centerY;
      const lhs = (dx * dx) / (p.semiMajor * p.semiMajor) + (dy * dy) / (p.semiMinor * p.semiMinor);
      expect(lhs).toBeCloseTo(1, 6);
    }
  });
});
