// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { config } from '@/core/config';

/**
 * Heads-up display, runs in PARALLEL with GameScene (Phaser scene-launch
 * pattern). For sprint 0.4 it just renders a placeholder top bar:
 *
 *   Score: 0  |  Q: 0/20  |  <prompt>
 *
 * Sprint 0.5 wires this to real GameScene events:
 *   - 'questionStarted' updates the prompt + question counter
 *   - 'questionEnded' updates the score
 */
export class HudScene extends Phaser.Scene {
  static readonly key = SceneKeys.Hud;

  constructor() {
    super(HudScene.key);
  }

  create(): void {
    _th.logToAi('HudScene Started', SeverityLevel.Information);

    const { width } = this.scale;
    const barHeight = 48;

    // Translucent backdrop strip at the top so labels stay legible over busy
    // gameplay backgrounds when sprite assets land in 0.7.
    const bg = this.add.rectangle(0, 0, width, barHeight, 0x000000, 0.45);
    bg.setOrigin(0, 0);

    this.add
      .text(16, barHeight / 2, 'Score: 0', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#eaeaf2',
      })
      .setOrigin(0, 0.5);

    this.add
      .text(width / 2, barHeight / 2, '— + — = ?', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#facc15',
      })
      .setOrigin(0.5);

    this.add
      .text(width - 16, barHeight / 2, `Q: 0/${config.round.questionsPerRound}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#eaeaf2',
      })
      .setOrigin(1, 0.5);

    this.events.once('shutdown', () => {
      _th.logToAi('HudScene Completed', SeverityLevel.Information);
    });
  }
}
