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
import { LoadingScene } from '@/game/scenes/LoadingScene';
import { GameScene } from '@/game/scenes/GameScene';
import { AsteroidFieldScene } from '@/game/scenes/AsteroidFieldScene';
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
      LoadingScene,
      GameScene,
      AsteroidFieldScene,
      HudScene,
      GameOverScene,
      PauseOverlay,
      SettingsScene,
      AttributionScene,
    ],
  });

  // Sprint 2.1.8 — splash now MORPHS into a loading bar instead of
  // dismissing immediately. The bar is DOM-rendered (index.html
  // markup) because Phaser hasn't painted its first frame yet during
  // the construction delay between this tap-handler and BootScene's
  // create() — only the existing DOM splash overlay is on-screen.
  // Adding `.loading-active` swaps the "Tap to play" button for the
  // bar; BootScene's loader-progress hooks (below) drive the fill;
  // the splash dismisses entirely on BootScene's `complete`.
  const splash = document.getElementById('splash');
  splash?.classList.add('loading-active');

  // Minimum-display-time floor: even if Phaser finishes the load in
  // <100ms (likely on cached re-loads or fast networks at the
  // post-2.1.6 ~2 MB boot bundle), keep the bar visible for at least
  // MIN_DISPLAY_MS so the kid sees "the bar appeared, filled,
  // dismissed" as a coherent beat instead of a single-frame flash.
  // 500ms = short enough to read as snappy, long enough to register
  // as intentional.
  const MIN_DISPLAY_MS = 500;
  const loadStartMs = Date.now();
  const fillEl = document.getElementById('splash-loading-fill');

  /**
   * Hooks the DOM splash bar exposes for BootScene to drive. Stashed
   * on `window` (private `__mbBootHooks` namespace) so BootScene can
   * find them without needing a Phaser registry round-trip. Cleaned
   * up after the load completes — see `onComplete` below.
   */
  type BootHooks = {
    onProgress: (value: number) => void;
    onComplete: () => void;
  };
  const hooks: BootHooks = {
    onProgress: (value) => {
      if (fillEl) fillEl.style.width = `${String(value * 100)}%`;
    },
    onComplete: () => {
      // Snap to 100% in case the final `progress` event didn't reach 1.0.
      if (fillEl) fillEl.style.width = '100%';
      const elapsed = Date.now() - loadStartMs;
      const wait = Math.max(0, MIN_DISPLAY_MS - elapsed);
      window.setTimeout(() => {
        splash?.classList.add('hidden');
        // Tidy up the global hook so a hypothetical replay (page
        // doesn't reload but bootGame is re-invoked) doesn't reuse
        // stale callbacks pointing at a dismissed splash.
        delete (window as unknown as { __mbBootHooks?: BootHooks }).__mbBootHooks;
      }, wait);
    },
  };
  (window as unknown as { __mbBootHooks: BootHooks }).__mbBootHooks = hooks;

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

  // Sprint 0.7 Story 13 (D3 from sprint 0.6.3 wrap-up review) —
  // viewport-tier-class telemetry. ADR-0010 D4 says "no mid-session
  // re-tier" because the loaded textures are baked into the GPU atlas
  // at boot. This listener validates that decision empirically: if the
  // viewport × DPR crosses the 1920 threshold (e.g. user resizes
  // browser window from 1366 → 2400 wide), we emit a Warning so we
  // can see in App Insights how often this happens. If "never," the
  // decision was right. If "often," consider re-implementing tier
  // re-pick with texture reload.
  //
  // No actual re-tier is performed here — just the telemetry signal.
  const initialViewportEffectivePx = window.innerWidth * window.devicePixelRatio;
  let lastTierClass: '128' | '192' = initialViewportEffectivePx >= 1920 ? '192' : '128';
  const onResize = (): void => {
    const effective = window.innerWidth * window.devicePixelRatio;
    const newTierClass: '128' | '192' = effective >= 1920 ? '192' : '128';
    if (newTierClass !== lastTierClass) {
      _th.logToAi('ViewportTierClassCrossed', SeverityLevel.Warning, {
        spriteTier: newTierClass,
        reason: `${lastTierClass}→${newTierClass} (effective px: ${Math.round(effective)})`,
      });
      lastTierClass = newTierClass;
    }
  };
  window.addEventListener('resize', onResize);

  game.events.once(Phaser.Core.Events.DESTROY, () => {
    window.removeEventListener('orientationchange', onOrientationChange);
    window.removeEventListener('resize', onResize);
  });

  _th.logToAi('AppBoot Completed', SeverityLevel.Information);
}
