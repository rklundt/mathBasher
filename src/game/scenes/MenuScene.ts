// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { stackButtons } from '@/game/ui/MenuLayout';
import { text } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';
import type { SettingsSceneInit } from '@/game/scenes/SettingsScene';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';

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
    setupScene(this);

    const { width, height } = this.scale;
    const cx = width / 2;

    text(this, cx, height * 0.22, 'mathBasher', 'title').setOrigin(0.5);
    text(this, cx, height * 0.32, 'Math, but with aliens.', 'subtitle').setOrigin(0.5);

    // Sprint 0.7 Story 11 — direct mute icon in the top-right corner.
    // Sprint 2.2 wrap-up extracted the rendering to `createMuteIconButton`
    // (shared with HudScene + GameSelectScene); spec was "Mute toggle
    // button added to MenuScene and HudScene." Settings → Sound is still
    // available via the Settings button below for full per-kind volume
    // controls; this gives one-tap mute without going through Settings.
    createMuteIconButton(this, width - 16 - 22, 16 + 18);

    // Three-button menu stack centered ~60% down the canvas. Geometry
    // (widths, heights, gaps) comes from `config.layout.button` via
    // `stackButtons` so all menu scenes share one rhythm.
    const buttons = stackButtons(this, {
      centerY: height * 0.6,
      items: [
        { label: 'Start', onClick: () => this.scene.start(SceneKeys.GameSelect) },
        { label: 'High Scores', onClick: () => this.showHighScoresPlaceholder() },
        { label: 'Settings', kind: 'secondary', onClick: () => this.openSettings() },
      ],
    });

    new KeyboardNavigator(this, buttons);
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
    // TextKind 'bodyAccent' — 22px amber (same size as 'body' but accent
    // color, used for transient overlay copy). Sprint 0.7.5 Story 3.
    this.highScoresOverlay = text(
      this,
      width / 2,
      height * 0.78,
      'No scores yet — play a round!',
      'bodyAccent',
    ).setOrigin(0.5);
    this.time.delayedCall(2000, () => {
      this.highScoresOverlay?.destroy();
      this.highScoresOverlay = undefined;
    });
  }
}
