// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Stable string keys for every preloadable sprite asset. Mirrors the
 * `audioKeys.ts` pattern: every reference to a sprite asset goes through
 * a constant here so a typo doesn't silently fall through to a runtime
 * "key not found" warning.
 *
 * Per [ADR-0010](../../docs/adrs/ADR-0010-sprite-tier-strategy.md), sprite
 * art ships in two tiers (128px and 192px). The loader picks ONE tier at
 * boot from viewport × DPR and uses that tier's URL prefix for all asset
 * loads. Same filename across tiers means a single asset key works
 * regardless of which tier was loaded — only the URL prefix changes.
 *
 * Frame layout: each WebP is a horizontal-row spritesheet of
 * `FRAMES_PER_SPRITE` frames at `<tier>×<tier>` px each, extracted at
 * `SPRITE_FPS` from a 24 fps source (24÷12 = clean integer downsample).
 */

/** Number of frames in every alien spritesheet (5.21s source × 12 fps). */
export const FRAMES_PER_SPRITE = 63;

/** Animation playback rate (frames per second). Matches extract --fps. */
export const SPRITE_FPS = 12;

/**
 * Generated alien sprite keys: 5 source-video batches × 9 cells (3×3 grid)
 * = 45 sprite keys. Order is `alien1-r0c0` … `alien5-r2c2`. Sprint 0.7's
 * curation pass is expected to pick a much smaller subset (~15-20 keepers);
 * for sprint 0.6.3 the full 45-key pool loads so we can validate the
 * sprite-on-block animation pattern against varied art.
 */
export const ALIEN_SPRITE_KEYS: readonly string[] = (() => {
  const keys: string[] = [];
  for (let batch = 1; batch <= 5; batch++) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        keys.push(`alien${batch}-r${r}c${c}`);
      }
    }
  }
  return keys;
})();

export type SpriteTier = 128 | 192;

/**
 * Pick the sprite tier to load at boot.
 *
 * Heuristic: combined "device-pixels-wide" (viewport CSS width × DPR)
 *   ≥ 1920 → load the 192 tier (crisp on retina + desktop).
 *   < 1920 → load the 128 tier (saves ~2× bandwidth on phones; the GPU
 *     downscales 128→smaller invisibly, per ADR-0010 D3).
 *
 * Examples:
 *   iPhone 14    (390×844 @ DPR 3 = 1170)   → 128
 *   iPad Air     (1024×768 @ DPR 2 = 2048)  → 192
 *   1080p desktop (1920×1080 @ DPR 1)        → 192
 *   1366 laptop  (1366×768 @ DPR 1)          → 128
 *   Retina 14"   (1440×900 @ DPR 2 = 2880)   → 192
 *
 * Called once at boot from `BootScene.preload()` — no mid-session tier
 * swap (per ADR-0010 D4 + "out of scope" note).
 */
export function pickSpriteTier(viewportWidth: number, dpr: number): SpriteTier {
  return viewportWidth * dpr >= 1920 ? 192 : 128;
}

/** Asset URL for a given alien sprite key + tier. */
export function alienSpritePath(key: string, tier: SpriteTier): string {
  return `/assets/sprites/aliens/${tier}/${key}.webp`;
}

/**
 * Phaser animation key for the looping idle of a given sprite key.
 * Suffixed `-idle` so future per-sprite states (e.g. `-explode`,
 * `-hit`) compose without colliding with the asset key itself.
 */
export function alienAnimKey(key: string): string {
  return `${key}-idle`;
}

/**
 * Pick a random alien sprite key from `ALIEN_SPRITE_KEYS`. Uniform random
 * — no weighting, no per-batch quotas. Caller chooses when to seed the
 * RNG (sprint 0.6.3 just uses `Math.random`; future tournament/replay
 * modes might pass a seeded picker).
 */
export function pickRandomAlienSpriteKey(): string {
  const i = Math.floor(Math.random() * ALIEN_SPRITE_KEYS.length);
  return ALIEN_SPRITE_KEYS[i];
}
