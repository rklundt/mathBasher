// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { ALIEN_SPRITE_KEYS, SPRITE_FPS, alienAnimKey } from '@/core/spriteKeys';

/**
 * Sprint 2.1.6 — register one looping `idle` animation per alien
 * spritesheet. Doubly-idempotent:
 *
 *   - Guards with `scene.anims.exists(animKey)` → re-registration of
 *     the same animation is a no-op. Survives Phaser hot-reloads and
 *     multiple-game-mode sessions.
 *
 *   - Guards with `scene.textures.exists(key)` → if a spritesheet
 *     hasn't been loaded yet (because story 7 moved alien sprites to
 *     `'game:alien-shoot'` scope and the player hasn't picked Alien
 *     Shoot yet), the corresponding anim is silently skipped.
 *     `generateFrameNumbers` on a missing texture warns + falls back
 *     to an empty frame list, which is worse than skipping.
 *
 * Phaser's anims manager is global-to-the-game (not per-scene), so
 * registration done once from any scene is visible to every later
 * `sprite.play(alienAnimKey(key))` call.
 *
 * Uses each spritesheet's ACTUAL frame count (Phaser's default when
 * `end` is omitted = "last frame in the spritesheet") rather than the
 * canonical `FRAMES_PER_SPRITE` constant. Variable frame counts
 * across batches are normal: ffmpeg's frame-rate filter can dedup
 * repeated source frames, so a "5.21s × 12 fps" source might produce
 * 47-63 frames depending on encoding quirks. Hardcoding `end: 62`
 * against a 47-frame WebP made Phaser fall back to frame 0 for the
 * missing 15 frames, breaking the loop visibly (sprint 0.6.3 fix).
 */
export function createAlienAnims(scene: Phaser.Scene): void {
  for (const key of ALIEN_SPRITE_KEYS) {
    const animKey = alienAnimKey(key);
    if (scene.anims.exists(animKey)) continue;
    if (!scene.textures.exists(key)) continue;
    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(key, { start: 0 }),
      frameRate: SPRITE_FPS,
      repeat: -1,
    });
  }
}
