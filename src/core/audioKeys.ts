// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { GameId } from '@/services/Settings';
import type { AssetScope } from '@/core/assetScope';

/**
 * Stable string keys for every preloadable audio asset. Mirrors the
 * `sceneKeys.ts` pattern: every reference to an audio asset goes through
 * a constant here so a typo doesn't silently fall through to a runtime
 * "key not found" warning.
 *
 * Three flat const objects — one per audio kind — with parallel naming
 * (`SfxKeys` / `MidgroundKeys` / `MusicKeys`). The `AudioKey` union type
 * spans all three so anywhere in code that takes "any audio key" is
 * statically constrained to actual existing keys.
 *
 * Asset URL paths are derived from these keys via `sfxPath`/`midgroundPath`/
 * `musicPath` helpers so call sites read `loadSfx(SfxKeys.Fire1)` not
 * `'/assets/audio/sfx/fire-1.mp3'`.
 */
export const SfxKeys = {
  Fire1: 'fire-1',
  Fire2: 'fire-2',
  ButtonClick1: 'button-click-1',
  // Hit-feedback SFX added in sprint 0.7 Story 14. Three variants each
  // for correct + wrong so the same exact sound doesn't play 20 times
  // in a row — gets grating fast. `pickRandomHitCorrectSfx` /
  // `pickRandomHitWrongSfx` below select uniformly per hit.
  HitCorrect1: 'hit-correct-1',
  HitCorrect2: 'hit-correct-2',
  HitCorrect3: 'hit-correct-3',
  HitWrong1: 'hit-wrong-1',
  HitWrong2: 'hit-wrong-2',
  HitWrong3: 'hit-wrong-3',
  // Sprint 2.1 playtest — Asteroid Field timeout SFX. Plays when the
  // per-question countdown reaches zero before the player hits the
  // correct asteroid. Audible "you ran out of time" cue lets the
  // player register the failure before the next question's wave
  // spawns. Not used by Alien Shoot (which has the alien-reaches-hero
  // death animation as its own failure cue).
  TimeoutFail1: 'timeout-fail-1',
  /**
   * Sprint 2.2 — Number Climb floor-advance cue. Plays ~150 ms after
   * the hero lands on a new floor: a short pneumatic-hiss + metallic-
   * click "space hatch sliding open" sound. Gives an audible "you've
   * entered the next room" beat to complement the already-existing
   * jump click. NOT played on the final escape floor (the escape ship
   * blast is that floor's audio cue).
   */
  HatchOpen1: 'hatch-open-1',
} as const;

/**
 * Pick a random correct-hit SFX from the 3 variants. Added in sprint 0.7
 * Story 14 — audio variety prevents the same "ding" playing 20× per round.
 * Uniform random over the 3 variants; uses Math.random for simplicity
 * (consistent with `pickRandomAlienSpriteKey`). A seeded RNG could be
 * substituted later if tournament/replay determinism becomes important.
 */
const HIT_CORRECT_KEYS = ['hit-correct-1', 'hit-correct-2', 'hit-correct-3'] as const;
const HIT_WRONG_KEYS = ['hit-wrong-1', 'hit-wrong-2', 'hit-wrong-3'] as const;

// Sprint 0.7 Story 13 — RNG injection (optional) for tournament/replay
// determinism. Defaults to Math.random; production callers don't need
// to pass anything.
export function pickRandomHitCorrectSfx(
  rng: () => number = Math.random,
): (typeof HIT_CORRECT_KEYS)[number] {
  return HIT_CORRECT_KEYS[Math.floor(rng() * HIT_CORRECT_KEYS.length)];
}

export function pickRandomHitWrongSfx(
  rng: () => number = Math.random,
): (typeof HIT_WRONG_KEYS)[number] {
  return HIT_WRONG_KEYS[Math.floor(rng() * HIT_WRONG_KEYS.length)];
}

