// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Stable string keys for every Phaser scene in the app. Use these constants
 * everywhere — never hand-write the string `'menu'` in a `scene.start(...)`
 * call, because a typo silently sends you nowhere.
 *
 * Two scenes run in PARALLEL with every other non-Boot scene:
 *  - `Background` (sprint 0.7 Story 6) — renders the nebula + parallax stars
 *    BEHIND everything else, providing the visual atmosphere
 *  - `Attribution` — renders the AGPL §7(b) footer ON TOP of everything
 *
 * The rest are mutually exclusive (one active at a time).
 */
export const SceneKeys = {
  Boot: 'boot',
  Background: 'background',
  Menu: 'menu',
  GameSelect: 'game-select',
  Difficulty: 'difficulty',
  /**
   * Alien Shoot — the original gameplay mode (4 lanes, aliens descend,
   * hero auto-runs side-to-side, tap to fire upward). Despite the
   * generic 'game' key, this is the SPECIFIC Alien Shoot mode; the key
   * predates Phase 2's introduction of multiple game modes (sprint 2.1)
   * and is kept for back-compat with all prior telemetry, scene
   * transitions, and bookmarks. New game modes get their own keys
   * (e.g. AsteroidField below).
   */
  Game: 'game',
  /**
   * Asteroid Field — sprint 2.1 second game mode. 4 asteroids drift
   * in 2D positions; hero rotates to aim + fires in aimed direction;
   * countdown timer per question.
   */
  AsteroidField: 'asteroid-field',
  /**
   * Number Climb — sprint 2.2 third game mode. Vertical climb; 10
   * floors; kid taps the correct rung at each floor. Difficulty
   * controls rung count (2/3/4); Speed controls cumulative timer
   * budget (250s/180s/120s). One mulligan per floor; second wrong
   * on same floor ends the round. Timer hitting 0 also ends the
   * round. Stars height-based (4/7/10).
   */
  NumberClimb: 'number-climb',
  /**
   * Loading intermediate (sprint 2.1.8) — sits between Difficulty and
   * the target game scene to render a visible progress bar during
   * the per-game asset load. Phaser's mid-session scene-transition
   * timing means a loading bar attached in the target scene's own
   * preload() doesn't paint visibly (canvas updates only after
   * create() runs). Putting the bar in a separate scene that's
   * already painting eliminates the apparent-hang playtest finding
   * from v2.1.6.
   */
  Loading: 'loading',
  Hud: 'hud',
  GameOver: 'game-over',
  Attribution: 'attribution',
  PauseOverlay: 'pause-overlay',
  Settings: 'settings',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
