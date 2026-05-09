// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';

/**
 * Wires Esc on a menu scene to a "go back" callback, with paired cleanup on
 * scene shutdown so handlers don't accumulate across navigation. The pattern
 * is small but repeated: three scenes use it. Centralizing here means one
 * shutdown-leak fix benefits all callers.
 *
 * Usage from a scene's `create()`:
 *
 *   wireEscBack(this, () => this.scene.start(SceneKeys.GameSelect));
 *
 * The handler is registered with `on` (not `once`) so a kid pressing Esc
 * multiple times mid-navigation never strands the scene without a back
 * route. Cleanup runs in `shutdown` AND `destroy` because Phaser fires
 * those at different points across the scene lifecycle.
 */
export function wireEscBack(scene: Phaser.Scene, onBack: () => void): void {
  if (!scene.input.keyboard) {
    // Test environments may lack the keyboard plugin.
    return;
  }
  const handler = (): void => onBack();
  scene.input.keyboard.on('keydown-ESC', handler);

  const cleanup = (): void => {
    scene.input.keyboard?.off('keydown-ESC', handler);
  };
  scene.events.once('shutdown', cleanup);
  scene.events.once('destroy', cleanup);
}
