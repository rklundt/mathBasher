// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import type { Alien } from '@/game/entities/Alien';
import type { Projectile } from '@/game/entities/Projectile';

/**
 * Per-frame collision check. Pure helper — no Phaser physics body needed for
 * this many objects (one projectile vs at most 4 aliens). AABB overlap is
 * fast and predictable.
 */
export const HitSystem = {
  /**
   * Find the first live alien whose bounds overlap the projectile's bounds.
   * Returns the alien (caller plays the explode animation) or `null`.
   */
  findHit(projectile: Projectile, aliens: Alien[]): Alien | null {
    if (projectile.isDestroyed()) return null;
    const projBounds = projectile.bounds();
    for (const a of aliens) {
      if (a.isDestroyed()) continue;
      const ab = new Phaser.Geom.Rectangle(
        a.x - 40, // half of Alien.WIDTH (80)
        a.y - 30, // half of Alien.HEIGHT (60)
        80,
        60,
      );
      if (Phaser.Geom.Intersects.RectangleToRectangle(projBounds, ab)) {
        return a;
      }
    }
    return null;
  },
};
