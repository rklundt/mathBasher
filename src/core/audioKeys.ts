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
  /**
   * Sprint 2.5.4 — Math-a-lotl correct-catch pops. Three variants,
   * picked at random per catch (`pickRandomBubblePopSfx`) for the same
   * anti-repetition reason as the hit-correct set.
   */
  BubblePop1: 'bubble-pop-1',
  BubblePop2: 'bubble-pop-2',
  BubblePop3: 'bubble-pop-3',
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

const BUBBLE_POP_KEYS = ['bubble-pop-1', 'bubble-pop-2', 'bubble-pop-3'] as const;

/** Sprint 2.5.4 — random Math-a-lotl correct-catch pop. */
export function pickRandomBubblePopSfx(
  rng: () => number = Math.random,
): (typeof BUBBLE_POP_KEYS)[number] {
  return BUBBLE_POP_KEYS[Math.floor(rng() * BUBBLE_POP_KEYS.length)];
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
  /**
   * Number Climb (ships as "Space Escape!") atmospheric loop —
   * crackling fire under a quiet emergency klaxon. Matches the
   * burning-station escape premise. ~10s mono loop, encoded with
   * `--no-trim` (default for midground) so the boundary stays clean,
   * and `--loudnorm-target -26 LUFS` (4 dB quieter than the midground
   * default of -22) so the attention-grabbing klaxon stays in the
   * BACKGROUND rather than competing with foreground SFX. Sprint 2.2 —
   * replaces the Skittering1 placeholder.
   */
  FireKlaxon1: 'fire-klaxon-1',
  /**
   * Math-a-lotl's two water-ambience loops (sprint 2.5.4). They play
   * TOGETHER, layered — the 10 s loops are different recordings, so
   * the pair never sounds like one short loop repeating.
   */
  Underwater1: 'underwater-1',
  Underwater2: 'underwater-2',
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
  /**
   * Number Climb (ships as "Space Escape!") gameplay loop. ~16s
   * stereo music track encoded with the default music profile
   * (160 kbps stereo, -18 LUFS). Layered over the FireKlaxon1
   * midground + foreground SFX (hatch, click). Sprint 2.2 — replaces
   * the Loop1 placeholder. File name `game-background-song-loop-4`
   * follows the user's personal music-library numbering convention,
   * not the legacy `loop-N` shipped-file series (1/2/3 are Alien Shoot
   * / orphan / Asteroid Field respectively).
   */
  EscapeLoop1: 'game-background-song-loop-4',
  /**
   * Math-a-lotl gameplay loop (sprint 2.5.4). ~20 s stereo, encoded
   * `--kind music --no-trim` for a clean loop seam. Played quieter
   * than the water ambience via `AUDIO_GAIN` below.
   */
  ReefLoop1: 'loop-5',
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
  // Sprint 2.2 — escape-tower climb music. Replaced the Loop1
  // placeholder once the real Climb track arrived.
  'number-climb': MusicKeys.EscapeLoop1,
  'math-a-lotl': MusicKeys.ReefLoop1,
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
export const GAME_MIDGROUND_MAP: Readonly<Record<GameId, readonly MidgroundKey[]>> = {
  'alien-shoot': [MidgroundKeys.Skittering1],
  'asteroid-field': [MidgroundKeys.SpaceNoises1],
  // Sprint 2.2 — fire-klaxon ambient matches the burning-station
  // escape premise. Replaced the Skittering1 placeholder once the
  // real Climb midground arrived.
  'number-climb': [MidgroundKeys.FireKlaxon1],
  // Sprint 2.5.4 — two water loops layered (the map value became a
  // list so a game can play more than one ambience loop at once).
  'math-a-lotl': [MidgroundKeys.Underwater1, MidgroundKeys.Underwater2],
};

/**
 * Sprint 2.5.4 — per-asset playback gain (0..1), multiplied into the
 * kind's slider volume. Lets one game balance its own mix without
 * re-encoding: Math-a-lotl's music sits BELOW its water ambience,
 * which sits below the pops (gain 1, the default). The player's volume
 * sliders and mute still apply on top. Keys not listed play at 1.
 */
export const AUDIO_GAIN: Readonly<Partial<Record<AudioKey, number>>> = {
  [MusicKeys.ReefLoop1]: 0.45,
  [MidgroundKeys.Underwater1]: 0.7,
  [MidgroundKeys.Underwater2]: 0.7,
};

/** Playback gain for an asset key (1 when not listed in `AUDIO_GAIN`). */
export function audioGainFor(key: string): number {
  return (AUDIO_GAIN as Readonly<Record<string, number | undefined>>)[key] ?? 1;
}

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
  // Sprint 2.5.4 — TimeoutFail1 is shared by Asteroid Field and
  // Math-a-lotl (a scope names one game), so it moved to eager (~7 KB).
  if (key === SfxKeys.TimeoutFail1) return 'eager';
  if (key === MusicKeys.Loop3) return 'game:asteroid-field';
  if (key === MidgroundKeys.SpaceNoises1) return 'game:asteroid-field';
  // Sprint 2.2 — Number Climb-only ambient + music + SFX assets.
  if (key === SfxKeys.HatchOpen1) return 'game:number-climb';
  if (key === MidgroundKeys.FireKlaxon1) return 'game:number-climb';
  if (key === MusicKeys.EscapeLoop1) return 'game:number-climb';
  // Sprint 2.5.4 — Math-a-lotl-only music, ambience and pops.
  if (key === MusicKeys.ReefLoop1) return 'game:math-a-lotl';
  if (key === MidgroundKeys.Underwater1) return 'game:math-a-lotl';
  if (key === MidgroundKeys.Underwater2) return 'game:math-a-lotl';
  if (key === SfxKeys.BubblePop1 || key === SfxKeys.BubblePop2 || key === SfxKeys.BubblePop3) {
    return 'game:math-a-lotl';
  }
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
