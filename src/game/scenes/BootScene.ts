// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';

/**
 * BootScene — entry point. Briefly displays the project name, launches the
 * persistent AttributionScene (AGPL §7(b) requirement), then hands off to
 * MenuScene.
 *
 * In a later art-polish revision this scene will gain preload duties and a
 * loading bar; for now it just renders the project name to verify the toolchain
 * and orchestrates the initial scene transitions.
 */
export class BootScene extends Phaser.Scene {
  static readonly key = SceneKeys.Boot;

  constructor() {
    super(BootScene.key);
  }

  create(): void {
    _th.logToAi('BootScene Started', SeverityLevel.Information);

    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'mathBasher', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '64px',
        color: '#eaeaf2',
      })
      .setOrigin(0.5);

    // Briefly show the title, launch the persistent attribution footer, and
    // transition to the Menu. 800ms is enough that a kid actually reads the
    // title rather than seeing it flicker; faster (e.g. 400ms) feels broken.
    // Real preload + loading bar lands in the art-polish milestone.
    this.time.delayedCall(800, () => {
      this.scene.launch(SceneKeys.Attribution);
      this.scene.start(SceneKeys.Menu);
    });

    _th.logToAi('BootScene Completed', SeverityLevel.Information);
  }
}
