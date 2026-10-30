// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { screenNamesShown } from '@/core/screenNames';

/** Above everything a menu screen draws (panels, popups). */
const TAG_DEPTH = 10_000;

/**
 * Sprint 2.15 — a small "DEV · GameChooserScene · math groups" tag in the
 * bottom-left corner, so the owner can name the screen they're looking at.
 * Shown locally and on the dev site only (`screenNamesShown`); every menu
 * screen calls this, game screens don't.
 */
export function addScreenTag(scene: Phaser.Scene, name: string): Phaser.GameObjects.Text | null {
  if (!screenNamesShown(import.meta.env)) return null;
  const tag = scene.add.text(10, scene.scale.height - 6, `DEV · ${name}`, {
    fontFamily: 'ui-monospace, Consolas, monospace',
    fontSize: '14px',
    color: '#93c5fd',
    backgroundColor: '#050814cc',
    padding: { x: 8, y: 2 },
  });
  return tag.setOrigin(0, 1).setDepth(TAG_DEPTH).setScrollFactor(0);
}
