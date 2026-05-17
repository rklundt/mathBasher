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
};
