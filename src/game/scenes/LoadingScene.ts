// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import type { GameId } from '@/services/Settings';
import { loadGameBundle } from '@/game/services/assetLoader';
import { attachLoadingOverlay } from '@/game/ui/LoadingOverlay';

/**
 * Sprint 2.1.8 — intermediate load-progress scene. Sits between
 * `DifficultyScene` and the target game scene (Alien Shoot or
 * Asteroid Field) to render a visible loading bar during the
 * per-game asset preload.
 *
 * Why this scene exists: Phaser's mid-session scene-transition
 * timing means a loading bar attached IN the target game scene's
 * own `preload()` doesn't paint visibly — the new scene's canvas
 * doesn't render its first frame until `create()` runs, which is
 * AFTER the loader completes. The kid would see a 1-2 second
 * apparent freeze on first-time game picks (sprint 2.1.6 v2.1.6
 * playtest finding).
 *
 * Putting the load + bar in a dedicated scene that's ALREADY
 * painting (this one) sidesteps the timing problem. Flow:
 *
 *   DifficultyScene
 *     → scene.start(Loading, { targetSceneKey: 'asteroid-field' })
 *   LoadingScene.preload()
 *     → loadGameBundle(this, gameId)  // queues per-game assets
 *     → attachLoadingOverlay({ scene: this })  // visible bar
 *   LoadingScene.create()  // load done; bar dismissed
 *     → scene.start(targetSceneKey)
 *   Target game scene → preload (no-op; everything cached) → create
 *
 * Idempotent on re-entry: cached re-loads hit `totalToLoad === 0` in
 * `attachLoadingOverlay`, which short-circuits and renders nothing.
 * LoadingScene transitions to the target immediately on `create`. So
 * the second pick of the same game looks instant; the first pick
 * shows the bar.
 *
 * Game-mode-bg continuity: BackgroundScene already swapped to the
 * correct backdrop when DifficultyScene fired `Settings.setGameId`
 * (sprint 2.1.5). LoadingScene renders against that already-correct
 * bg, so the visual reads as "loading INTO the game" rather than a
 * neutral interstitial.
 */
export interface LoadingSceneInit {
  /**
   * Scene-key string to start once the load completes. The matching
   * `GameId` is derived from `Settings.round.gameId` rather than
   * passed separately to keep the init payload narrow + avoid
   * gameId/sceneKey drift (the two are 1:1 today via `GAME_BG_MAP`
   * etc., but DifficultyScene already set Settings to the right
   * gameId before calling scene.start here).
   */
  targetSceneKey: string;
  /**
   * The game id whose assets should be loaded. Passed explicitly
   * (rather than read from Settings inside the scene) so the
   * caller's intent is explicit at the call site — Settings could
   * theoretically drift between the start call and this scene's
   * preload running.
   */
  gameId: GameId;
}

export class LoadingScene extends Phaser.Scene {
  static readonly key = SceneKeys.Loading;

  private targetSceneKey = '';
  private gameId: GameId = 'alien-shoot';

  constructor() {
    super(LoadingScene.key);
  }

  init(data: Partial<LoadingSceneInit>): void {
    if (!data.targetSceneKey || !data.gameId) {
      _th.logToAi('LoadingScene.missingInit', SeverityLevel.Warning, {
        reason: `targetSceneKey=${String(data.targetSceneKey)} gameId=${String(data.gameId)}`,
      });
      // Defensive defaults — if the caller forgot init data, fall
      // back to the menu so the player isn't stranded on a blank
      // loading screen.
      this.targetSceneKey = SceneKeys.Menu;
      this.gameId = 'alien-shoot';
      return;
    }
    this.targetSceneKey = data.targetSceneKey;
    this.gameId = data.gameId;
  }

  preload(): void {
    _th.logToAi('LoadingScene Started', SeverityLevel.Information, {
      gameId: this.gameId,
    });
    loadGameBundle(this, this.gameId);
    // Caption hints to the kid what they're waiting for. Exhaustive
    // switch per ADR-0011 — adding a new GameId without a case is a
    // compile error.
    let caption: string;
    switch (this.gameId) {
      case 'alien-shoot':
        caption = 'Loading Alien Shoot…';
        break;
      case 'asteroid-field':
        caption = 'Loading Asteroid Field…';
        break;
      case 'number-climb':
        caption = 'Loading Space Escape!…';
        break;
    }
    attachLoadingOverlay({ scene: this, caption });
  }

  create(): void {
    _th.logToAi('LoadingScene Completed', SeverityLevel.Information, {
      gameId: this.gameId,
    });
    // Hand off to the target game scene. Phaser's loader has already
    // populated every asset key, so the target scene's own preload()
    // (still wired with `loadGameBundle` as a safety net for any
    // direct-entry path) finds everything cached and `totalToLoad`
    // settles to 0, completing immediately.
    this.scene.start(this.targetSceneKey);
  }
}
