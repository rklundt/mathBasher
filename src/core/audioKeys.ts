// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

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

export function pickRandomHitCorrectSfx(): (typeof HIT_CORRECT_KEYS)[number] {
  return HIT_CORRECT_KEYS[Math.floor(Math.random() * HIT_CORRECT_KEYS.length)];
}

export function pickRandomHitWrongSfx(): (typeof HIT_WRONG_KEYS)[number] {
  return HIT_WRONG_KEYS[Math.floor(Math.random() * HIT_WRONG_KEYS.length)];
}

/** Atmospheric loop keys (midground kind — see encoder profile). */
export const MidgroundKeys = {
  Skittering1: 'skittering-1',
} as const;

/** Music loop keys. */
export const MusicKeys = {
  Loop1: 'loop-1',
} as const;

export type SfxKey = (typeof SfxKeys)[keyof typeof SfxKeys];
export type MidgroundKey = (typeof MidgroundKeys)[keyof typeof MidgroundKeys];
export type MusicKey = (typeof MusicKeys)[keyof typeof MusicKeys];
export type AudioKey = SfxKey | MidgroundKey | MusicKey;

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
}

export const AUDIO_MANIFEST: ReadonlyArray<AudioManifestEntry> = [
  ...Object.values(SfxKeys).map<AudioManifestEntry>((key) => ({
    key,
    kind: 'sfx',
    url: sfxPath(key),
  })),
  ...Object.values(MidgroundKeys).map<AudioManifestEntry>((key) => ({
    key,
    kind: 'midground',
    url: midgroundPath(key),
  })),
  ...Object.values(MusicKeys).map<AudioManifestEntry>((key) => ({
    key,
    kind: 'music',
    url: musicPath(key),
  })),
];
