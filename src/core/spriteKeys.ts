// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { GameId } from '@/services/Settings';
import type { AssetScope } from '@/core/assetScope';

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

/**
 * Sprint 2.1.6 — scope for the whole alien-spritesheet pool. Alien
 * sprites don't go through the SPRITE_MANIFEST (they need tier-aware
 * webp spritesheet loading via the alien-specific path in BootScene),
 * so they get a single module-level scope rather than per-entry tags.
 * Story 1 leaves this as `'eager'` (no behavior change); story 7
 * flips to `'game:alien-shoot'` after `GameScene.preload()` is wired.
 * The partition helpers (`isBootScope` / `isGameScope`) treat this
 * value the same way they treat per-entry manifest scopes.
 */
export const ALIEN_SPRITE_SCOPE: AssetScope = 'game:alien-shoot';

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
 * Sprint 2.1.6 — memoized sprite-tier accessor. First call computes
 * the tier from `window.innerWidth` × `window.devicePixelRatio` via
 * `pickSpriteTier` and caches it; subsequent calls return the cached
 * value without re-touching the viewport. Both `BootScene.preload`
 * (eager-loaded scenes) and per-game `preload()` functions (lazy-
 * loaded scenes — sprint 2.1.6 stories 4 + 6) read through this
 * accessor so they always pick the SAME tier for the same device
 * within a session.
 *
 * Re-deriving the tier per-preload would technically work but is
 * slightly fragile — the viewport CAN change between BootScene's
 * preload and a game scene's preload (window resize, orientation
 * change). Caching at first-call locks in the boot-time decision.
 *
 * For unit tests, expose `_resetCachedSpriteTier` to clear the
 * cache between tests (not exported via the main API; only the
 * test file imports it).
 */
let _cachedSpriteTier: SpriteTier | null = null;

export function getCachedSpriteTier(): SpriteTier {
  if (_cachedSpriteTier === null) {
    _cachedSpriteTier = pickSpriteTier(window.innerWidth, window.devicePixelRatio);
  }
  return _cachedSpriteTier;
}

/** Test-only — clears the cache so each test computes fresh. */
export function _resetCachedSpriteTier(): void {
  _cachedSpriteTier = null;
}

/**
 * Pick a random alien sprite key from `ALIEN_SPRITE_KEYS`. Uniform random
 * — no weighting, no per-batch quotas.
 *
 * Sprint 0.7 Story 13: accepts an optional `rng` parameter (defaults to
 * `Math.random`). Mirrors the math-generator RNG-injection pattern so a
 * future tournament/replay mode can pass a seeded PRNG for deterministic
 * sprite picks. Game-side callers continue to call without args and get
 * the production `Math.random` behavior.
 */
