// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { AsteroidHitSystem } from '@/game/systems/AsteroidHitSystem';
import type { Asteroid } from '@/game/entities/Asteroid';
import type { AsteroidProjectile } from '@/game/entities/AsteroidProjectile';

/**
 * Circle-on-circle collision math for the Asteroid Field game mode.
 *
 * Tests use minimal duck-typed mocks (just the fields AsteroidHitSystem
 * reads: x, y, isDestroyed, getCollisionRadius). This avoids spinning up
 * Phaser scenes for what is otherwise pure distance-comparison math.
 */
function mockAsteroid(opts: { x: number; y: number; radius: number; destroyed?: boolean }): Asteroid {
  return {
    x: opts.x,
    y: opts.y,
    isDestroyed: () => opts.destroyed ?? false,
    getCollisionRadius: () => opts.radius,
  } as unknown as Asteroid;
}

function mockProjectile(opts: {
  x: number;
  y: number;
  radius: number;
  destroyed?: boolean;
}): AsteroidProjectile {
  return {
    x: opts.x,
    y: opts.y,
    isDestroyed: () => opts.destroyed ?? false,
    getCollisionRadius: () => opts.radius,
  } as unknown as AsteroidProjectile;
}

describe('AsteroidHitSystem', () => {
  describe('findHit (circle-circle collision)', () => {
    it('returns null when no asteroids in the wave', () => {
      const projectile = mockProjectile({ x: 100, y: 100, radius: 30 });
      expect(AsteroidHitSystem.findHit(projectile, [])).toBeNull();
    });

    it('returns the asteroid when the circles overlap', () => {
      const projectile = mockProjectile({ x: 100, y: 100, radius: 30 });
      // Asteroid 50 units to the right; combined radii 30+38 = 68 > 50
      const overlapping = mockAsteroid({ x: 150, y: 100, radius: 38 });
      const result = AsteroidHitSystem.findHit(projectile, [overlapping]);
      expect(result).toBe(overlapping);
    });

    it('returns null when the circles are exactly outside contact', () => {
      const projectile = mockProjectile({ x: 0, y: 0, radius: 30 });
      // Asteroid is 100 units away with combined radii of 30+38 = 68 — no overlap
      const farAsteroid = mockAsteroid({ x: 100, y: 0, radius: 38 });
      expect(AsteroidHitSystem.findHit(projectile, [farAsteroid])).toBeNull();
    });

    it('treats edge-touching (distance == sum of radii) as a hit', () => {
      // Distance exactly equals sum of radii. The current implementation
      // uses `<=` so this counts as a hit (forgiving for kid aim).
      const projectile = mockProjectile({ x: 0, y: 0, radius: 30 });
      const touchingAsteroid = mockAsteroid({ x: 68, y: 0, radius: 38 });
      expect(AsteroidHitSystem.findHit(projectile, [touchingAsteroid])).toBe(touchingAsteroid);
    });

    it('ignores destroyed asteroids', () => {
      const projectile = mockProjectile({ x: 100, y: 100, radius: 30 });
      const deadAsteroid = mockAsteroid({ x: 100, y: 100, radius: 38, destroyed: true });
      expect(AsteroidHitSystem.findHit(projectile, [deadAsteroid])).toBeNull();
    });

    it('returns null when the projectile itself is destroyed', () => {
      const projectile = mockProjectile({ x: 100, y: 100, radius: 30, destroyed: true });
      const asteroid = mockAsteroid({ x: 100, y: 100, radius: 38 });
      expect(AsteroidHitSystem.findHit(projectile, [asteroid])).toBeNull();
    });

    it('returns the FIRST overlapping asteroid when multiple overlap', () => {
      // The system is documented to return "the first live asteroid whose
      // bounds overlap." Multiple-overlap is unlikely in practice (the
      // min-spawn-distance rule prevents it at spawn time) but the
      // ordering is well-defined for testability.
      const projectile = mockProjectile({ x: 100, y: 100, radius: 30 });
      const a1 = mockAsteroid({ x: 100, y: 100, radius: 38 });
      const a2 = mockAsteroid({ x: 105, y: 100, radius: 38 });
      const result = AsteroidHitSystem.findHit(projectile, [a1, a2]);
      expect(result).toBe(a1);
    });

    it('handles vertical-only separation correctly', () => {
      // Coverage for the dy² component (the dx² + dy² formula).
      const projectile = mockProjectile({ x: 100, y: 100, radius: 30 });
      const above = mockAsteroid({ x: 100, y: 40, radius: 38 });
      // Distance = 60, sum of radii = 68 → overlap
      expect(AsteroidHitSystem.findHit(projectile, [above])).toBe(above);
    });

    it('handles 2D diagonal separation correctly', () => {
      // Coverage for the Pythagorean term — neither dx nor dy is 0.
      const projectile = mockProjectile({ x: 0, y: 0, radius: 30 });
      // 3-4-5 triangle: dx=30, dy=40, distance=50 → overlap with sum=68
      const nearDiag = mockAsteroid({ x: 30, y: 40, radius: 38 });
      expect(AsteroidHitSystem.findHit(projectile, [nearDiag])).toBe(nearDiag);
      // 6-8-10 triangle: dx=60, dy=80, distance=100 → no overlap
      const farDiag = mockAsteroid({ x: 60, y: 80, radius: 38 });
      expect(AsteroidHitSystem.findHit(projectile, [farDiag])).toBeNull();
    });
  });
});
