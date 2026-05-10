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

/**
 * Bootstrap the actual game (Phaser + service singletons). Called from
 * inside the splash button's click handler in `main.ts` — never at module
 * load.
 *
 * WHY DEFERRED: constructing `Phaser.Game` synchronously creates a
 * `WebAudioSoundManager` which immediately calls `new AudioContext()`.
 * Browsers (Firefox + Chrome both) print a warning when an AudioContext
 * is created BEFORE any user interaction has happened on the page —
 * `An AudioContext was prevented from starting automatically. It must
 * be created or resumed after a user gesture on the page.` Firing
 * Phaser construction inside a click handler eliminates the warning
 * AND properly brackets iOS Safari's first-gesture audio context
 * requirement. Side benefit: a natural title-screen moment.
 *
 * Idempotent in spirit but in practice called exactly once — `main.ts`
 * uses `addEventListener(..., { once: true })` on the splash button.
 *
 * Why this lives in its own module rather than `main.ts`: pre-refactor,
 * `main.ts` was 4 jobs (telemetry init + splash wiring + Phaser config +
 * dev autostart). Phase 1 mobile work will likely add asset-preload
 * progress, screen-orientation gate, and "WebAudio unsupported" fallback —
 * the boot orchestration belongs in one focused module so `main.ts` stays
 * a thin entry point.
 */
export function bootGame(): void {
  _th.logToAi('SplashStarted', SeverityLevel.Information);

  // Eagerly initialize the score store. Same memoized instance is
  // shared across every round in the page lifetime. GameOverScene
  // calls getScoreStore() and gets this same one.
  createScoreStore();

  // Eagerly initialize the audio manager. The manager constructor reads
  // mute + per-kind volume state from localStorage. The Phaser scene
  // binding (init(scene)) happens later, in each scene's setupScene()
  // call — defense-in-depth on top of this splash, since the manager
  // construction itself is benign.
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

  // Hide the splash. Using `display: none` (via .hidden class) rather
  // than removing the node — keeps the DOM stable for any future
  // teardown / replay / dev-tools inspection.
  document.getElementById('splash')?.classList.add('hidden');

  _th.logToAi('AppBoot Completed', SeverityLevel.Information);
}
