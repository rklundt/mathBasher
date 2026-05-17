// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import type { Question } from '@/math/types';

/**
 * Contract every game-mode scene must satisfy so HudScene (and other
 * cross-cutting overlays like PauseOverlay) can interact with whichever
 * scene is currently running a round, regardless of game mode.
 *
 * Concrete implementations:
 *  - `GameScene` (Alien Shoot — the original)
 *  - `AsteroidFieldScene` (sprint 2.1, second game mode)
 *
 * Extracted in sprint 2.1 so HudScene's `getGameScene()` lookup can pass
 * the game scene's KEY in init data instead of hardcoding `SceneKeys.Game`.
 * Each game mode launches HudScene with its own scene key in
 * `HudSceneInit.gameSceneKey`; HudScene reads through that key to find
 * the active game scene by either Alien Shoot OR Asteroid Field.
 */
export interface GameSceneContract extends Phaser.Scene {
  /** Round paused (player pulled up the PauseOverlay)? */
  isPaused(): boolean;

  /** Pause the round. Idempotent. */
  pause(): void;

  /** Reverse pause. Idempotent. */
  resume(): void;

  /** Abandon the round + return to MenuScene. NO score saved. */
  quitToMenu(): void;

  /**
   * Snapshot of the in-flight question, used by HudScene to sync up
   * after its own create() runs (parallel-scene launch race condition —
   * HudScene's listener may bind AFTER the first questionStarted emit).
   * Returns null between rounds and after the last question.
   */
  getCurrentQuestionPayload(): { question: Question; index: number; total: number } | null;

  /**
   * Optional per-question countdown remaining (seconds, may be fractional).
   * Game modes that timeout per question (Asteroid Field) return a value;
   * game modes that don't (Alien Shoot, where the timeout is "aliens
   * reach the hero") return undefined. HudScene polls this each frame to
   * decide whether to render the countdown text + what number to show.
   */
  getCountdownSec?(): number | undefined;
}

/**
 * Init data passed to HudScene by whichever game-mode scene launches it.
 * `gameSceneKey` lets HudScene locate the active game scene via the
 * scene manager without knowing which mode is running.
 */
export interface HudSceneInit {
  /**
   * Scene key of the game-mode scene that launched this HUD. Used as
   * the lookup key for `this.scene.get(gameSceneKey)`. Defaults to
   * `SceneKeys.Game` if not provided (back-compat for any caller that
   * launches HudScene without init data, though there shouldn't be any).
   */
  gameSceneKey?: string;
}
