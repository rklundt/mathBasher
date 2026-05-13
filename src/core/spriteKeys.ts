// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Stable string keys for every preloadable sprite asset, organized by kind.
 * Mirrors the `audioKeys.ts` pattern: every reference to a sprite asset goes
 * through a constant here so a typo doesn't silently fall through to a
 * runtime "key not found" warning.
 *
 * Sprite-kind taxonomy (same as `scripts/sprites/process.mjs` PROFILES):
 *
 *   - **alien** — enemy creature sprites. Multi-frame spritesheets extracted
 *     from a video grid via `scripts/sprites/extract-from-video.mjs`. Ships
 *     in two tiers (128×128 + 192×192) per ADR-0010; tier picked at boot
 *     from viewport × DPR. Each WebP is a horizontal row of N frames at
 *     12 fps animation rate.
 *   - **hero**, **projectile**, **ui**, **particle**, **bg** — individual
 *     single-frame PNG sprites processed through `scripts/sprites/process.mjs`
 *     (the single-PNG pipeline from sprint 0.6.1). One file per asset, no
 *     tiers — sized per-kind per the script's PROFILES.
 *
 * Aliens get their own batched-grid registry (`ALIEN_SPRITE_BATCHES` →
 * derived `ALIEN_SPRITE_KEYS`) because the batched-grid concept is specific
 * to the video-extract pipeline. Other kinds use per-kind const objects
 * mirroring `audioKeys.ts` (`HeroSpriteKeys`, `ProjectileSpriteKeys`, ...).
 *
 * Sprint 0.7 Story 0 reshaped this file to multi-kind. Prior to that
 * (sprints 0.6.3 and earlier), the file was alien-only.
 */

// ------------------------------------------------------------------
// Alien sprites — batched-grid, multi-frame, two-tier
// ------------------------------------------------------------------

/**
 * Canonical / expected frame count per spritesheet, assuming the source
 * video is the standard 5.21s at 24 fps and the extractor runs at 12 fps.
 *
 * **DO NOT trust this for animation registration.** The pipeline can
 * produce variable frame counts in practice — ffmpeg's frame-rate
 * filter dedups repeated source frames, so a source with VFR encoding
 * or a slight duration mismatch produces fewer than 63 actual frames.
 * Phaser's `generateFrameNumbers(key, { start: 0 })` (omit `end`)
 * uses the spritesheet's actual frame count at runtime — always
 * prefer that over hardcoding this constant.
 *
 * This constant is kept as documentation for the *target* source-video
 * shape ("aim for ~5.21s at 12 fps when generating new alien videos")
 * and for the CSS preview's default duration calculation. Alien-specific.
 */
export const FRAMES_PER_SPRITE = 63;

/** Animation playback rate for alien spritesheets (matches extract --fps). */
export const SPRITE_FPS = 12;

interface AlienSpriteBatch {
  readonly prefix: string;
  readonly rows: number;
  readonly cols: number;
}

/**
 * Source-video batches that have been processed through the sprite
 * pipeline and have spritesheets on disk in `public/assets/sprites/aliens/`.
 *
 * Each entry's `rows × cols` defines the grid of that batch's source
 * video — `alien<N>-r<R>c<C>.webp` exists for every (R, C) in 0..rows-1
 * × 0..cols-1. `ALIEN_SPRITE_KEYS` below is derived from this list.
 *
 * Adding a new batch after a `pnpm sprite:extract` run: append a line
 * here. Removing a batch: delete the line + the sprite files.
 *
 * Tuning history:
 *   0.6.3 initial: hardcoded 5 batches × 3×3 = 45 keys.
 *   0.6.3 mid-sprint: switched to this data-driven form after option-C
 *     dark-bg pivot temporarily desync'd batches and code.
 */
export const ALIEN_SPRITE_BATCHES: readonly AlienSpriteBatch[] = [
  { prefix: 'alien1', rows: 3, cols: 3 },
  { prefix: 'alien2', rows: 3, cols: 3 },
  { prefix: 'alien3', rows: 3, cols: 3 },
  { prefix: 'alien4', rows: 3, cols: 3 },
  { prefix: 'alien5', rows: 3, cols: 3 },
];

/**
 * Flat array of every alien sprite key currently shipped, derived from
 * `ALIEN_SPRITE_BATCHES`. Sprint 0.7's Story 4 curation pass will narrow
 * this pool to the keepers; until then, the full 45-candidate pool loads.
 */
