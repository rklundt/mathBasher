// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Stable string keys for every Phaser scene in the app. Use these constants
 * everywhere — never hand-write the string `'menu'` in a `scene.start(...)`
 * call, because a typo silently sends you nowhere.
 *
 * `Attribution` runs in parallel with every other non-Boot scene; the rest
 * are mutually exclusive (one active at a time).
 */
export const SceneKeys = {
  Boot: 'boot',
  Menu: 'menu',
  GameSelect: 'game-select',
  Difficulty: 'difficulty',
  Game: 'game',
  Hud: 'hud',
  GameOver: 'game-over',
  Attribution: 'attribution',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
