// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { getAudioManager } from '@/services/audioManagerFactory';
import type { SettingsSceneInit } from '@/game/scenes/SettingsScene';

/**
 * Title screen. Two actions: Start (-> GameSelect) and High Scores
 * (placeholder modal until the score-store UI lands).
 *
 * Polish (real fonts, parallax stars, button art) is sprint 0.7's job; this
 * scene's contract is just "navigate correctly."
 */
export class MenuScene extends Phaser.Scene {
  static readonly key = SceneKeys.Menu;

  constructor() {
    super(MenuScene.key);
  }

  create(): void {
    _th.logToAi('MenuScene Started', SeverityLevel.Information);

    const { width, height } = this.scale;
    const cx = width / 2;

    this.add
      .text(cx, height * 0.22, 'mathBasher', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '64px',
        color: '#eaeaf2',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, height * 0.32, 'Math, but with aliens.', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#9ca3af',
      })
      .setOrigin(0.5);

    const startButton = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.5,
      width: 280,
      height: 64,
      label: 'Start',
      onClick: () => {
        // Bind the AudioManager to a scene from inside this user-gesture
        // handler. iOS Safari blocks WebAudioContext creation outside a
        // gesture; calling AudioManager.init() from BootScene works on
        // Chrome/Firefox but silently fails on iOS, leaving the kid pressing
        // fire forever in silence. Wiring the bind to the first Start
        // click is the canonical fix and idempotent — repeated Starts just
        // re-bind to the same audio engine.
        getAudioManager().init(this);
        this.scene.start(SceneKeys.GameSelect);
      },
    });

    const highScoresButton = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.62,
      width: 280,
      height: 64,
      label: 'High Scores',
      onClick: () => this.showHighScoresPlaceholder(),
    });

    const settingsButton = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.74,
      width: 280,
      height: 56,
      label: 'Settings',
      onClick: () => this.openSettings(),
    });

    new KeyboardNavigator(this, [startButton, highScoresButton, settingsButton]);

    _th.logToAi('MenuScene Completed', SeverityLevel.Information);
  }

  /**
   * Launch the SettingsScene as a parallel scene on top of this one.
   * MenuScene stays active underneath; the `onBack` callback stops
   * SettingsScene and Menu reappears (it was never stopped). Same
   * pattern as opening Settings from PauseOverlay — SettingsScene
   * doesn't know which caller it was launched from.
   */
  private openSettings(): void {
    if (this.scene.isActive(SceneKeys.Settings)) return; // guard double-open
    _th.logToAi('MenuScene.SettingsOpened', SeverityLevel.Information);
    const init: SettingsSceneInit = {
      onBack: () => this.scene.stop(SceneKeys.Settings),
    };
    this.scene.launch(SceneKeys.Settings, init);
  }

  private highScoresOverlay?: Phaser.GameObjects.Text;

  /**
   * Placeholder until the score-store UI lands. For now, just shows a temporary
   * text overlay that auto-dismisses. Real high-score browsing is a later sprint.
   *
   * Guards against double-tap stacking: if the user mashes the button, the
   * existing overlay is destroyed before the new one is created — only ever
   * one overlay on screen.
   */
  private showHighScoresPlaceholder(): void {
    if (this.highScoresOverlay) {
      this.highScoresOverlay.destroy();
    }
    const { width, height } = this.scale;
    this.highScoresOverlay = this.add
      .text(width / 2, height * 0.78, 'No scores yet — play a round!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#facc15',
      })
      .setOrigin(0.5);
    this.time.delayedCall(2000, () => {
      this.highScoresOverlay?.destroy();
      this.highScoresOverlay = undefined;
    });
  }
}
