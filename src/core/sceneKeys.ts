// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { GameId } from '@/services/Settings';

/**
 * Stable string keys for every Phaser scene in the app. Use these constants
 * everywhere — never hand-write the string `'menu'` in a `scene.start(...)`
 * call, because a typo silently sends you nowhere.
 *
 * `Background` (sprint 0.7 Story 6) runs in PARALLEL with every other
 * non-Boot scene — it renders the nebula + parallax stars BEHIND
 * everything else, providing the visual atmosphere. The rest are
 * mutually exclusive (one active at a time).
 *
 * The AGPL §7(b) attribution footer used to be a parallel `Attribution`
 * scene rendered on top; sprint 2.5.2 moved it to a DOM element (see
 * `mountAttributionFooter`) laid out below the canvas, above the mobile
 * URL bar.
 */
export const SceneKeys = {
  Boot: 'boot',
  Background: 'background',
  /**
   * Sprint 2.5 story 4 — Hero Chooser. Full-screen scene showing the
   * 4 diverse hero options on first visit (before MenuScene). Once
   * the kid picks one, BootScene routes directly to Menu on
   * subsequent visits. The scene is also reachable mid-session
   * from a small avatar-tap in MenuScene's corner.
   */
  HeroChooser: 'hero-chooser',
  Menu: 'menu',
  GameSelect: 'game-select',
  Difficulty: 'difficulty',
  /**
   * Sprint 2.9 — "Pick your challenge!": subject (Math) → challenge type.
   * Opens on the first Start of a visit and from the challenge chip, Game
   * Over and (as a card inside) Pause.
   */
  ChallengePicker: 'challenge-picker',
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
   * Number Climb — sprint 2.2 third game mode. Vertical climb; 12
   * floors; kid taps the correct rung at each floor. Difficulty
   * controls rung count (2/3/4); Speed controls cumulative timer
   * budget (300s/216s/144s since sprint 2.6.1: the shared per-question
   * base × the floors). 3 cumulative lives (sprint 2.5.2 — every
   * wrong pick costs a life; round ends when all 3 are spent or the
   * timer hits 0). Stars height-based.
   */
  NumberClimb: 'number-climb',
  /**
   * Math-a-lotl — sprint 2.5.4 fourth game mode. Underwater: answer
   * bubbles rise from the sea floor; the kid taps the right one and
   * the axolotl swims over to catch it. 3 round-wide hearts; a right
   * bubble that escapes to the surface just re-spawns the wave.
   */
  MathALotl: 'math-a-lotl',
  /**
   * Frog Splash — sprint 2.5.6 fifth game mode. A frog hops up a river
   * one row of drifting lily pads per question (12 rows); a wrong pad
   * sinks, a timeout or splash costs one of 3 lives, the same question
   * comes back with fresh pads.
   */
  FrogSplash: 'frog-splash',
  /**
   * Space Shooter — sprint 2.6 sixth game mode. First-person cockpit: alien
   * ships carrying the answers fly around the window; tap the right one.
   * A wrong ship or a timeout costs one of 3 lives.
   */
  SpaceShooter: 'space-shooter',
  /**
   * Penguin Slide — sprint 2.7 seventh game mode. A penguin sledges down a
   * snowy hill; tap the fish with the right answer. A wrong fish is a
   * snowball (BONK) and a time-out a tumble; each costs one of 3 lives.
   */
  PenguinSlide: 'penguin-slide',
  /**
   * Bunny Garden — sprint 2.8 eighth game mode. A bunny pulls up the carrot
   * with the right answer; a wrong hole has a mole, and the carrots sinking
   * back into their holes is the countdown. Each miss costs one of 3 lives.
   */
  BunnyGarden: 'bunny-garden',
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
  // Attribution scene retired in sprint 2.5.2 — the AGPL §7(b) footer is
  // now a DOM element (see mountAttributionFooter) below the canvas.
  PauseOverlay: 'pause-overlay',
  Settings: 'settings',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];

/**
 * Map a GameId to its game scene key. Exhaustive switch so adding a
 * fourth game mode is a TypeScript error here until the new case is
 * filled in (ADR-0011's per-game-mode dispatch pattern).
 *
 * Used by DifficultyScene (to pick which scene to launch via LoadingScene)
 * and GameOverScene (to route "Play Again" back to the matching mode).
 * Was originally inlined in DifficultyScene; lifted to this shared module
 * in sprint 2.2 after the Climb "Play Again routes to Alien Shoot" bug
 * showed the second call site had silently drifted.
 */
export function gameSceneKeyFor(gameId: GameId): SceneKey {
  switch (gameId) {
    case 'alien-shoot':
      return SceneKeys.Game;
    case 'asteroid-field':
      return SceneKeys.AsteroidField;
    case 'number-climb':
      return SceneKeys.NumberClimb;
    case 'math-a-lotl':
      return SceneKeys.MathALotl;
    case 'frog-splash':
      return SceneKeys.FrogSplash;
    case 'space-shooter':
      return SceneKeys.SpaceShooter;
    case 'penguin-slide':
      return SceneKeys.PenguinSlide;
    case 'bunny-garden':
      return SceneKeys.BunnyGarden;
  }
}
