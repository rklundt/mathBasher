// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';

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

    new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.5,
      width: 280,
      height: 64,
      label: 'Start',
      onClick: () => this.scene.start(SceneKeys.GameSelect),
    });

    new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.62,
      width: 280,
      height: 64,
      label: 'High Scores',
      onClick: () => this.showHighScoresPlaceholder(),
    });

    _th.logToAi('MenuScene Completed', SeverityLevel.Information);
  }

  /**
   * Placeholder until the score-store UI lands. For now, just shows a temporary
   * text overlay that auto-dismisses. Real high-score browsing is a later sprint.
   */
  private showHighScoresPlaceholder(): void {
    const { width, height } = this.scale;
    const overlay = this.add
      .text(width / 2, height * 0.78, 'No scores yet — play a round!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#facc15',
      })
      .setOrigin(0.5);
    this.time.delayedCall(2000, () => overlay.destroy());
  }
}
