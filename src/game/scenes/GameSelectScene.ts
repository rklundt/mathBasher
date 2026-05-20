// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';

/**
 * Game-mode selection. Three tiles as of sprint 2.2 (Alien Shoot,
 * Asteroid Field, Number Climb). The layout scales with game-mode
 * count — a 4th tile arriving would either bump tile widths down or
 * shift to a 2×2 grid. For now a single horizontal row at the
 * canonical tile dimensions reads cleanly with 20px gaps.
 */
export class GameSelectScene extends Phaser.Scene {
  static readonly key = SceneKeys.GameSelect;

  constructor() {
    super(GameSelectScene.key);
  }

  create(): void {
    setupScene(this);

    const { width, height } = this.scale;
    const cx = width / 2;

    text(this, cx, height * 0.18, 'Pick a Game', 'h2').setOrigin(0.5);

    // Three tiles in a row: cx - 340, cx, cx + 340.
    // tileW (320) + 20 gap = 340 center-spacing keeps the gap visible.
    const TILE_W = 320;
    const TILE_H = 200;
    const TILE_GAP = 20;
    const tileCenterSpacing = TILE_W + TILE_GAP;
    const tileY = height * 0.5;

    // Tile 1: Alien Shoot — the original lane-drop gameplay.
    const alienShoot = new PlaceholderButton({
      scene: this,
      x: cx - tileCenterSpacing,
      y: tileY,
      width: TILE_W,
      height: TILE_H,
      label: 'Alien Shoot',
      subtitle: 'Aliens carry answers. Shoot the right one.',
      onClick: () => {
        Settings.setGameId('alien-shoot');
        this.scene.start(SceneKeys.Difficulty);
      },
    });

    // Tile 2: Asteroid Field — sprint 2.1's free-aim mode.
    const asteroidField = new PlaceholderButton({
      scene: this,
      x: cx,
      y: tileY,
      width: TILE_W,
      height: TILE_H,
      label: 'Asteroid Field',
      subtitle: 'Aim at floating asteroids. Beat the timer.',
      onClick: () => {
        Settings.setGameId('asteroid-field');
        this.scene.start(SceneKeys.Difficulty);
      },
    });

    // Tile 3: Number Climb — sprint 2.2 vertical climbing mode.
    const numberClimb = new PlaceholderButton({
      scene: this,
      x: cx + tileCenterSpacing,
      y: tileY,
      width: TILE_W,
      height: TILE_H,
      label: 'Space Escape!',
      subtitle: 'Climb to escape the burning station.',
      onClick: () => {
        Settings.setGameId('number-climb');
        this.scene.start(SceneKeys.Difficulty);
      },
    });

    const back = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.85,
      width: 200,
      height: 56,
      label: 'Back',
      onClick: () => this.scene.start(SceneKeys.Menu),
    });

    new KeyboardNavigator(this, [alienShoot, asteroidField, numberClimb, back]);

    // Esc returns to the previous step in the menu stack.
    wireEscBack(this, () => this.scene.start(SceneKeys.Menu));
  }
}
