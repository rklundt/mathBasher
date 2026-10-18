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
 * Game-mode selection. Seven tiles as of sprint 2.7 (Alien Shoot, Asteroid
 * Field, Space Escape!, Math-a-lotl, Frog Splash, Space Shooter, Penguin
 * Slide): four on top, three centred below.
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

    // Sprint 2.5.6 — higher (was 0.18) to clear the three-row grid.
    text(this, cx, height * 0.12, 'Pick a Game', 'h2').setOrigin(0.5);

    // Top-right mute icon — matches MenuScene + HudScene placement so
    // the affordance is in the same spot every screen.
    createMuteIconButton(this, width - 16 - 22, 16 + 18);

    // Sprint 2.8 — eight games: two rows of four (sprint 2.7 had 4 + 3).
    // Tiles stay 120 tall (big enough to tap on a phone; the subtitle may
    // wrap to two lines inside), 280 wide so four fit across.
    const TILE_W = 280;
    const TILE_H = 120;
    const TILE_GAP = 14;
    const colStep = TILE_W + TILE_GAP;
    const rowStep = TILE_H + TILE_GAP;
    const tileY = height * 0.5;

    const tile = (row: 0 | 1, col: number, label: string, subtitle: string, gameId: GameId): PlaceholderButton => {
      const perRow = 4;
      return new PlaceholderButton({
        scene: this,
        x: cx + (col - (perRow - 1) / 2) * colStep,
        y: tileY + (row - 0.5) * rowStep,
        width: TILE_W,
        height: TILE_H,
        label,
        subtitle,
        onClick: () => {
          Settings.setGameId(gameId);
          this.scene.start(SceneKeys.Difficulty);
        },
      });
    };

    // Alien Shoot (the original lane-drop gameplay), Asteroid Field
    // (sprint 2.1 free-aim), Space Escape! (sprint 2.2 climb), Math-a-lotl
    // (sprint 2.5.4 underwater bubbles), Frog Splash (sprint 2.5.6 river
    // hop), Space Shooter (sprint 2.6 cockpit window), Penguin Slide
    // (sprint 2.7 snowy hill) and Bunny Garden (sprint 2.8 carrot patch).
    const alienShoot = tile(0, 0, 'Alien Shoot', 'Aliens carry answers. Shoot the right one.', 'alien-shoot');
    const asteroidField = tile(0, 1, 'Asteroid Field', 'Aim at floating asteroids. Beat the timer.', 'asteroid-field');
    const numberClimb = tile(0, 2, 'Space Escape!', 'Climb to escape the burning station.', 'number-climb');
    const mathALotl = tile(0, 3, 'Math-a-lotl', 'Help the axolotl catch the right bubble.', 'math-a-lotl');
    const frogSplash = tile(1, 0, 'Frog Splash', 'Hop across the river on the right lily pads.', 'frog-splash');
    const spaceShooter = tile(1, 1, 'Space Shooter', 'From your cockpit, blast the right alien ship.', 'space-shooter');
    const penguinSlide = tile(1, 2, 'Penguin Slide', 'Slide down and catch the right fish.', 'penguin-slide');
    const bunnyGarden = tile(1, 3, 'Bunny Garden', 'Tap the carrot with the right answer.', 'bunny-garden');

    const back = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.85,
      width: 200,
      height: 56,
      label: 'Back',
      onClick: () => this.scene.start(SceneKeys.Menu),
    });

    new KeyboardNavigator(this, [
      alienShoot,
      asteroidField,
      numberClimb,
      mathALotl,
      frogSplash,
      spaceShooter,
      penguinSlide,
      bunnyGarden,
      back,
    ]);

    // Esc returns to the previous step in the menu stack.
    wireEscBack(this, () => this.scene.start(SceneKeys.Menu));
  }
}
