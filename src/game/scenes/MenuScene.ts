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

    // Bind the AudioManager to THIS scene immediately, before any
    // PlaceholderButton is constructed. PlaceholderButton's pointerdown
    // handler plays a click SFX BEFORE invoking the user-supplied onClick;
    // if the audio manager isn't yet bound to a live scene at that moment,
    // `ensureReady()` returns false and the very first button click is
    // silently dropped (logs `AudioManager.play.notInitialized`). Sprint
    // 0.5.4 follow-up: previously this `init` call lived inside Start's
    // onClick, which guaranteed the first Start click was silent.
    //
    // iOS Safari note: the user-gesture requirement is for AudioContext
    // CREATION, not for `init()`. The AudioContext is already created
    // (and unlocked) when Phaser is constructed inside the splash click
    // handler in main.ts — by the time MenuScene.create() runs, the audio
    // pipeline is hot. Binding here is safe.
    getAudioManager().init(this);

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
      onClick: () => this.scene.start(SceneKeys.GameSelect),
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
