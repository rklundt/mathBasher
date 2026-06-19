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

  /**
   * Total questions / floors in this round. Sprint 2.2 story 15a —
   * HudScene reads this at create() time so the initial "Q: 0/N"
   * counter text and the progress-dots row use the right per-mode
   * count (Number Climb = 10; Alien Shoot + Asteroid Field = 20).
   * Implementations delegate to `roundController.questionsPerRound`,
   * which already carries any per-mode override.
   */
  getQuestionsPerRound(): number;

  /**
   * Sprint 2.4.1 story 1 — climb-wide "lives" remaining (max minus
   * strikes used). Number Climb returns a number; other game modes
   * return undefined (no lives system there). HudScene reads at
   * create() to decide whether to build the lives row, then keeps
   * it in sync via the game scene's `strikesChanged` event.
   *
   * **Co-required with `getMaxStrikes`.** A scene that implements
   * one without the other will silently break the HUD's lives row
   * (HudScene reads `getMaxStrikes` to size the row + reads
   * `getStrikesRemaining` to paint state; the two MUST stay in
   * sync). Implementations so far: NumberClimb (story 1) +
   * AsteroidField (story 2, sprint-2.4.1-audit-fix).
   */
  getStrikesRemaining?(): number | undefined;

  /**
   * Sprint 2.4.1 story 1 — climb-wide "lives" cap (e.g. 3). Returned
   * alongside `getStrikesRemaining` so HudScene knows how many slots
   * to draw. Number Climb returns the configured max; other modes
   * return undefined.
   *
   * **Co-required with `getStrikesRemaining`** — see note above.
   */
  getMaxStrikes?(): number | undefined;
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