export function pickRandomAlienSpriteKey(rng: () => number = Math.random): string {
  const i = Math.floor(rng() * ALIEN_SPRITE_KEYS.length);
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
/**
 * Hero ship sprite keys. Three Midjourney-generated variants — the game
 * cycles through them so each new round can feature a different ship,
 * matching the "alternate between speeders" design call from sprint 0.7
 * Story 1 planning.
 *
 * All three are 192×108 (16:9) RGBA palette PNGs with true transparency.
 * Source rendering faces RIGHT; `Hero.ts` will `setFlipX(true)` when the
 * hero is moving left (Phaser handles the mirror at render time, no
 * second asset needed).
 */
export const HeroSpriteKeys = {
  Speeder1: 'speeder-1',
  Speeder2: 'speeder-2',
  Speeder3: 'speeder-3',
} as const;

/**
 * Sprint 2.5 story 4 — Hero Chooser sprites. Four diverse Midjourney-
 * generated characters (female/male × dark/light skin tone matrix) the
 * kid picks from on first visit; choice persists via
 * `Settings.chosenHero` and surfaces as the MenuScene avatar +
 * GameOver banner. Purely cosmetic — does NOT affect in-game sprites
 * (Alien Shoot stays on Speeders, Climb stays on its skin picker,
 * Asteroid Field stays on its asteroid-heroes round-robin).
 *
 * Lossless WebP at 192×192 per the alpha-sprites-are-lossless
 * convention. Eager-scoped because the picker appears BEFORE
 * MenuScene (on first run) and the chosen hero is shown on every
 * MenuScene mount thereafter — both pre-game-pick, so they're not
 * in any per-game scope.
 *
 * If a fifth diversity-representation hero lands later, add it here
 * + extend the `ChosenHeroKey` union in `Settings.ts` + the picker
 * grid in `HeroChooserScene`.
 */
export const HeroChooserKeys = {
  Hero1: 'hero-chooser-1',
  Hero2: 'hero-chooser-2',
  Hero3: 'hero-chooser-3',
  Hero4: 'hero-chooser-4',
} as const;
export type HeroChooserKey = (typeof HeroChooserKeys)[keyof typeof HeroChooserKeys];

/**
 * Sprint 2.4.2 hotfix — Number Climb hero skin keys. The Space Robot
 * sprite is the new DEFAULT climber (replaces the long-standing
 * procedural amber-rectangle placeholder in `NumberClimbHero.ts`).
 * Sprint 2.4.1 incorrectly wired it into Alien Shoot; this const +
 * the `NumberClimbHero` branching restores Alien Shoot to its
 * original Speeder1/2/3 random behavior and moves the new sprite to
 * its intended home.
 *
 * Single static sprite — no round-robin, no animation frames.
 * Lossless WebP at 128×128 per the sprint 2.2.1 story 6 alpha-sprites-
 * are-lossless convention. Lives in `public/assets/sprites/hero/`
 * (same folder as the speeders + asteroid heroes + escape ship —
 * all hero-kind sprites share one disk location).
 *
 * If a third Climb skin lands later, add it here + extend the
 * `HeroSkin` union in `Settings.ts` + the picker UI in
 * `SettingsScene.renderHeroSkinRow`.
 */
export const ClimbHeroSkinKeys = {
  SpaceRobot: 'space-robot',
} as const;
export type ClimbHeroSkinKey = (typeof ClimbHeroSkinKeys)[keyof typeof ClimbHeroSkinKeys];

/**
 * Asteroid Field hero sprite keys (sprint 2.1 playtest). Three
 * Midjourney-generated ships, each shown roughly 1/3 of rounds via
 * `pickNextAsteroidHeroSpriteKey` below (round-robin).
 *
 * Visual contract: source PNGs are 192×192 RGBA palette with the ship
 * NOSE pointing UP (north). AsteroidHero.applyFacing rotates the
 * sprite + cockpit overlay by `aimAngle + π/2` so a north-pointing
 * source renders pointing east at the aim-angle-0 baseline (matches
 * the rest of the engine's "facing 0 = right" convention).
 *
 * Distinct from Alien Shoot's speeders — Asteroid Field has its own
 * dedicated ship designs because the static-rotate-and-aim gameplay
 * benefits from a top-down ship silhouette (vs the side-facing
 * Alien Shoot speeders that imply lateral motion).
 */
export const AsteroidHeroSpriteKeys = {
  AsteroidHero1: 'asteroid-hero-1',
  AsteroidHero2: 'asteroid-hero-2',
  AsteroidHero3: 'asteroid-hero-3',
} as const;

/**
 * Module-scoped counter for `pickNextHeroSpriteKey` — round-robin picker
 * state. Increments per call, modulo the key count picks the next ship.
 * Resets only on full page reload. The semantics here is "alternate
 * between speeders" (sprint 0.7 Story 3 design call) — a strict cycle
 * rather than uniform random, so the player is GUARANTEED to see every
 * ship across consecutive rounds rather than getting unlucky and missing
 * one to RNG variance.
 */
let _heroPickIndex = 0;

/**
 * Pick the next hero sprite key from `HeroSpriteKeys` in round-robin
 * order. Called once per round at hero spawn so each new round shows
 * the next ship in the cycle (rotates Speeder1 → Speeder2 → Speeder3
 * → Speeder1 → ...). The sprint 0.7 Story 3 design intent was
 * "alternate between speeders" — strict cycle, no RNG variance.
 *
 * The function NAME is `pickNext` (not `pickRandom`) to honestly
 * reflect the round-robin strategy. The prior `pickRandomHeroSpriteKey`
 * was renamed during Story 3 polish after playtest showed the random
 * approach missed Speeder 3 on small sample sizes.
 */
export function pickNextHeroSpriteKey(): string {
  // Sprint 2.4.2 hotfix — restored to the pre-2.4.1 behavior: a
  // strict Speeder1/2/3 round-robin with no Settings consultation.
  // Sprint 2.4.1 story 3 incorrectly added a Settings.heroSkin branch
  // here, displacing the long-established Alien Shoot speeder set.
  // The hero-skin picker now lives on Number Climb (see
  // `NumberClimbHero` for the Settings consumer).
  const keys = Object.values(HeroSpriteKeys);
  const key = keys[_heroPickIndex % keys.length]!;
  _heroPickIndex += 1;
  return key;
}

/**
 * Sprint 2.1 — parallel round-robin index for Asteroid Field heroes.
 * Independent of the Alien Shoot speeder index so each game mode
 * cycles through its own ships without interference.
 */
let _asteroidHeroPickIndex = 0;

/**
 * Pick the next Asteroid Field hero in round-robin order
 * (AsteroidHero1 → 2 → 3 → 1 → ...). Same strict-cycle semantics as
 * `pickNextHeroSpriteKey` for the same reason (guarantees every ship
 * is seen across consecutive rounds, no RNG variance hiding one).
 */
export function pickNextAsteroidHeroSpriteKey(): string {
  const keys = Object.values(AsteroidHeroSpriteKeys);
  const key = keys[_asteroidHeroPickIndex % keys.length];
  _asteroidHeroPickIndex += 1;
  return key;
}

/**
 * Asteroid Field — image-variant asteroid sprite keys (sprint 2.1
 * playtest). Eight Midjourney-generated rock sprites that the Asteroid
 * entity can use INSTEAD of its procedural polygon rendering, gated
 * by the `Settings.imageAsteroidsEnabled` toggle. Default is OFF, so
 * the existing procedural look ships unchanged; users opt into the
 * image variant from the in-game Settings screen (only visible in
 * the Asteroid Field game mode).
 *
 * Visual contract: source PNGs are 192×192 RGBA palette with the
 * rock centered + transparent background. Picked uniformly at random
 * per spawned asteroid (NOT round-robin — visual variety within a
 * wave matters more than guaranteed coverage across waves, unlike
 * heroes where one ship-per-round is the rhythm).
 *
 * Physical disk location: `public/assets/sprites/aliens/asteroid-N.png`.
 * Shares the `aliens/` folder by virtue of being processed with
 * `--kind alien` in the sprite pipeline (matches profile: 192×192
 * paletted PNG with alpha). Doesn't share `alien` SEMANTICS though —
 * these aren't enemies, they're targets in a different game mode.
 */
export const AsteroidSpriteKeys = {
  Asteroid1: 'asteroid-1',
  Asteroid2: 'asteroid-2',
  Asteroid3: 'asteroid-3',
  Asteroid4: 'asteroid-4',
  Asteroid5: 'asteroid-5',
  Asteroid6: 'asteroid-6',
  Asteroid7: 'asteroid-7',
  Asteroid8: 'asteroid-8',
} as const;

/**
 * Pick a random asteroid image sprite key. Uniform random — each
 * asteroid in a wave gets its own pick, so a 4-asteroid wave shows
 * a mix of rock variants. RNG-injectable for future deterministic
 * replay/test paths (mirrors `pickRandomAlienSpriteKey`).
 */
export function pickRandomAsteroidSpriteKey(rng: () => number = Math.random): string {
  const keys = Object.values(AsteroidSpriteKeys);
  return keys[Math.floor(rng() * keys.length)]!;
}

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
/**
 * UI button 9-slice assets. Grey palette chosen during sprint 0.7 Story 1
 * for neutrality (lets alien sprites + score numbers dominate). 9-slice
 * scheme: `_l` (left cap) + `_m` (tileable middle) + `_r` (right cap)
 * lets any button width be rendered from 3 source sprites.
 *
 * Two variants per button width:
 *   - Default: matte non-gloss (resting state)
 *   - Gloss: slight shiny variant (selected/active state)
 *
 * Rollback path: if Grey doesn't feel right in Story 7 (Menu polish), the
 * raw files remain in `.sprite-source/raw/ui/` and re-processing with a
 * different color is a 30-second re-run. The placeholder rounded-rect
 * buttons in scenes continue to work until Story 7 explicitly swaps them.
 */
export const UiSpriteKeys = {
  GreyLargeL: 'grey-large_l',
  GreyLargeM: 'grey-large_m',
  GreyLargeR: 'grey-large_r',
  GreyGlossLargeL: 'grey-gloss_large_l',
  GreyGlossLargeM: 'grey-gloss_large_m',
  GreyGlossLargeR: 'grey-gloss_large_r',
} as const;

/**
 * Particle effect sprite keys (explosion, glow, smoke). Populated in
 * Story 1 from Kenney's Particle Pack. Used by emitters in hero death,
 * correct/wrong hit feedback, hero engine glow.
 */
/**
 * Particle effect sprite keys. 12 textures from Kenney's Particle Pack
 * (CC0) covering the full range of effects mathBasher needs: hero engine
 * glow, hero muzzle flash, correct-hit explosion, wrong-hit explosion,
 * smoke trails, residual scorch marks. Plus 3 background star sizes
 * for parallax (kept under particle kind since they're palette-PNG
 * radial gradients — bg kind's RGB encoding bloated them 3× larger).
 *
 * Naming preserves the Kenney source filenames so the pack-to-game
 * traceability is clear at a glance ("which Kenney file did this come
 * from? oh, `circle_03` — that's the third circle variant").
 */
export const ParticleSpriteKeys = {
  // Glow / light textures — hero engine glow, correct-hit flash
  Circle03: 'circle_03',
  Light01: 'light_01',
  Flare01: 'flare_01',
  // Fire / muzzle / spark — hero firing, explosions
  Muzzle03: 'muzzle_03',
  Flame03: 'flame_03',
  Spark05: 'spark_05',
  // Smoke / dirt / scorch — hero death, wrong-hit, residue
  Smoke05: 'smoke_05',
  Dirt02: 'dirt_02',
  Dirt03: 'dirt_03',
  Scorch02: 'scorch_02',
  // Magic / trace — projectile trails, special effects
  Magic02: 'magic_02',
  Trace03: 'trace_03',
  // Background parallax stars — three sizes for layered depth
  Star03: 'star_03',
  Star05: 'star_05',
  Star07: 'star_07',
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
   * the static base layer of `BackgroundScene`. Used by Alien Shoot
   * (and as the default for all menu/non-game scenes).
   */
  Nebula: 'nebula',
  /**
   * Asteroid Field backdrop — Midjourney-generated asteroid-belt
   * vista, darkened 40% (same brightness recipe as the nebula so the
   * two backgrounds feel like a coherent visual family). 1280×717 RGB.
   * Sprint 2.1.1 — first per-game-mode backdrop, established the
   * mapping convention in `GAME_BG_MAP` below.
   */
  AsteroidBelt: 'asteroid-belt',
  // StarsFar: 'stars-far',     // (planned — parallax stars, Story 6)
  // StarsNear: 'stars-near',   // (planned — parallax stars, Story 6)
} as const;

/**
 * Number Climb — per-floor "room" images framed inside each floor band.
 * Source MJ images are `--ar 8:1` (3072×384 raw → 1280×160 after the
 * sprite pipeline's bg-profile resize). One image per floor, drawn
 * inside black side-bars that let the nebula bleed through on the
 * left/right edges + a thick horizontal black separator between floors.
 * Sprint 2.2 story 13a established the framing pattern; story 13b adds
 * additional Room2..RoomN variants for floor-to-floor visual variety.
 *
 * `Fire` is the FIXED floor-0 (ground) image. The hero starts on this
 * floor with a fire effect underfoot — a one-off visual cue that
 * "you're escaping upward." Never appears in the random pool used by
 * floors 1..N; reached only via the explicit floor-0 frame spawn.
 */
export const ClimbFloorBgKeys = {
  Fire: 'climb-floor-fire',
  /**
   * Floor 10 (the TOP floor) — the escape route / hangar / open
   * airlock visual. Sprint 2.2 story 13e: fixed image, never in the
   * random pool, rendered at 2× normal floor height so the room reads
   * as the climactic destination rather than just another room.
   */
  Escape: 'climb-floor-escape',
  Room1: 'climb-floor-room-1',
  Room2: 'climb-floor-room-2',
  Room3: 'climb-floor-room-3',
  Room4: 'climb-floor-room-4',
  Room5: 'climb-floor-room-5',
  Room6: 'climb-floor-room-6',
  Room7: 'climb-floor-room-7',
  Room8: 'climb-floor-room-8',
  Room9: 'climb-floor-room-9',
  Room10: 'climb-floor-room-10',
  Room11: 'climb-floor-room-11',
  Room12: 'climb-floor-room-12',
  Room13: 'climb-floor-room-13',
  Room14: 'climb-floor-room-14',
  Room15: 'climb-floor-room-15',
  Room16: 'climb-floor-room-16',
  Room17: 'climb-floor-room-17',
  Room18: 'climb-floor-room-18',
  Room19: 'climb-floor-room-19',
  Room20: 'climb-floor-room-20',
} as const;

/**
 * Sprint 2.2 story 13e — overlay sprite that sits on top of the
 * escape floor (Climb floor 10). The kid sees it parked when they
 * arrive at floor 10; the win-animation tweens it upward off-screen
 * with a smoke trail (the "you escaped" beat). Ships from disk as
 * `public/assets/sprites/hero/escape-ship.png` (processed with
 * `--kind hero` for the 192×192 paletted-PNG profile — same shape as
 * the speeder + asteroid-hero sprites).
 *
 * Lives in a separate const from `HeroSpriteKeys` to keep the
 * climbing-hero / arcade-hero / escape-ship lineages distinct in code
 * even though they all share the on-disk `hero/` folder.
 */
export const ClimbEscapeShipKeys = {
  EscapeShip: 'escape-ship',
} as const;

/**
 * Sub-pool of `ClimbFloorBgKeys` that the random picker draws from.
 * Excludes `Fire` (floor-0-only) and (when story 13d ships) `Escape`
 * (floor-10-only). Story 13c (sprint 2.2) populated this with 16 rooms
 * — enough variety that a 10-floor round can pick all-distinct without
 * any reuse-required fallback.
 */
const CLIMB_RANDOM_FLOOR_KEYS: readonly string[] = [
  ClimbFloorBgKeys.Room1,
  ClimbFloorBgKeys.Room2,
  ClimbFloorBgKeys.Room3,
  ClimbFloorBgKeys.Room4,
  ClimbFloorBgKeys.Room5,
  ClimbFloorBgKeys.Room6,
  ClimbFloorBgKeys.Room7,
  ClimbFloorBgKeys.Room8,
  ClimbFloorBgKeys.Room9,
  ClimbFloorBgKeys.Room10,
  ClimbFloorBgKeys.Room11,
  ClimbFloorBgKeys.Room12,
  ClimbFloorBgKeys.Room13,
  ClimbFloorBgKeys.Room14,
  ClimbFloorBgKeys.Room15,
  ClimbFloorBgKeys.Room16,
  ClimbFloorBgKeys.Room17,
  ClimbFloorBgKeys.Room18,
  ClimbFloorBgKeys.Room19,
  ClimbFloorBgKeys.Room20,
] as const;

/**
 * Per-game-mode background mapping. Each `GameId` resolves to a
 * `BgSpriteKey` so `BackgroundScene` can swap the backdrop when the
 * player enters a different game. Adding a new game mode = add a row
 * here + a `BgSpriteKeys` entry above. Kept here in `spriteKeys.ts`
 * so the "which bg goes with which game" data lives next to the keys
 * it references. Declared as a Record over GameId so a future game-
 * mode addition is flagged by the TypeScript exhaustiveness check
 * (TS error: "missing property 'number-climb'") rather than silently
 * defaulting at runtime.
 */
export const GAME_BG_MAP: Readonly<Record<GameId, BgSpriteKey>> = {
  'alien-shoot': BgSpriteKeys.Nebula,
  'asteroid-field': BgSpriteKeys.AsteroidBelt,
  // Sprint 2.2 — PLACEHOLDER. Real climb-tower bg arrives via story 1
  // (asset delivery). Until then, Number Climb shares the nebula
  // backdrop so the scene can develop without a missing-texture flash.
  // Swap to `BgSpriteKeys.NumberClimbTower` (or whatever the final key
  // is named) when art lands.
  'number-climb': BgSpriteKeys.Nebula,
};

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

/**
 * Sprite kinds shipped as WebP. Sprint 2.2.1 story 6 migrated `bg`
 * (photo-like backdrops, lossy q85 — ≈88 % smaller) and `hero`
 * (sprite art, lossless WebP) off PNG; `alien` spritesheets were
 * always WebP. `ui` + `particle` + `projectile` stay PNG — those are
 * already tiny paletted sprites where WebP saves almost nothing.
 */
const WEBP_KINDS: ReadonlySet<SpriteKind> = new Set<SpriteKind>(['alien', 'bg', 'hero']);

// Function overloads: alien REQUIRES a tier; other kinds don't accept one.
export function spritePath(kind: 'alien', key: string, tier: SpriteTier): string;
export function spritePath(kind: Exclude<SpriteKind, 'alien'>, key: string): string;
/**
 * Build the URL to a shipped sprite asset.
 *
 * - For `kind === 'alien'`, includes the tier subfolder (`/128/` or `/192/`).
 *   Tier is REQUIRED.
 * - For other kinds, single resolution per kind (no tier subfolder).
 * - Extension: `.webp` for the kinds in `WEBP_KINDS` (alien / bg / hero),
 *   `.png` for the rest (ui / particle / projectile — Kenney-pack art
 *   kept as PNG, see story 6).
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
  const ext = WEBP_KINDS.has(kind) ? 'webp' : 'png';
  return `/assets/sprites/${KIND_FOLDER[kind]}/${key}.${ext}`;
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
  /**
   * Optional spritesheet frame dimensions. If present, BootScene loads
   * this entry as a spritesheet (`this.load.spritesheet(...)`); if absent,
   * loads as a single image (`this.load.image(...)`).
   *
   * All current Story 1 entries are static single-frame images and
   * leave both fields undefined. Future animated non-alien sprites
   * (e.g. a hero idle anim, particle burst sequence) would populate
   * these fields and the BootScene loop will route them to the
   * spritesheet loader automatically. The point of having the fields
   * here as `?` is so adding the first animated non-alien sprite is
   * a data change (manifest entry update), not a code change (BootScene
   * branching restructure).
   *
   * `frameHeight` defaults to `frameWidth` if omitted (square frames).
   */
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  /**
   * Sprint 2.1.6 — when this asset should be loaded. See
   * `src/core/assetScope.ts` for the taxonomy. Story 1 tags every
   * existing entry as `'eager'` (no behavior change vs. pre-sprint);
   * stories 5 + 7 re-scope per-game assets to `'game:<gameId>'` so
   * they defer until the matching game is picked.
   */
  readonly scope: AssetScope;
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
    // Sprint 2.1.6 — Alien-Shoot-only (the speeder ships); deferred to that game's preload.
    scope: 'game:alien-shoot',
  })),
  // Sprint 2.1 — Asteroid Field heroes live in the same `hero/`
  // folder on disk (single sprite kind) so we use `spritePath('hero',
  // ...)` for the URL. The separate key constant keeps them
  // type-distinct so a future game mode can't accidentally pick a
  // speeder when it wanted an asteroid hero (or vice-versa).
  ...(Object.values(AsteroidHeroSpriteKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'hero',
    key,
    url: spritePath('hero', key),
    // Sprint 2.1.6 — Asteroid-Field-only; deferred to that game's preload.
    scope: 'game:asteroid-field',
  })),
  ...(Object.values(ProjectileSpriteKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'projectile',
    key,
    url: spritePath('projectile', key),
    scope: 'eager',
  })),
  ...(Object.values(UiSpriteKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'ui',
    key,
    url: spritePath('ui', key),
    scope: 'eager',
  })),
  ...(Object.values(ParticleSpriteKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'particle',
    key,
    url: spritePath('particle', key),
    scope: 'eager',
  })),
  ...(Object.values(BgSpriteKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'bg',
    key,
    url: spritePath('bg', key),
    scope: 'eager',
  })),
  // Sprint 2.2 story 13a — Number Climb per-floor room images. Deferred
  // to the climb game's preload via `game:number-climb` scope so they
  // don't cost boot time for users who never enter Climb.
  ...(Object.values(ClimbFloorBgKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'bg',
    key,
    url: spritePath('bg', key),
    scope: 'game:number-climb',
  })),
  // Sprint 2.2 story 13e — escape ship overlay sprite. Ships in the
  // `hero/` folder (192×192 lossless WebP) but Climb-only, so deferred
  // via the same `game:number-climb` scope.
  ...(Object.values(ClimbEscapeShipKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'hero',
    key,
    url: spritePath('hero', key),
    scope: 'game:number-climb',
  })),
  // Sprint 2.4.2 hotfix — Number Climb hero skin sprites. Today this
  // is just the Space Robot (the new default climber); a second skin
  // would land here without touching the manifest derivation logic.
  // `game:number-climb` scope so the texture only transfers when the
  // kid actually picks Climb — not part of the eager boot payload.
  ...(Object.values(ClimbHeroSkinKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'hero',
    key,
    url: spritePath('hero', key),
    scope: 'game:number-climb',
  })),
  // Sprint 2.5 story 4 — Hero Chooser sprites. Eager scope: shown
  // BEFORE MenuScene (first-run picker) + on every MenuScene mount
  // (avatar). +96 KB across the 4 lossless WebPs is acceptable
  // first-load cost for a feature kids hit on every visit.
  ...(Object.values(HeroChooserKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'hero',
    key,
    url: spritePath('hero', key),
    scope: 'eager',
  })),
  // Sprint 2.1 playtest — image-variant asteroid sprites. These ship in
  // `public/assets/sprites/aliens/` (processed with `--kind alien` for
  // the 192×192 profile match) but aren't `alien` SEMANTICS
  // — they're target rocks in Asteroid Field, not enemy spritesheets.
  // Tagged as `kind: 'particle'` in the manifest because (a) the
  // SpriteManifestEntry type excludes `alien` (alien needs the
  // tier + webp + spritesheet load path), and (b) particle is the
  // closest match to "single-frame paletted PNG, no animation, no
  // tier." The kind field is only used downstream for telemetry
  // counts, so the semantic stretch doesn't affect loading. URL is
  // hardcoded to the actual on-disk path. If the image-asteroid
  // toggle survives playtest, future cleanup can promote this to a
  // proper `asteroid` sprite kind (process.mjs profile + KIND_FOLDER
  // entry + SpriteKind union expansion).
  ...(Object.values(AsteroidSpriteKeys) as string[]).map<SpriteManifestEntry>((key) => ({
    kind: 'particle',
    key,
    // Sprint 2.2.1 story 6 — migrated to lossless WebP. URL is still
    // hardcoded (these live in `aliens/` but aren't `alien`-kind, so
    // `spritePath` doesn't cover them); the extension flipped .png → .webp.
    url: `/assets/sprites/aliens/${key}.webp`,
    // Sprint 2.1.6 — Asteroid-Field-only; deferred to that game's preload.
    scope: 'game:asteroid-field',
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
export type ClimbFloorBgKey = (typeof ClimbFloorBgKeys)[keyof typeof ClimbFloorBgKeys];
export type ClimbEscapeShipKey = (typeof ClimbEscapeShipKeys)[keyof typeof ClimbEscapeShipKeys];

/**
 * Pick a random Climb floor-bg key from the randomizable sub-pool
 * (`CLIMB_RANDOM_FLOOR_KEYS`). Excludes the floor-0-only `Fire` key
 * (and `Escape` once story 13d ships).
 *
 * Story 13c — accepts an optional `exclusions` array of keys already
 * used in the current round. The picker excludes those from the
 * candidate pool so a 10-floor round shows 10 distinct rooms. With
 * 16 keys in the pool and 10 picks per round, distinctness is always
 * achievable; if the caller ever passes exclusions covering every
 * pool entry (defensive — shouldn't happen in production), we fall
 * back to picking from the full pool so the call doesn't deadlock.
 *
 * RNG-injectable for deterministic tests (mirrors
 * `pickRandomAsteroidSpriteKey`).
 */
export function pickRandomClimbFloorBgKey(
  rng: () => number = Math.random,
  exclusions: readonly string[] = [],
): ClimbFloorBgKey {
  const exclSet = new Set(exclusions);
  const available = CLIMB_RANDOM_FLOOR_KEYS.filter((k) => !exclSet.has(k));
  const pool = available.length > 0 ? available : CLIMB_RANDOM_FLOOR_KEYS;
  return pool[Math.floor(rng() * pool.length)]! as ClimbFloorBgKey;
}

/** Union over every non-alien sprite key. Aliens use plain `string` keys due to dynamic derivation. */
export type NonAlienSpriteKey =
  | HeroSpriteKey
  | ProjectileSpriteKey
  | UiSpriteKey
  | ParticleSpriteKey
  | BgSpriteKey
  | ClimbFloorBgKey
  | ClimbEscapeShipKey;