/** Atmospheric loop keys (midground kind — see encoder profile). */
export const MidgroundKeys = {
  /**
   * Alien Shoot's hero-running ambient loop. Sprint 0.5.3 first wired
   * this; pre-2.1.9 it was hard-coded into both game scenes (wrong
   * for Asteroid Field, which has no skittering-hero gameplay
   * concept). Now mapped per-gameId via `GAME_MIDGROUND_MAP`.
   */
  Skittering1: 'skittering-1',
  /**
   * Asteroid Field's ambient space-noises loop. Sprint 2.1.9 — first
   * per-game-mode midground asset, fixing the "Asteroid Field plays
   * a skittering loop with no skittering happening" mismatch. 6s
   * mono loop encoded with `--no-trim` so the loop boundary stays
   * clean.
   */
  SpaceNoises1: 'space-noises-1',
} as const;

/** Music loop keys. */
export const MusicKeys = {
  /**
   * Alien Shoot gameplay loop + default menu/non-game music.
   * Sprint 0.5.3 first wired this in `loop-1.mp3`.
   */
  Loop1: 'loop-1',
  /**
   * Asteroid Field gameplay loop. Sprint 2.1.5 — first per-game-mode
   * music track. 30-second loop encoded through `pnpm audio:encode
   * --kind music --no-trim` (the `--no-trim` flag preserves clean
   * loop boundaries that the default trim pass could clip into).
   *
   * `loop-2.mp3` exists on disk but is orphaned from earlier
   * processing — not in this key registry, not loaded by BootScene.
   * Future cleanup may either wire it as an alt-track or remove it.
   */
  Loop3: 'loop-3',
} as const;

export type SfxKey = (typeof SfxKeys)[keyof typeof SfxKeys];
export type MidgroundKey = (typeof MidgroundKeys)[keyof typeof MidgroundKeys];
export type MusicKey = (typeof MusicKeys)[keyof typeof MusicKeys];
export type AudioKey = SfxKey | MidgroundKey | MusicKey;

/**
 * Per-game-mode music mapping. Parallels `GAME_BG_MAP` in
 * `spriteKeys.ts`: each `GameId` resolves to a `MusicKey` so each
 * game scene can play its own background loop without hard-coding
 * the key at the call site. Sprint 2.1.5 — first per-game audio
 * identity. Adding a new game mode = add a row here + a `MusicKeys`
 * entry above. Declared as `Record<GameId, MusicKey>` so a future
 * GameId addition without a music map gets flagged at compile time
 * (TS error: "missing property 'number-climb'").
 *
 * Unlike `GAME_BG_MAP` (consumed by the persistent `BackgroundScene`
 * via `Settings.onGameIdChange`), this map is consumed by individual
 * game scenes at `create` time. Game scenes already know their own
 * gameId, so no observer pattern is needed — they just read the map
 * directly.
 */
export const GAME_MUSIC_MAP: Readonly<Record<GameId, MusicKey>> = {
  'alien-shoot': MusicKeys.Loop1,
  'asteroid-field': MusicKeys.Loop3,
  // Sprint 2.2 — PLACEHOLDER. Real climb music arrives via story 1
  // (asset delivery). Until then, Number Climb shares Alien Shoot's
  // loop-1 so the scene can develop without an asset-missing crash.
  // Swap to `MusicKeys.Loop4` (or final key) when art lands.
  'number-climb': MusicKeys.Loop1,
};

/**
 * Sprint 2.1.9 — per-game midground (ambient under-SFX loop). Parallels
 * `GAME_MUSIC_MAP`. Lifted because v2.1.8 hard-coded
 * `MidgroundKeys.Skittering1` for BOTH games even though "skittering"
 * is an Alien-Shoot-hero concept that has no place in Asteroid Field
 * (which now plays an ambient space-noises loop). Same TypeScript
 * exhaustiveness guarantees as the music map — adding a new GameId
 * forces a compile-time decision on which midground it plays.
 */
export const GAME_MIDGROUND_MAP: Readonly<Record<GameId, MidgroundKey>> = {
  'alien-shoot': MidgroundKeys.Skittering1,
  'asteroid-field': MidgroundKeys.SpaceNoises1,
  // Sprint 2.2 — PLACEHOLDER. Real climb-ambient loop arrives via
  // story 1 (asset delivery). Until then, Number Climb shares Alien
  // Shoot's skittering-1 — yes, this is the same "wrong loop for the
  // wrong mode" problem 2.1.9 fixed for Asteroid Field; it's a
  // deliberate temporary state, NOT a regression of the per-game-
  // midground architecture. Swap to `MidgroundKeys.ClimbAmbient1` (or
  // final key) when art lands.
  'number-climb': MidgroundKeys.Skittering1,
};

