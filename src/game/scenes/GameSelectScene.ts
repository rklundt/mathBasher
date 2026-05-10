// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { getAudioManager } from '@/services/audioManagerFactory';

/**
 * Game-mode selection. MVP has one real tile (Alien Shoot) plus at least one
 * disabled "Coming soon" tile so the layout obviously supports more — adding
 * a second game mode later means swapping a disabled tile to enabled, no
 * layout rewrite.
 */
export class GameSelectScene extends Phaser.Scene {
  static readonly key = SceneKeys.GameSelect;

  constructor() {
    super(GameSelectScene.key);
  }

  create(): void {
    _th.logToAi('GameSelectScene Started', SeverityLevel.Information);

    // Re-bind the AudioManager to THIS scene before any button is built.
    // The previous scene (MenuScene) was `scene.start()`-ed away from and
    // is now shut down; PlaceholderButton's pointerdown SFX call would
    // ride on a stale scene reference and the first click here would be
    // silent. Every scene that creates buttons must re-init at the top
    // of create() — defense-in-depth for the click-SFX contract.
    getAudioManager().init(this);

    const { width, height } = this.scale;
    const cx = width / 2;

    this.add
      .text(cx, height * 0.18, 'Pick a Game', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '40px',
        color: '#eaeaf2',
      })
      .setOrigin(0.5);

    // Active tile.
    const alienShoot = new PlaceholderButton({
      scene: this,
      x: cx - 180,
      y: height * 0.5,
      width: 320,
      height: 200,
      label: 'Alien Shoot',
      subtitle: 'Aliens carry answers. Shoot the right one.',
      onClick: () => {
        Settings.setGameId('alien-shoot');
        this.scene.start(SceneKeys.Difficulty);
      },
    });

    // Disabled "soon" tile so the layout obviously supports more game modes.
    const comingSoon = new PlaceholderButton({
      scene: this,
      x: cx + 180,
      y: height * 0.5,
      width: 320,
      height: 200,
      label: 'Coming soon',
      subtitle: 'More game modes are on the way.',
      disabled: true,
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

    new KeyboardNavigator(this, [alienShoot, comingSoon, back]);

    // Esc returns to the previous step in the menu stack.
    wireEscBack(this, () => this.scene.start(SceneKeys.Menu));

    _th.logToAi('GameSelectScene Completed', SeverityLevel.Information);
  }
}
