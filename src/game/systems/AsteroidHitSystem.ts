// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { Asteroid } from '@/game/entities/Asteroid';
import type { AsteroidProjectile } from '@/game/entities/AsteroidProjectile';

/**
 * Circle-on-circle collision check for the Asteroid Field game mode.
 * Parallel to Alien Shoot's `HitSystem` (which is AABB-on-AABB because
 * aliens are rectangular blocks); asteroids are roughly round, so circle
 * collision is more accurate AND simpler (no scratch-buffer dance).
 *
 * Each circle is `{x, y, r}` — projectile's center + radius (long axis /
 * 2, lenient for kid aim) vs each live asteroid's center + scaled radius.
 * Squared-distance comparison avoids a sqrt per pair, which matters in a
 * 60fps loop (4 asteroids × 1 projectile = 4 distance checks per frame).
 */
export const AsteroidHitSystem = {
  /**
   * Find the first live asteroid whose collision circle overlaps the
   * projectile's collision circle. Returns the asteroid (caller plays
   * the explode animation) or `null` if no hit this frame.
   */
  findHit(projectile: AsteroidProjectile, asteroids: Asteroid[]): Asteroid | null {
    if (projectile.isDestroyed()) return null;
    const pr = projectile.getCollisionRadius();
    const px = projectile.x;
    const py = projectile.y;
    for (const a of asteroids) {
      if (a.isDestroyed()) continue;
      const ar = a.getCollisionRadius();
      const dx = a.x - px;
      const dy = a.y - py;
      const r = pr + ar;
      // Compare squared distance against squared sum-of-radii (no sqrt).
      if (dx * dx + dy * dy <= r * r) {
        return a;
      }
    }
    return null;
  },
};
