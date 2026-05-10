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

/**
 * Bootstrap the actual game (Phaser + service singletons). Called from
 * inside the splash button's click handler — never at module load.
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
 * Idempotent in spirit but in practice called exactly once — the
 * splash button uses `addEventListener(..., { once: true })`.
 */
function startGame(): void {
  _th.logToAi('SplashStarted', SeverityLevel.Information);

  // Eagerly initialize the score store. Same memoized instance is
  // shared across every round in the page lifetime. GameOverScene
  // calls getScoreStore() and gets this same one.
  createScoreStore();

  // Eagerly initialize the audio manager. The manager constructor reads
  // mute + per-kind volume state from localStorage. The Phaser scene
  // binding (init(scene)) still happens later, in MenuScene's first
  // user-gesture handler — that's defense-in-depth on top of this
  // splash, since the manager construction itself is benign.
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

// Wire the splash button. `{ once: true }` means the handler fires only
// on the first click — a second click is impossible because the splash
// is hidden after the first.
const splashButton = document.getElementById('splash-start');
splashButton?.addEventListener('click', startGame, { once: true });

// Dev convenience: ?autostart in the URL skips the splash. Saves a click
// on every HMR reload during heavy dev iteration. Production users never
// see this param. The autostart path is identical to the click path —
// AudioContext is still created during a synchronous JS callback initiated
// from the click event that loaded the URL (browser still treats it as
// a user-gesture context for the same-origin reload), or worst case the
// AudioContext warning prints once per dev refresh, which is acceptable
// for the dev workflow tradeoff.
//
// Use URLSearchParams.has() rather than search.includes('autostart'): the
// substring check would also match `?fooautostart=1` or `?my_autostart_x`,
// which would be a surprise to a future contributor who reads ?autostart as
// an exact-name flag. The exact-key check makes the contract obvious.
if (new URLSearchParams(window.location.search).has('autostart')) {
  startGame();
}
