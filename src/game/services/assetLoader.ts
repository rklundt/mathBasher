// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import type { GameId } from '@/services/Settings';
import { isBootScope, isGameScope, type AssetScope } from '@/core/assetScope';
import { AUDIO_MANIFEST } from '@/core/audioKeys';
import {
  ALIEN_SPRITE_KEYS,
  ALIEN_SPRITE_SCOPE,
  SPRITE_MANIFEST,
  alienSpritePath,
  getCachedSpriteTier,
} from '@/core/spriteKeys';

/**
 * Sprint 2.1.6 — per-game asset loader. Game scenes call
 * `loadGameBundle(this, this.gameId)` from their `preload()` to queue
 * every asset scoped to that game OR to `'always'`. Phaser's loader is
 * idempotent for already-cached keys, so calling this on every game
 * mount is safe — only the FIRST mount actually fetches; subsequent
 * mounts are no-ops with `loader.totalToLoad === 0` (which lets
 * `LoadingOverlay` short-circuit and render nothing).
 *
 * Pairs with `loadBootBundle(scene)` (called from `BootScene.preload`
 * via the SPRITE_MANIFEST + AUDIO_MANIFEST loops) which loads every
 * `'eager'` or `'always'` asset. Together the two functions cover all
 * scopes without overlap (each asset is queued by exactly one
 * function over the lifetime of a session, given Phaser's cache).
 */
export function loadGameBundle(scene: Phaser.Scene, gameId: GameId): void {
  const loader = scene.load;

  // Sprite manifest entries (single-image OR spritesheet via the optional
  // `frameWidth` field — same branching BootScene uses for eager loads).
  for (const entry of SPRITE_MANIFEST) {
    if (!isGameScope(entry.scope, gameId)) continue;
    if (entry.frameWidth !== undefined) {
      loader.spritesheet(entry.key, entry.url, {
        frameWidth: entry.frameWidth,
        frameHeight: entry.frameHeight ?? entry.frameWidth,
      });
    } else {
      loader.image(entry.key, entry.url);
    }
  }

  // Audio manifest entries (sfx / midground / music — all loaded via
  // load.audio regardless of kind; AudioManager binds them later).
  for (const entry of AUDIO_MANIFEST) {
    if (!isGameScope(entry.scope, gameId)) continue;
    loader.audio(entry.key, entry.url);
  }

  // Alien sprites — tier-aware, webp spritesheets, separate path from
  // SPRITE_MANIFEST. The whole pool shares one scope (`ALIEN_SPRITE_SCOPE`)
  // since they all belong to the same game mode.
  if (isGameScope(ALIEN_SPRITE_SCOPE, gameId)) {
    const tier = getCachedSpriteTier();
    for (const key of ALIEN_SPRITE_KEYS) {
      loader.spritesheet(key, alienSpritePath(key, tier), {
        frameWidth: tier,
        frameHeight: tier,
      });
    }
  }
}

/**
 * BootScene's filter — same partition, opposite scope. Returns whether
 * an entry's scope means "load at boot." Symmetric to the per-entry
 * test inside `loadGameBundle` but exported so BootScene can apply it
 * to the existing SPRITE_MANIFEST / AUDIO_MANIFEST iteration loops
 * without restructuring.
 */
export function shouldLoadAtBoot<T extends { scope: AssetScope }>(entry: T): boolean {
  return isBootScope(entry.scope);
}
