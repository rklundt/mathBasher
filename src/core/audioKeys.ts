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
} as const;

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
