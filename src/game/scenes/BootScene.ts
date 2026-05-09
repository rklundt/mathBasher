// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';

/**
 * BootScene — minimal proof-of-life scene for sprint 0.1.
 *
 * In sprint 0.7 (Art + Polish), this scene gains preload duties and a loading
 * bar; for now it just renders the project name to verify the toolchain.
 *
 * Sprint 0.4 will add a Menu transition; for now the scene just sits.
 */
export class BootScene extends Phaser.Scene {
  static readonly key = 'boot';

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

    _th.logToAi('BootScene Completed', SeverityLevel.Information);
  }
}
