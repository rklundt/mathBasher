// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { createScoreStore } from '@/services/scoreStoreFactory';
import { createAudioManager } from '@/services/audioManagerFactory';
import { BootScene } from '@/game/scenes/BootScene';
import { BackgroundScene } from '@/game/scenes/BackgroundScene';
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

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0b1020',
    scale: {
      // FIT preserves the 16:9 design aspect ratio and letterboxes anything
      // off-ratio (taller / wider devices). The page CSS paints the area
      // outside the canvas in `#0b1020` so letterbox bands look intentional
      // (matches the in-game backdrop). RESIZE was rejected — it would
      // require every scene to recompute layout on every viewport change,
      // and a fixed-aspect arcade game gains nothing from it. Full rationale
      // in `src/core/SCALE.md`.
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1280,
      height: 720,
      // Parent the Phaser canvas to `#game` (matches the index.html DOM)
      // and let Phaser expand the parent to fill its container so the FIT
      // calculation has the right viewport to fit INTO. Without
      // expandParent, Phaser sometimes computes against the parent's
      // intrinsic content size (zero before render) and renders at 0×0 on
      // first paint until a resize event fires.
      parent: 'game',
      expandParent: true,
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
    // Scene registration order = render order (earlier = renders below
    // later). BackgroundScene is second so its parallax + nebula renders
    // BENEATH every gameplay scene. AttributionScene is last so the AGPL
    // §7(b) footer renders ON TOP of everything else.
    scene: [
      BootScene,
      BackgroundScene,
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

  // On mobile rotation, the CSS media query in index.html hides the
  // rotate-overlay automatically. Phaser's ScaleManager already listens
  // to `window.resize` events natively, and most mobile browsers fire
  // resize on orientationchange — but a few (older iOS Safari especially)
  // fire orientationchange WITHOUT a paired resize. Belt-and-braces: when
  // we hear orientationchange, trigger Phaser's refresh() explicitly so
  // the canvas re-fits to the new viewport without waiting for the user
  // to manually resize.
  //
  // Cleanup on game destroy. In production this never fires (the page
  // lives until full reload), but Vite HMR can re-execute boot.ts in
  // module-only mode, which would stack listeners. Pairing the listener
  // with a Phaser DESTROY teardown means any future restart-the-game
  // path (or HMR boundary that re-runs boot.ts) gets a clean slate.
  const onOrientationChange = (): void => {
    // Defer one frame so the browser has a chance to update window
    // dimensions before Phaser reads them.
    requestAnimationFrame(() => game.scale.refresh());
  };
  window.addEventListener('orientationchange', onOrientationChange);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    window.removeEventListener('orientationchange', onOrientationChange);
  });

  _th.logToAi('AppBoot Completed', SeverityLevel.Information);
}
