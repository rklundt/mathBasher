// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';
import type { MathId, SpeedKey } from '@/core/config';

/**
 * Cross-scene round selection state. The user picks `gameId` (which game
 * mode), `mathId` (Add to 10, etc.), and `speed` across multiple scenes;
 * this module is the single place that holds the in-flight choice
 * until a game scene reads it on `create`.
 *
 * Sprint 2.1: `gameId` was a bare string with `'alien-shoot'` as the only
 * value; widened to a `GameId` union when Asteroid Field landed. New game
 * modes add a literal to this union + a tile in GameSelectScene + a route
 * to the corresponding scene key.
 *
 * Deliberately a tiny module-level singleton — no event emitter, no
 * subscribers, no Zustand. Scenes read on `create`. If we ever need reactive
 * updates across scenes, we'll add that intentionally.
 */
export type GameId = 'alien-shoot' | 'asteroid-field';

export interface RoundSettings {
  gameId: GameId;
  mathId: MathId | null;
  speed: SpeedKey | null;
}

/**
 * Asteroid Field — visual mode toggle (sprint 2.1 playtest).
 * `true`  = Midjourney image-variant rocks (default after playtest
 *           round 2 — looks better in motion than the procedural
 *           polygons; toggle survived initial review).
 * `false` = procedural polygon asteroids (rollback path; user can
 *           flip via the in-game Settings → Game tab → Image Asteroids).
 *
 * Lives at module scope (NOT in `RoundSettings`) because it's a
 * persistent visual preference, not a per-round selection. Stays
 * in-memory only — page refresh resets to the default (true). If
 * a future playtest pass keeps this past sprint 2.1 close, a
 * localStorage persistence pass is the follow-up (use the
 * AudioManager's volume-persistence pattern).
 */
let _imageAsteroidsEnabled = true;

const state: RoundSettings = {
  gameId: 'alien-shoot',
  mathId: null,
  speed: null,
};

export const Settings = {
  /** Snapshot of the current selection. Read-only access for scenes. */
  get round(): Readonly<RoundSettings> {
    return state;
  },

  setGameId(id: GameId): void {
    state.gameId = id;
    _th.logToAi('Settings.setGameId', SeverityLevel.Information, { gameId: id });
  },

  setMathId(id: MathId): void {
    state.mathId = id;
    _th.logToAi('Settings.setMathId', SeverityLevel.Information, { mathId: id });
  },

  setSpeed(s: SpeedKey): void {
    state.speed = s;
    _th.logToAi('Settings.setSpeed', SeverityLevel.Information, { speed: s });
  },

  /** Clear math + speed selection (e.g. after a round completes). gameId persists. */
  reset(): void {
    state.mathId = null;
    state.speed = null;
    _th.logToAi('Settings.reset', SeverityLevel.Information);
  },

  /** True when both math and speed are picked — the Start button uses this. */
  isReady(): boolean {
    return state.mathId !== null && state.speed !== null;
  },

  // ----- Asteroid Field visual-mode toggle (sprint 2.1 playtest) -----

  /**
   * Whether to render asteroids as Midjourney image sprites (true) or
   * as procedural polygons (false, default). Read by `AsteroidWaveSystem`
   * at spawn time; not reactive — asteroids spawned BEFORE a toggle
   * change keep their original look until the next wave.
   */
  getImageAsteroidsEnabled(): boolean {
    return _imageAsteroidsEnabled;
  },

  setImageAsteroidsEnabled(enabled: boolean): void {
    _imageAsteroidsEnabled = enabled;
    _th.logToAi('Settings.setImageAsteroidsEnabled', SeverityLevel.Information, {
      reason: enabled ? 'enabled' : 'disabled',
    });
  },
};
