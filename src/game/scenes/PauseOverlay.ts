// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';

/**
 * Translucent overlay that floats above GameScene + HudScene while a round
 * is paused. Two actions: Resume (closes the overlay, GameScene resumes)
 * and Quit to Menu (abandons the round, no score saved).
 *
 * Lifecycle:
 *  - LAUNCHED (parallel) by GameScene.pause(); STOPPED by GameScene.resume()
 *    or by the Quit button. Never started in place of GameScene — that would
 *    tear down round state.
 *  - Esc on this scene routes back through the same `resumeFn` callback so a
 *    single Esc round-trips the pause without the user needing to click
 *    Resume.
 *
 * Render order note: AttributionScene is registered LAST in main.ts and runs
 * above every other scene, so the §7(b) attribution footer stays visible
 * even while paused. PauseOverlay sits between GameScene/HudScene and the
 * attribution footer in z-order.
 */
export interface PauseOverlayInit {
  /** Called when the user picks Resume (or presses Esc again on the overlay). */
  resumeFn: () => void;
  /** Called when the user picks Quit to Menu. */
  quitFn: () => void;
}

export class PauseOverlay extends Phaser.Scene {
  static readonly key = SceneKeys.PauseOverlay;

  private resumeFn?: () => void;
  private quitFn?: () => void;

  constructor() {
    super(PauseOverlay.key);
  }

  init(data: Partial<PauseOverlayInit>): void {
    this.resumeFn = data.resumeFn;
    this.quitFn = data.quitFn;
  }

  create(): void {
    _th.logToAi('PauseOverlay Started', SeverityLevel.Information, { from: 'gameplay' });

    const { width, height } = this.scale;

    // Translucent backdrop covers the whole canvas. Slightly darker than the
    // HUD's 45% alpha so the paused state reads as visibly different from the
    // active HUD bar above it.
    const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.6);
    backdrop.setOrigin(0, 0);

    this.add
      .text(width / 2, height * 0.32, 'Paused', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '56px',
        color: '#eaeaf2',
      })
      .setOrigin(0.5);

    const resumeBtn = new PlaceholderButton({
      scene: this,
      x: width / 2,
      y: height * 0.5,
      width: 280,
      height: 64,
      label: 'Resume',
      onClick: () => this.handleResume(),
    });

    const quitBtn = new PlaceholderButton({
      scene: this,
      x: width / 2,
      y: height * 0.62,
      width: 280,
      height: 64,
      label: 'Quit to Menu',
      onClick: () => this.handleQuit(),
    });

    new KeyboardNavigator(this, [resumeBtn, quitBtn]);

    // Esc on the overlay = Resume. Round-trip through Esc means a kid can
    // open and close pause with one key, without needing to find the Resume
    // button after pressing Esc to open.
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ESC', this.handleResume, this);
    }

    this.events.once('shutdown', () => {
      if (this.input.keyboard) {
        this.input.keyboard.off('keydown-ESC', this.handleResume, this);
      }
      _th.logToAi('PauseOverlay Completed', SeverityLevel.Information);
    });
  }

  private handleResume(): void {
    this.resumeFn?.();
  }

  private handleQuit(): void {
    this.quitFn?.();
  }
}