/**
 * Build the URL to a shipped audio file. Phaser's loader accepts URL strings
 * relative to the document root; Vite serves `public/` at the root in both
 * dev and production builds, so `/assets/audio/<kind>/<key>.mp3` resolves
 * the same in both modes.
 */
export function sfxPath(key: SfxKey): string {
  return `/assets/audio/sfx/${key}.mp3`;
}

export function midgroundPath(key: MidgroundKey): string {
  return `/assets/audio/midground/${key}.mp3`;
}

export function musicPath(key: MusicKey): string {
  return `/assets/audio/music/${key}.mp3`;
}

/**
 * Single source of truth for every audio asset the game preloads at boot.
 *
 * Derived programmatically from the three keys-per-kind const objects + the
 * matching path helpers, so adding a new sound is a 1-line edit here in
 * `audioKeys.ts` — no second change needed in `BootScene`. Pre-refactor
 * (sprint 0.5.5) `BootScene.preload` hand-paired every key with its path
 * helper, and the comment claiming "single source of truth" was aspirational
 * (the list lived in BootScene). Now `BootScene.preload` just iterates this
 * manifest with no per-kind branching.
 *
 * The `kind` field is currently unused at preload (Phaser's `load.audio` is
 * kind-agnostic) but kept on every entry so future code that wants to
 * iterate "every SFX key" or "every loopable asset" can filter by kind
 * without re-deriving from the source const objects.
 */
export interface AudioManifestEntry {
  readonly key: AudioKey;
  readonly kind: 'sfx' | 'midground' | 'music';
  readonly url: string;
  /**
   * Sprint 2.1.6 — when this asset should be loaded. See
   * `src/core/assetScope.ts` for the taxonomy. Story 1 tags every
   * existing entry as `'eager'` (no behavior change vs. pre-sprint);
   * story 5 re-scopes Asteroid-Field-only audio (`loop-3`,
   * `timeout-fail-1`) to `'game:asteroid-field'` so it defers until
   * the matching game is picked.
   */
  readonly scope: AssetScope;
}

/**
 * Per-key audio scope resolver. Sprint 2.1.6 — most audio is shared
 * across games (button-click, hit/wrong SFX, the Alien Shoot loop)
 * and stays `'eager'`. A small allowlist of per-game audio
 * (`timeout-fail-1` is Asteroid-Field-only; `loop-3` is the AF
 * music) defers to `'game:asteroid-field'`. Default keeps the
 * shared-audio behavior unchanged.
 *
 * Add a new per-game audio asset = add a row here. The function
 * shape (rather than a `Partial<Record<AudioKey, AssetScope>>` map)
 * makes the per-key logic readable AND lets a future scope rule
 * dispatch on something other than the key (e.g. file size).
 */
function audioScopeFor(key: AudioKey): AssetScope {
  if (key === SfxKeys.TimeoutFail1) return 'game:asteroid-field';
  if (key === MusicKeys.Loop3) return 'game:asteroid-field';
  if (key === MidgroundKeys.SpaceNoises1) return 'game:asteroid-field';
  // Sprint 2.2 — Number Climb floor-advance hatch SFX. Climb-only.
  if (key === SfxKeys.HatchOpen1) return 'game:number-climb';
  return 'eager';
}

export const AUDIO_MANIFEST: ReadonlyArray<AudioManifestEntry> = [
  ...Object.values(SfxKeys).map<AudioManifestEntry>((key) => ({
    key,
    kind: 'sfx',
    url: sfxPath(key),
    scope: audioScopeFor(key),
  })),
  ...Object.values(MidgroundKeys).map<AudioManifestEntry>((key) => ({
    key,
    kind: 'midground',
    url: midgroundPath(key),
    scope: audioScopeFor(key),
  })),
  ...Object.values(MusicKeys).map<AudioManifestEntry>((key) => ({
    key,
    kind: 'music',
    url: musicPath(key),
    scope: audioScopeFor(key),
  })),
];