export const ALIEN_SPRITE_KEYS: readonly string[] = (() => {
  const keys: string[] = [];
  for (const batch of ALIEN_SPRITE_BATCHES) {
    for (let r = 0; r < batch.rows; r++) {
      for (let c = 0; c < batch.cols; c++) {
        keys.push(`${batch.prefix}-r${r}c${c}`);
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

/**
 * Pick a random alien sprite key from `ALIEN_SPRITE_KEYS`. Uniform random
 * — no weighting, no per-batch quotas. Sprint 0.6.3 uses `Math.random` for
 * simplicity; sprint 0.7 Story 13 (or later) introduces optional RNG
 * injection for tournament/replay-mode determinism.
 */
export function pickRandomAlienSpriteKey(): string {
  const i = Math.floor(Math.random() * ALIEN_SPRITE_KEYS.length);
  return ALIEN_SPRITE_KEYS[i];
}

// ------------------------------------------------------------------
// Non-alien sprite kinds — individual files, single resolution per kind
// ------------------------------------------------------------------

/**
 * Hero ship sprite keys. Sprint 0.7 Story 1 populates after Kenney pack
 * sourcing; for now this is the schema-locked empty object so the rest
 * of the file compiles and Story 2 (BootScene loader extension) can wire
 * the iteration loop without waiting on the asset acquisition.
 *
 * Naming convention: lowercase, kebab-case, descriptive state if multiple
 * (e.g. `Idle`, `EngineGlow`, `Damaged`). Values are the on-disk basename
 * minus the `.png` extension.
 */
export const HeroSpriteKeys = {
  // Idle: 'hero-idle',  // populated in Story 1
} as const;

/**
 * Projectile (laser/bullet) sprite keys. Populated in Story 1.
 * Hero fire animation may use multiple variants for variety.
 */
export const ProjectileSpriteKeys = {
  // LaserBlue: 'laser-blue',
  // LaserRed: 'laser-red',
} as const;

/**
 * UI sprite keys (buttons, panels, frames). Populated in Story 1 from
 * Kenney's UI Pack. The 9-slice/panel approach for button backgrounds
 * + a separate set of icon sprites is the expected shape.
 */
export const UiSpriteKeys = {
  // ButtonBlue: 'button-blue',
  // ButtonBlueHover: 'button-blue-hover',
} as const;

/**
 * Particle effect sprite keys (explosion, glow, smoke). Populated in
 * Story 1 from Kenney's Particle Pack. Used by emitters in hero death,
 * correct/wrong hit feedback, hero engine glow.
 */
export const ParticleSpriteKeys = {
  // Smoke: 'smoke',
  // GlowYellow: 'glow-yellow',
  // ExplosionGreen: 'explosion-green',
  // ExplosionRed: 'explosion-red',
} as const;

/**
 * Background sprite keys (parallax stars, nebula tiles). Optional kind —
 * Story 6 (parallax background) may use these or generate stars
 * procedurally; decision made during Story 6 implementation.
 */
export const BgSpriteKeys = {
  /**
   * Gameplay backdrop — Midjourney-generated dark purple/blue nebula,
   * darkened 40% via the processor to tame visual competition with
   * foreground sprites. 1280×717 RGB. Loaded once at boot, rendered as
   * the static base layer of `GameScene` (Story 6).
   */
  Nebula: 'nebula',
  // StarsFar: 'stars-far',     // (planned — parallax stars, Story 6)
  // StarsNear: 'stars-near',   // (planned — parallax stars, Story 6)
} as const;

/**
 * Sprite-kind union. The runtime kind taxonomy across `scripts/sprites/`
 * (extract-from-video.mjs, process.mjs) and `BootScene.preload`.
 * 'alien' is special-cased (tiered, spritesheet); the others are
 * uniform single-image kinds.
 */
export type SpriteKind = 'alien' | 'hero' | 'projectile' | 'ui' | 'particle' | 'bg';

/**
 * Map kind → public folder slug. The folder structure matches
 * `KIND_FOLDERS` in `scripts/sprites/extract-from-video.mjs` and
 * `PROFILES[kind].folder` in `scripts/sprites/process.mjs` — keep these
 * three in sync if a new kind is added.
 */
const KIND_FOLDER: Record<SpriteKind, string> = {
  alien: 'aliens',
  hero: 'hero',
  projectile: 'projectiles',
  ui: 'ui',
  particle: 'particles',
  bg: 'bg',
};

// Function overloads: alien REQUIRES a tier; other kinds don't accept one.
export function spritePath(kind: 'alien', key: string, tier: SpriteTier): string;
export function spritePath(kind: Exclude<SpriteKind, 'alien'>, key: string): string;
/**
 * Build the URL to a shipped sprite asset.
 *
 * - For `kind === 'alien'`, includes the tier subfolder (`/128/` or `/192/`)
 *   and uses the `.webp` spritesheet extension. Tier is REQUIRED.
 * - For other kinds, single resolution per kind (no tier subfolder), `.png`
 *   extension (Kenney packs ship PNG; `process.mjs` keeps that format).
 *
 * Vite serves `public/` at root in both dev and prod, so `/assets/sprites/...`
 * resolves the same way in both modes.
 */
export function spritePath(kind: SpriteKind, key: string, tier?: SpriteTier): string {
  if (kind === 'alien') {
    if (tier === undefined) {
      throw new Error("spritePath('alien', key, tier) requires a tier argument");
    }
    return `/assets/sprites/${KIND_FOLDER.alien}/${tier}/${key}.webp`;
  }
  return `/assets/sprites/${KIND_FOLDER[kind]}/${key}.png`;
}

/**
 * Phaser animation key for the looping idle of a given sprite. Used for
 * registered animations in `BootScene.create` and play calls like
 * `sprite.play(spriteAnimKey('alien', key))`.
 *
 * Suffixed `-idle` so future per-sprite states (e.g. `-explode`, `-hit`)
 * compose without colliding with the underlying asset key.
 *
 * For non-alien kinds, the kind prefix prevents collisions if (hypothetically)
 * a hero sprite shares a basename with a projectile sprite. Aliens use the
 * bare key + `-idle` suffix (no kind prefix) for back-compat with sprint 0.6.3.
 */
export function spriteAnimKey(kind: SpriteKind, key: string): string {
  if (kind === 'alien') return `${key}-idle`;
  return `${kind}/${key}/idle`;
}

// ------------------------------------------------------------------
// Back-compat alien-specific helpers (delegate to the unified functions
// above). New code should prefer `spritePath` / `spriteAnimKey`.
// ------------------------------------------------------------------

/** Asset URL for a given alien sprite key + tier. Prefer `spritePath('alien', key, tier)`. */
export function alienSpritePath(key: string, tier: SpriteTier): string {
  return spritePath('alien', key, tier);
}

/** Phaser animation key for an alien sprite. Prefer `spriteAnimKey('alien', key)`. */
export function alienAnimKey(key: string): string {
  return spriteAnimKey('alien', key);
}

// ------------------------------------------------------------------
// Sprite manifest — schema-locked iteration list for BootScene preload
// ------------------------------------------------------------------

/**
 * Single sprite asset entry. Used by `BootScene.preload` to iterate every
 * preloadable sprite without per-kind branching (mirrors AUDIO_MANIFEST's
 * shape). Aliens are NOT in this manifest — they're handled separately
 * because tier-aware URL construction and `load.spritesheet` (vs `load.image`)
 * require kind-specific logic that doesn't fit a uniform manifest entry.
 *
 * Story 1 will populate the per-kind const objects above; this manifest
 * derives entries automatically as soon as those entries exist. No second
 * edit needed when an asset key is added — the manifest is derived.
 */
export interface SpriteManifestEntry {
  readonly kind: Exclude<SpriteKind, 'alien'>;
  readonly key: string;
  readonly url: string;
}

/**
 * Non-alien sprite manifest, derived from the per-kind const objects.
 * Aliens are loaded via the alien-specific path in BootScene because
 * they need spritesheet (not image) loading + tier-aware URL.
 *
 * The `as string[]` casts on each `Object.values(...)` aren't ugly redundancy
 * — when an `as const` object is empty (which all five non-alien key consts
 * are pre-Story-1), `Object.values` returns `unknown[]`. The cast widens to
 * `string[]` so the manifest stays well-typed both empty (now) and populated
 * (after Story 1). Once any const has at least one entry, Object.values
 * already returns a narrow string union and the cast is a no-op widening.
 */
export const SPRITE_MANIFEST: ReadonlyArray<SpriteManifestEntry> = [
  ...(Object.values(HeroSpriteKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'hero',
    key,
    url: spritePath('hero', key),
  })),
  ...(Object.values(ProjectileSpriteKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'projectile',
    key,
    url: spritePath('projectile', key),
  })),
  ...(Object.values(UiSpriteKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'ui',
    key,
    url: spritePath('ui', key),
  })),
  ...(Object.values(ParticleSpriteKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'particle',
    key,
    url: spritePath('particle', key),
  })),
  ...(Object.values(BgSpriteKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'bg',
    key,
    url: spritePath('bg', key),
  })),
];

// ------------------------------------------------------------------
// Type-safe per-kind key types
// ------------------------------------------------------------------

export type HeroSpriteKey = (typeof HeroSpriteKeys)[keyof typeof HeroSpriteKeys];
export type ProjectileSpriteKey = (typeof ProjectileSpriteKeys)[keyof typeof ProjectileSpriteKeys];
export type UiSpriteKey = (typeof UiSpriteKeys)[keyof typeof UiSpriteKeys];
export type ParticleSpriteKey = (typeof ParticleSpriteKeys)[keyof typeof ParticleSpriteKeys];
export type BgSpriteKey = (typeof BgSpriteKeys)[keyof typeof BgSpriteKeys];

/** Union over every non-alien sprite key. Aliens use plain `string` keys due to dynamic derivation. */
export type NonAlienSpriteKey =
  | HeroSpriteKey
  | ProjectileSpriteKey
  | UiSpriteKey
  | ParticleSpriteKey
  | BgSpriteKey;
