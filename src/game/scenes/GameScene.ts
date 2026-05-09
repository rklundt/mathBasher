// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';

/**
 * Placeholder GameScene — for sprint 0.4 only. Shows the selected
 * `mathId` / `speed` (proves the Settings hand-off works) and a Quit button
 * that transitions to GameOverScene with a fake outcome. Real gameplay is
 * implemented in sprint 0.5; this scene only proves navigation in/out.
 *
 * Launches HudScene in parallel; stops it again on shutdown.
 */
export class GameScene extends Phaser.Scene {
  static readonly key = SceneKeys.Game;

  constructor() {
    super(GameScene.key);
  }

  create(): void {
    const { mathId, speed } = Settings.round;
    _th.logToAi('GameScene Started', SeverityLevel.Information, {
      mathId: mathId ?? undefined,
      speed: speed ?? undefined,
    });

    // Defensive double-launch guard: if some future code path restarts
    // GameScene without going through a full shutdown (e.g. scene.restart()),
    // Hud could be launched twice. Cheap insurance.
    if (!this.scene.isActive(SceneKeys.Hud)) {
      this.scene.launch(SceneKeys.Hud);
    }

    const { width, height } = this.scale;
    const cx = width / 2;

    this.add
      .text(cx, height * 0.3, 'Get ready!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '32px',
        color: '#eaeaf2',
      })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        height * 0.42,
        `Math: ${mathId ?? '?'}\nSpeed: ${speed ?? '?'}`,
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '20px',
          color: '#cbd5e1',
          align: 'center',
        },
      )
      .setOrigin(0.5);

    this.add
      .text(cx, height * 0.55, 'The real game is coming soon!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5);

    const quit = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.75,
      width: 200,
      height: 56,
      label: 'Quit',
      onClick: () => {
        // No explicit scene.stop(Hud) here — the shutdown handler below is
        // the single source of truth for stopping HudScene. Calling stop in
        // both places would double-stop on every Quit, which is bug-shaped.
        this.scene.start(SceneKeys.GameOver, {
          score: 0,
          correctCount: 0,
          passed: false,
          stars: 0,
          mathId,
          speed,
        });
      },
    });

    new KeyboardNavigator(this, [quit]);

    this.events.once('shutdown', () => {
      this.scene.stop(SceneKeys.Hud);
      _th.logToAi('GameScene Completed', SeverityLevel.Information);
    });
  }
}
