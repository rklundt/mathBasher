// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { stackButtons } from '@/game/ui/MenuLayout';
import { FONT_FAMILY, TEXT_PRIMARY } from '@/game/ui/typography';
import type { SettingsSceneInit } from '@/game/scenes/SettingsScene';

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

    // 56px primary "Paused" headline — between TextKind 'h2' (48px) and
    // 'title' (64px). One-off; inline via FONT_FAMILY + TEXT_PRIMARY.
    this.add
      .text(width / 2, height * 0.32, 'Paused', {
        fontFamily: FONT_FAMILY,
        fontSize: '67px', // Sprint 0.7.5 Story 1 — was 56 (PAUSED headline)
        color: TEXT_PRIMARY,
      })
      .setOrigin(0.5);

    const buttons = stackButtons(this, {
      centerY: height * 0.58,
      items: [
        { label: 'Resume', onClick: () => this.handleResume() },
        { label: 'Settings', kind: 'secondary', onClick: () => this.handleSettings() },
        { label: 'Quit to Menu', onClick: () => this.handleQuit() },
      ],
    });

    new KeyboardNavigator(this, buttons);

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
    // Guard: when SettingsScene is launched on top of this overlay (via the
    // Settings button), Phaser still routes input to BOTH scenes. Pressing
    // Esc to dismiss SettingsScene would otherwise also fire this handler
    // and accidentally resume the game underneath. Skip when Settings is
    // active; SettingsScene's own Esc handler closes the settings panel
    // and a subsequent Esc on this overlay (with Settings now gone) resumes
    // as expected. Mirrors the double-launch guard pattern in
    // `handleSettings` below.
    if (this.scene.isActive(SceneKeys.Settings)) return;
    this.resumeFn?.();
  }

  private handleQuit(): void {
    this.quitFn?.();
  }

  /**
   * Open the SettingsScene STACKED on top of this overlay. Pause stays
   * active underneath so the kid sees Settings layered over Pause; on
   * Back, Settings stops and Pause is the foreground again. Game stays
   * paused throughout — neither this scene nor SettingsScene resumes
   * the game, only the explicit Resume button does.
   */
  private handleSettings(): void {
    if (this.scene.isActive(SceneKeys.Settings)) return; // guard double-open
    _th.logToAi('PauseOverlay.SettingsOpened', SeverityLevel.Information);
    const init: SettingsSceneInit = {
      onBack: () => this.scene.stop(SceneKeys.Settings),
    };
    this.scene.launch(SceneKeys.Settings, init);
  }
}
