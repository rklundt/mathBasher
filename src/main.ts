// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { createScoreStore } from '@/services/scoreStoreFactory';
import { createAudioManager } from '@/services/audioManagerFactory';
import { BootScene } from '@/game/scenes/BootScene';
import { MenuScene } from '@/game/scenes/MenuScene';
import { GameSelectScene } from '@/game/scenes/GameSelectScene';
import { DifficultyScene } from '@/game/scenes/DifficultyScene';
import { GameScene } from '@/game/scenes/GameScene';
import { HudScene } from '@/game/scenes/HudScene';
import { GameOverScene } from '@/game/scenes/GameOverScene';
import { PauseOverlay } from '@/game/scenes/PauseOverlay';
import { SettingsScene } from '@/game/scenes/SettingsScene';
import { AttributionScene } from '@/game/scenes/AttributionScene';

_th.logToAi('AppBoot Started', SeverityLevel.Information);

// Eagerly initialize the score store at boot so the same memoized instance
// is shared across every round in the page lifetime. GameOverScene calls
// getScoreStore() (alias for createScoreStore()) and gets this same one.
createScoreStore();

// Eagerly initialize the audio manager at boot so its mute state (read from
// localStorage at construction) is available immediately. The manager is
// NOT bound to a Phaser scene here — that happens later in MenuScene's
// first user-gesture handler (iOS Safari blocks WebAudioContext creation
// outside a user gesture). Construction is fine; init(scene) is not.
createAudioManager();

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
  // so it renders on top of every other scene's content. PauseOverlay and
  // SettingsScene sit just before Attribution so they cover GameScene + HudScene
  // but the §7(b) attribution footer stays visible even while paused or while
  // adjusting settings. SettingsScene is registered AFTER PauseOverlay so when
  // launched from Pause, SettingsScene visually stacks on top of the pause
  // overlay (its parallel-scene render order respects registration order).
  scene: [
    BootScene,
    MenuScene,
    GameSelectScene,
    DifficultyScene,
    GameScene,
    HudScene,
    GameOverScene,
    PauseOverlay,
    SettingsScene,
    AttributionScene,
  ],
});

_th.logToAi('AppBoot Completed', SeverityLevel.Information);
