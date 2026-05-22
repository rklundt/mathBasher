// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';
import type { MathId, SpeedKey } from '@/core/config';
import { createObservable } from '@/services/observable';

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
export type GameId = 'alien-shoot' | 'asteroid-field' | 'number-climb';

export interface RoundSettings {
  gameId: GameId;
  mathId: MathId | null;
  speed: SpeedKey | null;
}

/**
 * Sprint 2.1.9 — observables (gameId, imageAsteroidsEnabled) consume
 * `createObservable<T>` (`src/services/observable.ts`) instead of
 * inline Set + try/catch + idempotence-guard plumbing. Same API
 * (subscribe-returning-unsubscribe + value-changes-fire-listeners
 * semantics) — only the wiring changes.
 *
 * `gameId` observable is the source of truth for game-mode dispatch
 * (BackgroundScene swaps backdrop, future scenes can react). Initial
 * value is `'alien-shoot'` — the default game when the page loads
 * before any tile click.
 *
 * `imageAsteroidsEnabled` observable: ON by default after the v2.1
 * playtest call. Stays in-memory; page reload resets to default.
 * AsteroidFieldScene subscribes to swap LIVE asteroid visuals when
 * the in-game Settings → Game → Asteroid Images toggle flips.
 */
const _gameId = createObservable<GameId>('gameId', 'alien-shoot');
const _imageAsteroidsEnabled = createObservable<boolean>('imageAsteroidsEnabled', true);

const state: Omit<RoundSettings, 'gameId'> = {
  mathId: null,
  speed: null,
};

export const Settings = {
  /**
   * Snapshot of the current selection. Read-only access for scenes.
   * `gameId` is sourced from the observable; `mathId` + `speed` from
   * the local state (they're not observable — read once at scene
   * `create` time, no reactive consumers today).
   */
  get round(): Readonly<RoundSettings> {
    return { gameId: _gameId.get(), mathId: state.mathId, speed: state.speed };
  },

  setGameId(id: GameId): void {
    const previous = _gameId.get();
    _gameId.set(id);
    // Telemetry fires only on real changes (observable.set is
    // idempotent). Log AFTER set so a listener throwing doesn't
    // suppress the audit-trail event.
    if (previous !== id) {
      _th.logToAi('Settings.setGameId', SeverityLevel.Information, { gameId: id });
    }
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
    return _imageAsteroidsEnabled.get();
  },

  setImageAsteroidsEnabled(enabled: boolean): void {
    const previous = _imageAsteroidsEnabled.get();
    _imageAsteroidsEnabled.set(enabled);
    if (previous !== enabled) {
      _th.logToAi('Settings.setImageAsteroidsEnabled', SeverityLevel.Information, {
        reason: enabled ? 'enabled' : 'disabled',
      });
    }
  },

  /**
   * Subscribe to image-asteroids toggle changes. Returns an
   * unsubscribe function — call it on scene shutdown so the listener
   * doesn't outlive the scene that owns it.
   */
  onImageAsteroidsChange(listener: (enabled: boolean) => void): () => void {
    return _imageAsteroidsEnabled.subscribe(listener);
  },

  /**
   * Subscribe to game-mode (`gameId`) changes. Returns an unsubscribe
   * function. Sprint 2.1.1 — `BackgroundScene` uses this to swap
   * gameplay backdrops when the player enters a different mode.
   * Persistent (BackgroundScene-lifetime) subscribers don't need to
   * unsubscribe; per-scene subscribers should call the returned
   * function on shutdown.
   */
  onGameIdChange(listener: (gameId: GameId) => void): () => void {
    return _gameId.subscribe(listener);
  },
};
