// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { text } from '@/game/ui/typography';

/**
 * Reusable loading-bar overlay. Renders a centered "Loading…" label +
 * thin amber progress bar that fills left-to-right as Phaser's loader
 * reports progress. Lifted from BootScene's inline implementation in
 * sprint 2.1.6 so per-game `preload()` calls can show the same overlay
 * without re-implementing the geometry.
 *
 * Behavior:
 *   - When `loader.totalToLoad === 0` at attach time → renders NOTHING
 *     (cached re-loads of the same game shouldn't flash a 0-to-instant
 *     overlay).
 *   - When `totalToLoad > 0` → renders the label + bar, subscribes to
 *     the loader's `progress` event, removes itself from the scene's
 *     display list on `complete`.
 *
 * Visual matches the existing BootScene loading bar (slate plate +
 * amber fill + 'bodyLarge' label) — see the docstring on
 * `BootScene.buildLoadingBar` for the palette rationale.
 */
export interface AttachLoadingOverlayOpts {
  /** The scene whose loader to subscribe to. The overlay is added to this scene's display list. */
  scene: Phaser.Scene;
  /**
   * Optional caption override. Defaults to "Loading…" — pass a more
   * specific string ("Loading Asteroid Field…") if mid-session
   * loads benefit from telling the kid what they're waiting for.
   */
  caption?: string;
}

/**
 * Attach a loading overlay to the scene's loader. Returns immediately;
 * the overlay manages its own lifecycle (renders on first `progress`,
 * destroys on `complete`). Returns nothing — caller doesn't need a
 * handle because the overlay is self-cleaning.
 *
 * Idempotent re-load case: when `loader.totalToLoad === 0` (Phaser
 * has nothing queued — every requested asset is already cached), the
 * overlay short-circuits and renders nothing at all, so a quick
 * re-entry into a previously-played game doesn't flash a 0%-to-gone
 * progress bar.
 */
export function attachLoadingOverlay(opts: AttachLoadingOverlayOpts): void {
  const { scene } = opts;
  const loader = scene.load;

  // Short-circuit: nothing to load means nothing to show. Phaser's
  // loader populates totalToLoad as files are queued via `load.image`
  // etc. — checking AFTER all queue calls is the caller's contract
  // (this function should be called LAST in a preload(), not first).
  if (loader.totalToLoad === 0) return;

  const W = scene.scale.gameSize.width;
  const H = scene.scale.gameSize.height;
  const BAR_W = 400;
  const BAR_H = 24;
  const BAR_PAD = 2;
  const FILL_MAX = BAR_W - BAR_PAD * 2;
  const caption = opts.caption ?? 'Loading…';

  const label = text(scene, W / 2, H / 2 - 32, caption, 'bodyLarge').setOrigin(0.5);
  const bg = scene.add
    .rectangle(W / 2, H / 2, BAR_W, BAR_H, 0x1e293b)
    .setStrokeStyle(2, 0x475569);
  const fill = scene.add
    .rectangle(W / 2 - FILL_MAX / 2, H / 2, 0, BAR_H - BAR_PAD * 2, 0xfbbf24)
    .setOrigin(0, 0.5);

  const onProgress = (value: number): void => {
    fill.width = FILL_MAX * value;
  };
  loader.on(Phaser.Loader.Events.PROGRESS, onProgress);

  // Sprint 2.1.6 — track load failures. Phaser's `loaderror` event
  // fires per failed file (network blip, 404, CORS issue) and the
  // loader continues attempting the rest. We log telemetry for every
  // failure and, if ANY file fails, show a tap-to-retry overlay
  // when the loader eventually settles. The retry path restarts the
  // scene which re-runs preload (and Phaser's cache means already-
  // succeeded files are reused — only the failed ones re-fetch).
  let failedCount = 0;
  const onError = (file: Phaser.Loader.File): void => {
    failedCount += 1;
    _th.logToAi('AssetLoader.fileError', SeverityLevel.Error, {
      reason: `${file.type}:${file.key} (${file.src})`,
    });
  };
  loader.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);

  loader.once(Phaser.Loader.Events.COMPLETE, () => {
    loader.off(Phaser.Loader.Events.PROGRESS, onProgress);
    loader.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    label.destroy();
    bg.destroy();
    fill.destroy();
    if (failedCount > 0) {
      renderRetryOverlay(scene, failedCount);
    }
  });
}

/**
 * Render an interactive tap-to-retry overlay when one or more files
 * failed to load. Restarting the scene re-runs preload; Phaser's
 * cache keeps successful loads so only the failed files re-fetch.
 *
 * Self-contained — same scene reference owns lifecycle; clicking
 * the overlay destroys its children + restarts the scene.
 */
function renderRetryOverlay(scene: Phaser.Scene, failedCount: number): void {
  const W = scene.scale.gameSize.width;
  const H = scene.scale.gameSize.height;
  const PILL_W = 360;
  const PILL_H = 80;
  const headline = text(
    scene,
    W / 2,
    H / 2 - 44,
    `Trouble loading (${String(failedCount)})`,
    'bodyLarge',
  ).setOrigin(0.5);
  headline.setColor('#ef4444');
  const pillBg = scene.add
    .rectangle(W / 2, H / 2 + 24, PILL_W, PILL_H, 0x1e293b)
    .setStrokeStyle(2, 0xfbbf24)
    .setInteractive({ useHandCursor: true });
  const pillLabel = text(
    scene,
    W / 2,
    H / 2 + 24,
    'Tap to retry',
    'bodyLarge',
  ).setOrigin(0.5);
  pillBg.on(Phaser.Input.Events.POINTER_DOWN, () => {
    _th.logToAi('AssetLoader.retry', SeverityLevel.Information, {
      reason: `failedCount=${String(failedCount)}`,
    });
    headline.destroy();
    pillBg.destroy();
    pillLabel.destroy();
    scene.scene.restart();
  });
}
