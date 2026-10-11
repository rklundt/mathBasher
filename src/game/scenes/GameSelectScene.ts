// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings, type GameId } from '@/services/Settings';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';

/**
 * Game-mode selection. Four tiles as of sprint 2.5.4 (Alien Shoot,
 * Asteroid Field, Space Escape!, Math-a-lotl) in a 2×2 grid — a single
 * row stopped fitting at four. A fifth game would add a third row or
 * shrink the tiles.
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

    // Top-right mute icon — matches MenuScene + HudScene placement so
    // the affordance is in the same spot every screen.
    createMuteIconButton(this, width - 16 - 22, 16 + 18);

    // Sprint 2.5.4 — four games in a 2×2 grid (three 320-wide tiles in
    // a row no longer fit a fourth on the 1280 canvas). Columns at
    // cx ± (TILE_W + TILE_GAP) / 2, rows at tileY ± (TILE_H + TILE_GAP) / 2;
    // the grid stays clear of the title above and Back below.
    const TILE_W = 440;
    const TILE_H = 150;
    const TILE_GAP = 20;
    const colOffset = (TILE_W + TILE_GAP) / 2;
    const rowOffset = (TILE_H + TILE_GAP) / 2;
    const tileY = height * 0.5;

    const tile = (
      col: -1 | 1,
      row: -1 | 1,
      label: string,
      subtitle: string,
      gameId: GameId,
    ): PlaceholderButton =>
      new PlaceholderButton({
        scene: this,
        x: cx + col * colOffset,
        y: tileY + row * rowOffset,
        width: TILE_W,
        height: TILE_H,
        label,
        subtitle,
        onClick: () => {
          Settings.setGameId(gameId);
          this.scene.start(SceneKeys.Difficulty);
        },
      });

    // Alien Shoot (the original lane-drop gameplay), Asteroid Field
    // (sprint 2.1 free-aim), Space Escape! (sprint 2.2 climb), and
    // Math-a-lotl (sprint 2.5.4 underwater bubbles).
    const alienShoot = tile(-1, -1, 'Alien Shoot', 'Aliens carry answers. Shoot the right one.', 'alien-shoot');
    const asteroidField = tile(1, -1, 'Asteroid Field', 'Aim at floating asteroids. Beat the timer.', 'asteroid-field');
    const numberClimb = tile(-1, 1, 'Space Escape!', 'Climb to escape the burning station.', 'number-climb');
    const mathALotl = tile(1, 1, 'Math-a-lotl', 'Help the axolotl catch the right bubble.', 'math-a-lotl');

    const back = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.85,
      width: 200,
      height: 56,
      label: 'Back',
      onClick: () => this.scene.start(SceneKeys.Menu),
    });

    new KeyboardNavigator(this, [alienShoot, asteroidField, numberClimb, mathALotl, back]);

    // Esc returns to the previous step in the menu stack.
    wireEscBack(this, () => this.scene.start(SceneKeys.Menu));
  }
}
