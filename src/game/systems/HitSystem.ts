// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { Alien } from '@/game/entities/Alien';
import type { Projectile } from '@/game/entities/Projectile';

/**
 * Per-frame collision check. Pure helper — no Phaser physics body needed for
 * this many objects (one projectile vs at most 4 aliens). AABB overlap is
 * fast and predictable.
 *
 * Allocation discipline: this runs every frame. Both rectangles below are
 * module-scoped scratch buffers, mutated in place via `setTo(...)` rather
 * than re-instantiated per call. Without this, a 60fps round with 4 aliens
 * would churn ~300 throwaway `Phaser.Geom.Rectangle` instances per second.
 */
const _alienScratch = new Phaser.Geom.Rectangle(0, 0, Alien.WIDTH, Alien.HEIGHT);

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
      _alienScratch.setTo(a.x - Alien.WIDTH / 2, a.y - Alien.HEIGHT / 2, Alien.WIDTH, Alien.HEIGHT);
      if (Phaser.Geom.Intersects.RectangleToRectangle(projBounds, _alienScratch)) {
        return a;
      }
    }
    return null;
  },
};
