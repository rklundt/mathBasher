// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { BootScene } from '@/game/scenes/BootScene';
import { MenuScene } from '@/game/scenes/MenuScene';
import { GameSelectScene } from '@/game/scenes/GameSelectScene';
import { DifficultyScene } from '@/game/scenes/DifficultyScene';
import { GameScene } from '@/game/scenes/GameScene';
import { HudScene } from '@/game/scenes/HudScene';
import { GameOverScene } from '@/game/scenes/GameOverScene';
import { AttributionScene } from '@/game/scenes/AttributionScene';

_th.logToAi('AppBoot Started', SeverityLevel.Information);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b1020',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  // Order matters: BootScene starts first (auto-starts because it's at index
  // 0 with no auto-start override). AttributionScene MUST be registered LAST
  // so it renders on top of every other scene's content.
  scene: [
    BootScene,
    MenuScene,
    GameSelectScene,
    DifficultyScene,
    GameScene,
    HudScene,
    GameOverScene,
    AttributionScene,
  ],
});

_th.logToAi('AppBoot Completed', SeverityLevel.Information);
