// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Stable string keys for every preloadable audio asset. Mirrors the
 * `sceneKeys.ts` pattern: every reference to an audio asset goes through
 * a constant here so a typo doesn't silently fall through to a runtime
 * "key not found" warning.
 *
 * Asset URL paths are derived from these keys via `audioPath()` so call
 * sites read `loadSfx(AudioKeys.Fire1)` not `'fire-1.mp3'`.
 */
export const AudioKeys = {
  Fire1: 'fire-1',
  Fire2: 'fire-2',
} as const;

export type AudioKey = (typeof AudioKeys)[keyof typeof AudioKeys];

/**
 * Build the URL to a shipped SFX file. Phaser's loader accepts URL strings
 * relative to the document root; Vite serves `public/` at the root in both
 * dev and production builds, so `/assets/audio/sfx/<key>.mp3` resolves
 * the same in both modes.
 */
export function sfxPath(key: AudioKey): string {
  return `/assets/audio/sfx/${key}.mp3`;
}
